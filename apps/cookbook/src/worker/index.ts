import { Hono } from "hono";
import { userEmail } from "@family-tools/ui";
import { importRecipe } from "./importer";
import { recipeInputSchema, type RecipeInput } from "./schema";

interface RecipeRow {
  id: number;
  title: string;
  instructions_md: string | null;
  cook_minutes: number | null;
  servings: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  rating: number | null;
  source_url: string | null;
  image_url: string | null;
  notes: string | null;
  last_cooked_at: string | null;
  created_at: string;
  created_by: string | null;
}

interface IngredientRow {
  id: number;
  recipe_id: number;
  position: number;
  name: string;
  qty: number | null;
  unit: "g" | "ml" | "tsp" | "tbsp" | null;
  original: string;
  conversion_note: string | null;
}

interface ShoppingListBinding {
  addItems(
    items: { name: string; qty: number | null; unit: string | null }[],
    source: { kind: "recipe"; id: number; title: string },
  ): Promise<{ added: number }>;
}

function apiRecipe(row: RecipeRow) {
  return {
    id: row.id,
    title: row.title,
    instructionsMd: row.instructions_md,
    cookMinutes: row.cook_minutes,
    servings: row.servings,
    difficulty: row.difficulty,
    rating: row.rating,
    sourceUrl: row.source_url,
    imageUrl: row.image_url,
    notes: row.notes,
    lastCookedAt: row.last_cooked_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function apiIngredient(row: IngredientRow) {
  return {
    id: row.id, name: row.name, qty: row.qty, unit: row.unit,
    original: row.original, conversionNote: row.conversion_note,
  };
}

function sanitiseBody(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  if (record.rating !== null && record.rating !== undefined) {
    const rating = Number(record.rating);
    record.rating = Number.isFinite(rating) ? Math.min(5, Math.max(1, Math.round(rating))) : record.rating;
  }
  for (const key of ["cookMinutes", "servings"]) {
    if (record[key] !== null && record[key] !== undefined && record[key] !== "") record[key] = Number(record[key]);
    if (record[key] === "") record[key] = null;
  }
  if (Array.isArray(record.ingredients)) {
    record.ingredients = record.ingredients.map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return item;
      const ingredient = { ...(item as Record<string, unknown>) };
      if (ingredient.qty === "" || ingredient.qty === undefined) ingredient.qty = null;
      else if (ingredient.qty !== null) ingredient.qty = Number(ingredient.qty);
      if (ingredient.unit === "") ingredient.unit = null;
      return ingredient;
    });
  }
  return record;
}

async function parseRecipeBody(request: Request, base?: RecipeInput): Promise<{ data?: RecipeInput; error?: string }> {
  let raw: unknown;
  try { raw = await request.json(); } catch { return { error: "Invalid JSON payload." }; }
  const combined = base && typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? { ...base, ...(raw as Record<string, unknown>) }
    : raw;
  const parsed = recipeInputSchema.safeParse(sanitiseBody(combined));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid recipe." };
  return { data: parsed.data };
}

async function foreignKeys(db: D1Database): Promise<void> {
  await db.prepare("PRAGMA foreign_keys = ON").run();
}

async function fullRecipe(db: D1Database, id: number) {
  const row = await db.prepare("SELECT * FROM recipes WHERE id = ?1").bind(id).first<RecipeRow>();
  if (!row) return null;
  const [ingredients, tags] = await Promise.all([
    db.prepare("SELECT * FROM ingredients WHERE recipe_id = ?1 ORDER BY position").bind(id).all<IngredientRow>(),
    db.prepare("SELECT tag FROM tags WHERE recipe_id = ?1 ORDER BY tag COLLATE NOCASE").bind(id).all<{ tag: string }>(),
  ]);
  return { ...apiRecipe(row), ingredients: ingredients.results.map(apiIngredient), tags: tags.results.map((tag) => tag.tag) };
}

