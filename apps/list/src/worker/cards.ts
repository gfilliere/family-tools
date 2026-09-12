import {
  AISLES, formatRecipeAmount, formatShoppingAmount, roundShopping,
  type Aisle, type CatalogEntry, type Measure, type RecipeUnit, type ShoppingAmount,
} from "@family-tools/pantry";

export const STAPLE_GROUP = "Check the pantry";

export interface ItemRow {
  id: number;
  name: string;
  display_name: string | null;
  ingredient_id: string | null;
  canonical_name: string | null;
  original: string | null;
  qty: number | null;
  unit: string | null;
  base_qty: number | null;
  base_unit: Measure | null;
  aisle: string | null;
  flags: string | null;
  checked_at: string | null;
  source_kind: "manual" | "recipe" | null;
  source_id: number | null;
  source_title: string | null;
  added_at: string;
}

export interface Part {
  id: number;
  /** Amount as the recipe wrote it: "2 tbsp", "1 can", "". */
  amount: string;
  /** Ingredient as the recipe wrote it. */
  name: string;
  original: string | null;
  sourceKind: "manual" | "recipe";
  sourceId: number | null;
  sourceTitle: string | null;
  checked: boolean;
  /** False when this part's amount could not be expressed in the buying unit. */
  converted: boolean;
  optional: boolean;
}

export interface Card {
  key: string;
  ingredientId: string;
  name: string;
  aisle: Aisle;
  staple: boolean;
  group: string;
  measure: Measure;
  pieceUnit: string | null;
  custom: boolean;
  /** Formatted buying total, or null when nothing measurable was given. */
  total: string | null;
  /** True when at least one measured part is not in the total. */
  partial: boolean;
  checked: boolean;
  optional: boolean;
  parts: Part[];
}

export interface Resolved {
  entry: CatalogEntry;
  aisle: Aisle;
  staple: boolean;
}

const GROUP_ORDER: readonly string[] = [...AISLES, STAPLE_GROUP];

function parseFlags(raw: string | null): { optional?: boolean } {
  if (!raw) return {};
  try { return JSON.parse(raw) as { optional?: boolean }; } catch { return {}; }
}

/** Card key: the ingredient, or ingredient plus its own name for generic buckets (dried herbs, curry powders). */
export function cardKey(entry: CatalogEntry, displayName: string | null): string {
  return entry.generic ? `${entry.id}#${(displayName ?? entry.name).toLocaleLowerCase()}` : entry.id;
}

export function buildCards(rows: ItemRow[], lookup: (id: string | null) => Resolved | null): Card[] {
  const groups = new Map<string, { resolved: Resolved; displayName: string; rows: ItemRow[] }>();
  for (const row of rows) {
    const resolved = lookup(row.ingredient_id);
    if (!resolved) continue;
    const displayName = resolved.entry.generic && row.display_name ? row.display_name : resolved.entry.name;
    const key = cardKey(resolved.entry, displayName);
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { resolved, displayName, rows: [row] });
  }

  const cards: Card[] = [];
  for (const [key, { resolved, displayName, rows: members }] of groups) {
    const { entry } = resolved;
    let sum: ShoppingAmount | null = null;
    let partial = false;
    const parts: Part[] = members.map((row) => {
      const converted = row.base_qty !== null && row.base_unit === entry.measure;
      if (converted) sum = { qty: (sum?.qty ?? 0) + (row.base_qty ?? 0), unit: entry.measure };
      else if (row.qty !== null) partial = true;
      const flags = parseFlags(row.flags);
      return {
        id: row.id,
        amount: formatRecipeAmount(row.qty, (row.unit as RecipeUnit | null) ?? null),
        name: row.name,
        original: row.original,
        sourceKind: row.source_kind ?? "manual",
        sourceId: row.source_id,
        sourceTitle: row.source_title,
        checked: row.checked_at !== null,
        converted,
        optional: flags.optional === true,
      };
    });
    cards.push({
      key,
      ingredientId: entry.id,
      name: displayName,
      aisle: resolved.aisle,
      staple: resolved.staple,
      group: resolved.staple ? STAPLE_GROUP : resolved.aisle,
      measure: entry.measure,
      pieceUnit: entry.pieceUnit ?? null,
      custom: entry.id.startsWith("custom:"),
      total: sum ? formatShoppingAmount(roundShopping(sum), entry.pieceUnit) : null,
      partial,
      checked: parts.every((part) => part.checked),
      optional: parts.every((part) => part.optional),
      parts,
    });
  }

  return cards.toSorted((a, b) =>
    Number(a.checked) - Number(b.checked)
    || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    || a.name.localeCompare(b.name));
}

/** Plain-text export grouped the way the cards are, for pasting into a chat. */
export function cardsToText(cards: Card[]): string {
  const open = cards.filter((card) => !card.checked);
  if (!open.length) return "Shopping list is empty";
  const byGroup = new Map<string, Card[]>();
  for (const card of open) byGroup.set(card.group, [...(byGroup.get(card.group) ?? []), card]);
  return [...byGroup.entries()].map(([group, members]) => [
    group.toUpperCase(),
    ...members.map((card) => {
      const sources = [...new Set(card.parts.map((part) => part.sourceTitle).filter(Boolean))];
      const amount = card.total ?? card.parts.map((part) => part.amount).filter(Boolean).join(" + ");
      return `- ${amount ? `${amount} ` : ""}${card.name}${sources.length ? ` (${sources.join(", ")})` : ""}`;
    }),
  ].join("\n")).join("\n\n");
}
