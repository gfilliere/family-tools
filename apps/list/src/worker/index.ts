import { WorkerEntrypoint } from "cloudflare:workers";
import { Hono } from "hono";
import { userEmail } from "@family-tools/ui";
import { AISLES, isAisle, rebindLine, type Aisle, type ResolvedLine } from "@family-tools/pantry";
import { describeUnknownIngredients } from "./ai";
import { buildCards, cardsToText, type Card, type ItemRow, type Resolved } from "./cards";
import { Knowledge, measureFromUnit, type Hints } from "./knowledge";

export interface ShoppingItemInput {
  name: string;
  canonicalName?: string | null;
  original?: string | null;
  qty: number | null;
  unit: string | null;
  aisle?: string | null;
}

export interface ItemSource {
  kind: "recipe";
  id: number;
  title: string;
}

const MAX_NAME = 160;
const MAX_TEXT = 300;
const ITEM_COLUMNS = `id, name, display_name, ingredient_id, canonical_name, original, qty, unit, base_qty, base_unit, aisle, flags,
  checked_at, source_kind, source_id, source_title, added_at`;

function clip(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function cleanInput(input: ShoppingItemInput): Hints {
  const name = clip(input.name, MAX_NAME);
  const original = clip(input.original, MAX_TEXT);
  if (!name && !original) throw new Error("Every item needs a name.");
  if (input.qty !== null && input.qty !== undefined && (!Number.isFinite(input.qty) || input.qty <= 0)) {
    throw new Error(`Invalid quantity for ${name ?? original}.`);
  }
  return {
    name,
    original,
    canonicalName: clip(input.canonicalName, MAX_NAME),
    qty: input.qty ?? null,
    unit: clip(input.unit, 24),
    aisle: isAisle(input.aisle) ? input.aisle : null,
  };
}

interface PendingLine {
  hints: Hints;
  line: ResolvedLine;
}

async function resolveUnknowns(env: Env, knowledge: Knowledge, pending: PendingLine[]): Promise<void> {
  const unknown = pending.filter((item) => !item.line.entry);
  if (!unknown.length) return;
  const byName = new Map<string, PendingLine[]>();
  for (const item of unknown) {
    const key = item.line.name.toLocaleLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  const described = "AI" in env && env.AI ? await describeUnknownIngredients(env, [...byName.keys()]) : [];
  const answers = new Map(described.map((item) => [item.sourceName.toLocaleLowerCase(), item]));

  for (const [key, items] of byName) {
    const answer = answers.get(key);
    const first = items[0];
    if (!first) continue;
    const aliasTexts = [...new Set(items.flatMap((item) => [item.hints.name, item.line.parsed.name, item.hints.canonicalName].filter((v): v is string => Boolean(v))))];
    let entry = answer?.catalogId ? knowledge.entry(answer.catalogId) : null;
    if (entry && !entry.skip) {
      for (const alias of aliasTexts) await knowledge.learnAlias(alias, entry.id);
    } else {
      entry = await knowledge.createCustom({
        name: answer?.name ?? first.line.name.toLocaleLowerCase().slice(0, 80),
        aisle: answer?.aisle ?? first.hints.aisle ?? "Other",
        measure: answer?.measure ?? measureFromUnit(first.line.unit),
        staple: answer?.staple ?? false,
        density: answer?.density ?? null,
        pieceGrams: answer?.pieceGrams ?? null,
        pieceUnit: answer?.pieceUnit ?? null,
      }, aliasTexts);
    }
    for (const item of items) item.line = rebindLine(item.line, entry);
  }
}

async function insertItems(
  env: Env,
  rawItems: ShoppingItemInput[],
  source: ItemSource | null,
  addedBy: string | null,
): Promise<{ added: number; skipped: number }> {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 100) {
    throw new Error("Add between 1 and 100 items at a time.");
  }
  const knowledge = await Knowledge.load(env.LIST);
  const pending: PendingLine[] = [];
  for (const raw of rawItems) {
    const hints = cleanInput(raw);
    for (const line of knowledge.resolve(hints)) pending.push({ hints, line });
  }
  await resolveUnknowns(env, knowledge, pending);

  const statements: D1PreparedStatement[] = [];
  let skipped = 0;
  for (const { hints, line } of pending) {
    const entry = line.entry;
    if (!entry || entry.skip) { skipped += 1; continue; }
    const { aisle } = knowledge.effective(entry);
    const shopping = line.shopping;
    const flags = JSON.stringify(line.flags);
    statements.push(env.LIST.prepare(
      `INSERT INTO items(name, display_name, ingredient_id, canonical_name, original, qty, unit, base_qty, base_unit, aisle, flags,
         source_kind, source_id, source_title, added_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
    ).bind(
      (hints.name ?? line.parsed.name ?? hints.original ?? entry.name).slice(0, MAX_NAME),
      entry.generic ? line.parsed.name.toLocaleLowerCase().slice(0, MAX_NAME) || entry.name : entry.name,
      entry.id, entry.name, hints.original ?? null,
      line.qty, line.unit, shopping?.qty ?? null, shopping?.unit ?? null, aisle, flags,
      source?.kind ?? "manual", source?.id ?? null, source?.title?.trim().slice(0, 200) ?? null, addedBy,
    ));
  }
  if (statements.length) await env.LIST.batch(statements);
  return { added: statements.length, skipped };
}

async function openRows(db: D1Database, includeChecked = true): Promise<ItemRow[]> {
  const { results } = await db.prepare(
    `SELECT ${ITEM_COLUMNS} FROM items ${includeChecked ? "" : "WHERE checked_at IS NULL"} ORDER BY added_at DESC, id DESC`,
  ).all<ItemRow>();
  return results;
}

/** Rows written before the catalog existed carry no ingredient id. Resolve them once and remember. */
async function adoptLegacyRows(env: Env, knowledge: Knowledge, rows: ItemRow[]): Promise<void> {
  const legacy = rows.filter((row) => !row.ingredient_id);
  if (!legacy.length) return;
  const pending = legacy.map((row) => ({
    row,
    hints: {
      name: row.name.split(" / ")[0] ?? row.name, canonicalName: row.canonical_name, qty: row.qty, unit: row.unit,
      aisle: isAisle(row.aisle) ? row.aisle : null,
    } satisfies Hints,
  })).map((item) => ({ ...item, line: knowledge.resolve(item.hints)[0] }))
    .filter((item): item is typeof item & { line: ResolvedLine } => Boolean(item.line));
  await resolveUnknowns(env, knowledge, pending);
  const updates = pending.flatMap(({ row, line }) => {
    const entry = line.entry;
    if (!entry) return [];
    row.ingredient_id = entry.id;
    row.display_name = entry.name;
    row.base_qty = line.shopping?.qty ?? null;
    row.base_unit = line.shopping?.unit ?? null;
    return [env.LIST.prepare(
      "UPDATE items SET ingredient_id = ?1, display_name = ?2, base_qty = ?3, base_unit = ?4 WHERE id = ?5",
    ).bind(entry.id, entry.name, row.base_qty, row.base_unit, row.id)];
  });
  if (updates.length) await env.LIST.batch(updates);
}

function lookupWith(knowledge: Knowledge): (id: string | null) => Resolved | null {
  return (id) => {
    const entry = knowledge.entry(id);
    if (!entry) return null;
    return { entry, ...knowledge.effective(entry) };
  };
}

async function loadCards(env: Env): Promise<{ cards: Card[]; knowledge: Knowledge }> {
  const knowledge = await Knowledge.load(env.LIST);
  const rows = await openRows(env.LIST);
  await adoptLegacyRows(env, knowledge, rows);
  return { cards: buildCards(rows, lookupWith(knowledge)), knowledge };
}

function recipesFrom(cards: Card[]): { id: number | null; title: string; open: number }[] {
  const recipes = new Map<string, { id: number | null; title: string; open: number }>();
  for (const card of cards) {
    for (const part of card.parts) {
      if (part.sourceKind !== "recipe" || !part.sourceTitle) continue;
      const key = `${part.sourceId ?? ""}:${part.sourceTitle}`;
      const entry = recipes.get(key) ?? { id: part.sourceId, title: part.sourceTitle, open: 0 };
      if (!part.checked) entry.open += 1;
      recipes.set(key, entry);
    }
  }
  return [...recipes.values()].toSorted((a, b) => a.title.localeCompare(b.title));
}

export class ShoppingList extends WorkerEntrypoint<Env> {
  async addItems(items: ShoppingItemInput[], source: ItemSource): Promise<{ added: number; skipped: number }> {
    if (source?.kind !== "recipe" || !Number.isInteger(source.id) || !source.title?.trim()) {
      throw new Error("Invalid recipe source.");
    }
    return insertItems(this.env, items, { ...source, title: source.title.trim().slice(0, 200) }, null);
  }
}

const app = new Hono<{ Bindings: Env }>().basePath("/list");

function badRequest(c: { json: (body: unknown, status: 400) => Response }, message: string): Response {
  return c.json({ error: message }, 400);
}

async function body<T>(c: { req: { json: () => Promise<unknown> } }): Promise<T | null> {
  try { return await c.req.json() as T; } catch { return null; }
}

app.get("/api/items", async (c) => {
  const { cards } = await loadCards(c.env);
  return c.json({ cards, recipes: recipesFrom(cards), aisles: AISLES });
});

app.get("/api/items.txt", async (c) => {
  const { cards } = await loadCards(c.env);
  return c.text(cardsToText(cards));
});

app.post("/api/items", async (c) => {
  const payload = await body<{ text?: unknown; name?: unknown; qty?: unknown; unit?: unknown }>(c);
  if (!payload) return badRequest(c, "Invalid JSON payload.");
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const items: ShoppingItemInput[] = text
    ? text.split(/\n|;/).map((line) => line.trim()).filter(Boolean).map((line) => ({ name: line, original: line, qty: null, unit: null }))
    : [{
      name: typeof payload.name === "string" ? payload.name : "",
      qty: payload.qty === null || payload.qty === undefined ? null : Number(payload.qty),
      unit: typeof payload.unit === "string" ? payload.unit : null,
    }];
  try {
    return c.json(await insertItems(c.env, items, null, userEmail(c.req.raw)), 201);
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : "Could not add item.");
  }
});

app.patch("/api/items/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return badRequest(c, "Invalid item id.");
  const payload = await body<{ checked?: unknown }>(c);
  if (!payload || typeof payload.checked !== "boolean") return badRequest(c, "checked must be a boolean.");
  const result = await c.env.LIST.prepare(
    "UPDATE items SET checked_at = CASE WHEN ?1 = 1 THEN datetime('now') ELSE NULL END WHERE id = ?2",
  ).bind(payload.checked ? 1 : 0, id).run();
  return result.meta.changes ? c.json({ updated: true }) : c.json({ error: "Item not found." }, 404);
});

app.delete("/api/items/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return badRequest(c, "Invalid item id.");
  const result = await c.env.LIST.prepare("DELETE FROM items WHERE id = ?1").bind(id).run();
  return result.meta.changes ? c.json({ deleted: true }) : c.json({ error: "Item not found." }, 404);
});

interface CardPatch {
  checked?: unknown;
  aisle?: unknown;
  staple?: unknown;
  ingredientId?: unknown;
  name?: unknown;
}

app.patch("/api/cards/:key", async (c) => {
  const key = decodeURIComponent(c.req.param("key"));
  const payload = await body<CardPatch>(c);
  if (!payload) return badRequest(c, "Invalid JSON payload.");
  const { cards, knowledge } = await loadCards(c.env);
  const card = cards.find((item) => item.key === key);
  if (!card) return c.json({ error: "Card not found." }, 404);
  const ids = card.parts.map((part) => part.id);
  const marks = ids.map((_, index) => `?${index + 1}`).join(", ");

  if (typeof payload.checked === "boolean") {
    await c.env.LIST.prepare(
      `UPDATE items SET checked_at = CASE WHEN ${payload.checked ? "1" : "0"} = 1 THEN datetime('now') ELSE NULL END WHERE id IN (${marks})`,
    ).bind(...ids).run();
  }
  if (payload.aisle !== undefined) {
    if (payload.aisle !== null && !isAisle(payload.aisle)) return badRequest(c, "Unknown aisle.");
    await knowledge.setOverride(card.ingredientId, { aisle: payload.aisle as Aisle | null });
  }
  if (payload.staple !== undefined) {
    if (payload.staple !== null && typeof payload.staple !== "boolean") return badRequest(c, "staple must be a boolean.");
    await knowledge.setOverride(card.ingredientId, { staple: payload.staple as boolean | null });
  }
  if (typeof payload.name === "string" && payload.name.trim() && card.custom) {
    const name = payload.name.trim().slice(0, 80);
    await knowledge.renameCustom(card.ingredientId, name);
    const shifted = ids.map((_, index) => `?${index + 2}`).join(", ");
    await c.env.LIST.prepare(`UPDATE items SET display_name = ?1, canonical_name = ?1 WHERE id IN (${shifted})`).bind(name, ...ids).run();
  }
  if (typeof payload.ingredientId === "string") {
    const target = knowledge.entry(payload.ingredientId);
    if (!target || target.skip) return badRequest(c, "Unknown ingredient.");
    // Remember every spelling on this card, then move the lines and recompute their buying amounts.
    const rows = (await c.env.LIST.prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE id IN (${marks})`).bind(...ids).all<ItemRow>()).results;
    const updates: D1PreparedStatement[] = [];
    for (const row of rows) {
      for (const text of [row.name, row.canonical_name]) if (text) await knowledge.learnAlias(text, target.id);
      const [line] = knowledge.resolve({ name: row.name, original: row.original, qty: row.qty, unit: row.unit });
      const shopping = line?.entry?.id === target.id ? line.shopping : null;
      updates.push(c.env.LIST.prepare(
        "UPDATE items SET ingredient_id = ?1, display_name = ?2, canonical_name = ?2, base_qty = ?3, base_unit = ?4, aisle = ?5 WHERE id = ?6",
      ).bind(target.id, target.name, shopping?.qty ?? null, shopping?.unit ?? null, knowledge.effective(target).aisle, row.id));
    }
    if (updates.length) await c.env.LIST.batch(updates);
  }
  return c.json({ updated: true });
});