async function replaceChildren(db: D1Database, id: number, recipe: RecipeInput): Promise<void> {
  const statements = [
    db.prepare("DELETE FROM ingredients WHERE recipe_id = ?1").bind(id),
    db.prepare("DELETE FROM tags WHERE recipe_id = ?1").bind(id),
    ...recipe.ingredients.map((ingredient, index) => db.prepare(
      `INSERT INTO ingredients(recipe_id, position, name, qty, unit, original, conversion_note)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(id, index, ingredient.name, ingredient.qty, ingredient.unit, ingredient.original, ingredient.conversionNote ?? null)),
    ...[...new Set(recipe.tags.map((tag) => tag.toLocaleLowerCase()))].map((tag) => db.prepare(
      "INSERT INTO tags(recipe_id, tag) VALUES (?1, ?2)",
    ).bind(id, tag)),
  ];
  await db.batch(statements);
}

const app = new Hono<{ Bindings: Env }>().basePath("/cookbook");

app.get("/api/recipes", async (c) => {
  const where: string[] = [];
  const values: (string | number)[] = [];
  const bind = (value: string | number) => { values.push(value); return `?${values.length}`; };
  const query = c.req.query("q")?.trim();
  const tag = c.req.query("tag")?.trim().toLocaleLowerCase();
  if (query) where.push(`(r.title LIKE ${bind(`%${query.slice(0, 100)}%`)} OR r.notes LIKE ${bind(`%${query.slice(0, 100)}%`)})`);
  if (tag) where.push(`EXISTS (SELECT 1 FROM tags t WHERE t.recipe_id = r.id AND t.tag = ${bind(tag.slice(0, 40))})`);
  if (c.req.query("unrated") === "1") where.push("r.rating IS NULL");
  if (c.req.query("stale") === "1") where.push("(r.last_cooked_at IS NULL OR r.last_cooked_at < datetime('now', '-30 days'))");
  const sort = c.req.query("sort");
  const order = sort === "title" ? "r.title COLLATE NOCASE" : sort === "newest" ? "r.created_at DESC" : "r.last_cooked_at IS NOT NULL, r.last_cooked_at ASC, r.title COLLATE NOCASE";
  let statement = c.env.COOKBOOK.prepare(
    `SELECT r.*, (SELECT COUNT(*) FROM ingredients i WHERE i.recipe_id = r.id) ingredient_count,
       (SELECT group_concat(tag, ', ') FROM tags t WHERE t.recipe_id = r.id) tag_list
     FROM recipes r ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order}`,
  );
  if (values.length) statement = statement.bind(...values);
  const { results } = await statement.all<RecipeRow & { ingredient_count: number; tag_list: string | null }>();
  return c.json({ recipes: results.map((row) => ({ ...apiRecipe(row), ingredientCount: row.ingredient_count, tags: row.tag_list?.split(", ") ?? [] })) });
});

app.get("/api/recipes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: "Invalid recipe id." }, 400);
  const recipe = await fullRecipe(c.env.COOKBOOK, id);
  return recipe ? c.json({ recipe }) : c.json({ error: "Recipe not found." }, 404);
});

app.post("/api/recipes", async (c) => {
  const parsed = await parseRecipeBody(c.req.raw);
  if (!parsed.data) return c.json({ error: parsed.error }, 400);
  await foreignKeys(c.env.COOKBOOK);
  const recipe = parsed.data;
  const created = await c.env.COOKBOOK.prepare(
    `INSERT INTO recipes(title, instructions_md, cook_minutes, servings, difficulty, rating, source_url, image_url, notes, created_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
  ).bind(
    recipe.title, recipe.instructionsMd ?? null, recipe.cookMinutes ?? null, recipe.servings ?? null,
    recipe.difficulty ?? null, recipe.rating ?? null, recipe.sourceUrl ?? null, recipe.imageUrl ?? null,
    recipe.notes ?? null, userEmail(c.req.raw),
  ).run();
  const id = Number(created.meta.last_row_id);
  try { await replaceChildren(c.env.COOKBOOK, id, recipe); }
  catch (error) {
    await c.env.COOKBOOK.prepare("DELETE FROM recipes WHERE id = ?1").bind(id).run();
    throw error;
  }
  return c.json({ recipe: await fullRecipe(c.env.COOKBOOK, id) }, 201);
});

app.patch("/api/recipes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: "Invalid recipe id." }, 400);
  const existing = await fullRecipe(c.env.COOKBOOK, id);
  if (!existing) return c.json({ error: "Recipe not found." }, 404);
  const parsed = await parseRecipeBody(c.req.raw, existing);
  if (!parsed.data) return c.json({ error: parsed.error }, 400);
  await foreignKeys(c.env.COOKBOOK);
  const recipe = parsed.data;
  await c.env.COOKBOOK.prepare(
    `UPDATE recipes SET title=?1, instructions_md=?2, cook_minutes=?3, servings=?4, difficulty=?5,
       rating=?6, source_url=?7, image_url=?8, notes=?9 WHERE id=?10`,
  ).bind(
    recipe.title, recipe.instructionsMd ?? null, recipe.cookMinutes ?? null, recipe.servings ?? null,
    recipe.difficulty ?? null, recipe.rating ?? null, recipe.sourceUrl ?? null, recipe.imageUrl ?? null,
    recipe.notes ?? null, id,
  ).run();
  await replaceChildren(c.env.COOKBOOK, id, recipe);
  return c.json({ recipe: await fullRecipe(c.env.COOKBOOK, id) });
});

