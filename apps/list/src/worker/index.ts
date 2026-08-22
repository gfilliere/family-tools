import { WorkerEntrypoint } from "cloudflare:workers";
import { Hono } from "hono";
import { userEmail } from "@family-tools/ui";

const AISLES = [
  "Produce", "Dairy & Eggs", "Meat & Seafood", "Bakery", "Pantry",
  "Spices", "Frozen", "Beverages", "Household", "Other",
] as const;
type Aisle = (typeof AISLES)[number];

export interface ShoppingItemInput {
  name: string;
  qty: number | null;
  unit: string | null;
  aisle?: string | null;
}

export interface ItemSource {
  kind: "recipe";
  id: number;
  title: string;
}

interface ItemRow {
  id: number;
  name: string;
  qty: number | null;
  unit: string | null;
  aisle: string;
  checked_at: string | null;
  source_kind: "manual" | "recipe";
  source_id: number | null;
  source_title: string | null;
  added_at: string;
}

const MAX_NAME = 160;
const MAX_UNIT = 24;

export function normaliseName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ").replace(/s$/, "");
}

function cleanItem(input: ShoppingItemInput): ShoppingItemInput {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, MAX_NAME) : "";
  if (!name) throw new Error("Every item needs a name.");
  if (input.qty !== null && (!Number.isFinite(input.qty) || input.qty <= 0)) {
    throw new Error(`Invalid quantity for ${name}.`);
  }
  const unit = typeof input.unit === "string" && input.unit.trim()
    ? input.unit.trim().slice(0, MAX_UNIT)
    : null;
  return { name, qty: input.qty, unit, aisle: input.aisle ?? null };
}

function knownAisle(name: string): Aisle {
  const n = normaliseName(name);
  if (/onion|garlic|apple|banana|tomato|potato|carrot|lettuce|lemon|lime|pepper/.test(n)) return "Produce";
  if (/milk|cream|cheese|yogurt|butter|egg/.test(n)) return "Dairy & Eggs";
  if (/chicken|beef|pork|lamb|fish|salmon|shrimp/.test(n)) return "Meat & Seafood";
  if (/bread|bagel|roll|croissant/.test(n)) return "Bakery";
  if (/salt|spice|paprika|cumin|cinnamon|oregano|basil|thyme/.test(n)) return "Spices";
  if (/frozen|ice cream/.test(n)) return "Frozen";
  if (/water|juice|coffee|tea|beer|wine/.test(n)) return "Beverages";
  if (/soap|detergent|paper|foil|cleaner|bag/.test(n)) return "Household";
  if (/flour|sugar|rice|pasta|oil|vinegar|bean|lentil|stock|cocoa/.test(n)) return "Pantry";
  return "Other";
}

async function classify(db: D1Database, item: ShoppingItemInput): Promise<Aisle> {
  if (item.aisle && AISLES.includes(item.aisle as Aisle)) return item.aisle as Aisle;
  const key = normaliseName(item.name);
  const cached = await db.prepare(
    "SELECT aisle FROM ingredient_aisles WHERE name_normalised = ?1",
  ).bind(key).first<{ aisle: string }>();
  if (cached && AISLES.includes(cached.aisle as Aisle)) return cached.aisle as Aisle;
  const aisle = knownAisle(item.name);
  await db.prepare(
    `INSERT INTO ingredient_aisles(name_normalised, aisle) VALUES (?1, ?2)
     ON CONFLICT(name_normalised) DO UPDATE SET aisle = excluded.aisle, updated_at = datetime('now')`,
  ).bind(key, aisle).run();
  return aisle;
}

function mergeSourceTitles(current: string | null, incoming: string | null): string | null {
  if (!incoming) return current;
  if (!current) return incoming;
  const titles = new Set(current.split(" + ").map((title) => title.trim()));
  titles.add(incoming);
  return [...titles].join(" + ").slice(0, 400);
}