app.delete("/api/cards/:key", async (c) => {
  const key = decodeURIComponent(c.req.param("key"));
  const { cards } = await loadCards(c.env);
  const card = cards.find((item) => item.key === key);
  if (!card) return c.json({ error: "Card not found." }, 404);
  const ids = card.parts.map((part) => part.id);
  await c.env.LIST.prepare(`DELETE FROM items WHERE id IN (${ids.map((_, index) => `?${index + 1}`).join(", ")})`).bind(...ids).run();
  return c.json({ deleted: ids.length });
});

app.delete("/api/recipes", async (c) => {
  const title = c.req.query("title")?.trim();
  const id = Number(c.req.query("id"));
  if (!title && !Number.isInteger(id)) return badRequest(c, "Give a recipe id or title.");
  const result = Number.isInteger(id) && id > 0
    ? await c.env.LIST.prepare("DELETE FROM items WHERE checked_at IS NULL AND source_kind = 'recipe' AND source_id = ?1").bind(id).run()
    : await c.env.LIST.prepare("DELETE FROM items WHERE checked_at IS NULL AND source_kind = 'recipe' AND source_title = ?1").bind(title).run();
  return c.json({ deleted: result.meta.changes });
});

app.delete("/api/checked", async (c) => {
  const result = await c.env.LIST.prepare("DELETE FROM items WHERE checked_at IS NOT NULL").run();
  return c.json({ deleted: result.meta.changes });
});

app.get("/api/ingredients", async (c) => {
  const query = c.req.query("q")?.trim() ?? "";
  const knowledge = await Knowledge.load(c.env.LIST);
  return c.json({
    ingredients: knowledge.search(query).map((entry) => ({
      id: entry.id, name: entry.name, ...knowledge.effective(entry), measure: entry.measure,
    })),
  });
});

app.get("*", async (c) => {
  if (!c.req.header("accept")?.includes("text/html")) {
    return c.text(`No asset at ${new URL(c.req.url).pathname}`, 404);
  }
  return c.env.ASSETS.fetch(new Request(new URL("/list/", c.req.url)));
});

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;