app.delete("/api/recipes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: "Invalid recipe id." }, 400);
  await foreignKeys(c.env.COOKBOOK);
  const result = await c.env.COOKBOOK.prepare("DELETE FROM recipes WHERE id = ?1").bind(id).run();
  return result.meta.changes ? c.json({ deleted: true }) : c.json({ error: "Recipe not found." }, 404);
});

app.post("/api/recipes/:id/cooked", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: "Invalid recipe id." }, 400);
  const result = await c.env.COOKBOOK.prepare("UPDATE recipes SET last_cooked_at = datetime('now') WHERE id = ?1").bind(id).run();
  return result.meta.changes ? c.json({ cookedAt: new Date().toISOString() }) : c.json({ error: "Recipe not found." }, 404);
});

app.post("/api/recipes/:id/to-list", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: "Invalid recipe id." }, 400);
  const recipe = await fullRecipe(c.env.COOKBOOK, id);
  if (!recipe) return c.json({ error: "Recipe not found." }, 404);
  // Wrangler currently generates a generic Service for named entrypoints in a
  // sibling config, so keep the RPC contract explicit and colocated with use.
  const listApp = c.env.LIST_APP as typeof c.env.LIST_APP & ShoppingListBinding;
  const result = await listApp.addItems(
    recipe.ingredients.map((ingredient) => ({ name: ingredient.name, qty: ingredient.qty, unit: ingredient.unit })),
    { kind: "recipe", id, title: recipe.title },
  );
  return c.json(result);
});

app.post("/api/import", async (c) => {
  let body: { url?: unknown; text?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON payload." }, 400); }
  try {
    const draft = await importRecipe(c.env, {
      url: typeof body.url === "string" ? body.url.trim().slice(0, 2_000) : undefined,
      text: typeof body.text === "string" ? body.text.slice(0, 180_000) : undefined,
    });
    return c.json({ draft });
  } catch (error) {
    console.error(JSON.stringify({ event: "recipe_import_failed", error: error instanceof Error ? error.message : String(error) }));
    return c.json({ error: error instanceof Error ? error.message : "Recipe import failed.", manualFallback: true }, 422);
  }
});

app.post("/share", async (c) => {
  let sharedUrl = "";
  try {
    const form = await c.req.formData();
    const url = form.get("url");
    const text = form.get("text");
    if (typeof url === "string") sharedUrl = url.trim();
    if (!sharedUrl && typeof text === "string") sharedUrl = /https?:\/\/[^\s]+/.exec(text)?.[0] ?? "";
  } catch { /* An expired Access session can produce an empty share. */ }
  const target = new URL("/cookbook/", c.req.url);
  if (sharedUrl) target.searchParams.set("import", sharedUrl.slice(0, 2_000));
  else target.searchParams.set("share", "empty");
  return c.redirect(target.toString(), 303);
});

app.get("*", async (c) => {
  if (!c.req.header("accept")?.includes("text/html")) {
    return c.text(`No asset at ${new URL(c.req.url).pathname}`, 404);
  }
  return c.env.ASSETS.fetch(new Request(new URL("/cookbook/", c.req.url)));
});

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