async function insertItems(
  db: D1Database,
  rawItems: ShoppingItemInput[],
  source: ItemSource | null,
  addedBy: string | null,
): Promise<{ added: number }> {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 100) {
    throw new Error("Add between 1 and 100 items at a time.");
  }

  let added = 0;
  for (const raw of rawItems) {
    const item = cleanItem(raw);
    const aisle = await classify(db, item);
    const open = await db.prepare(
      "SELECT id, name, qty, unit, source_title FROM items WHERE checked_at IS NULL ORDER BY id",
    ).all<Pick<ItemRow, "id" | "name" | "qty" | "unit" | "source_title">>();
    const match = item.qty !== null
      ? open.results.find((row) => normaliseName(row.name) === normaliseName(item.name) && row.unit === item.unit && row.qty !== null)
      : undefined;

    if (match && match.qty !== null && item.qty !== null) {
      await db.prepare(
        "UPDATE items SET qty = ?1, source_title = ?2 WHERE id = ?3",
      ).bind(match.qty + item.qty, mergeSourceTitles(match.source_title, source?.title ?? null), match.id).run();
    } else {
      await db.prepare(
        `INSERT INTO items(name, qty, unit, aisle, source_kind, source_id, source_title, added_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(
        item.name, item.qty, item.unit, aisle, source?.kind ?? "manual",
        source?.id ?? null, source?.title?.trim().slice(0, 200) ?? null, addedBy,
      ).run();
    }
    added += 1;
  }
  return { added };
}

export class ShoppingList extends WorkerEntrypoint<Env> {
  async addItems(items: ShoppingItemInput[], source: ItemSource): Promise<{ added: number }> {
    if (source?.kind !== "recipe" || !Number.isInteger(source.id) || !source.title?.trim()) {
      throw new Error("Invalid recipe source.");
    }
    return insertItems(this.env.LIST, items, { ...source, title: source.title.trim().slice(0, 200) }, null);
  }
}

const app = new Hono<{ Bindings: Env }>().basePath("/list");

app.get("/api/items", async (c) => {
  const { results } = await c.env.LIST.prepare(
    `SELECT id, name, qty, unit, aisle, checked_at, source_kind, source_id, source_title, added_at
     FROM items ORDER BY checked_at IS NOT NULL, aisle, added_at DESC`,
  ).all<ItemRow>();
  return c.json({ items: results });
});

app.post("/api/items", async (c) => {
  let body: { name?: unknown; qty?: unknown; unit?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON payload." }, 400); }
  const qty = body.qty === null || body.qty === undefined ? null : Number(body.qty);
  try {
    const result = await insertItems(c.env.LIST, [{
      name: typeof body.name === "string" ? body.name : "",
      qty,
      unit: typeof body.unit === "string" ? body.unit : null,
    }], null, userEmail(c.req.raw));
    return c.json(result, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Could not add item." }, 400);
  }
});

app.patch("/api/items/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: "Invalid item id." }, 400);
  let body: { checked?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON payload." }, 400); }
  if (typeof body.checked !== "boolean") return c.json({ error: "checked must be a boolean." }, 400);
  const result = await c.env.LIST.prepare(
    "UPDATE items SET checked_at = CASE WHEN ?1 = 1 THEN datetime('now') ELSE NULL END WHERE id = ?2",
  ).bind(body.checked ? 1 : 0, id).run();
  return result.meta.changes ? c.json({ updated: true }) : c.json({ error: "Item not found." }, 404);
});

app.delete("/api/items/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: "Invalid item id." }, 400);
  const result = await c.env.LIST.prepare("DELETE FROM items WHERE id = ?1").bind(id).run();
  return result.meta.changes ? c.json({ deleted: true }) : c.json({ error: "Item not found." }, 404);
});

app.delete("/api/checked", async (c) => {
  const result = await c.env.LIST.prepare("DELETE FROM items WHERE checked_at IS NOT NULL").run();
  return c.json({ deleted: result.meta.changes });
});

app.get("*", async (c) => {
  if (!c.req.header("accept")?.includes("text/html")) {
    return c.text(`No asset at ${new URL(c.req.url).pathname}`, 404);
  }
  return c.env.ASSETS.fetch(new Request(new URL("/list/", c.req.url)));
});

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
