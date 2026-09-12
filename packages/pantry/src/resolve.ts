import { CATALOG_BY_ID } from "./catalog";
import { Matcher, matcher as defaultMatcher } from "./match";
import { parseIngredientLine } from "./parse";
import { formatRecipeAmount, toShoppingAmount } from "./units";
import type { CatalogEntry, LineFlags, ParsedLine, RecipeUnit, ShoppingAmount } from "./types";

export interface ResolvedLine {
  /** Catalog entry, or null when the name is unknown. */
  entry: CatalogEntry | null;
  /** Cleaned name to show when there is no entry. */
  name: string;
  /** The catalog alias that matched, as written in the line ("dried oregano", "sake"). Names lines inside a generic entry. */
  alias: string;
  qty: number | null;
  unit: RecipeUnit | null;
  /** Amount in the entry's buying unit, when the conversion is safe. */
  shopping: ShoppingAmount | null;
  /** "2 tbsp", "1 can", "" */
  amountLabel: string;
  flags: LineFlags;
  parsed: ParsedLine;
}

/**
 * Parse a recipe line and resolve it to one or more shopping ingredients.
 * "Kosher salt and black pepper" yields two lines; "2 tbsp butter or oil" yields one (butter).
 */
export function resolveLine(
  original: string,
  matcher: Matcher = defaultMatcher,
  override?: { qty: number | null; unit: RecipeUnit | null; name?: string },
): ResolvedLine[] {
  const parsed = parseIngredientLine(original);
  const name = override?.name?.trim() || parsed.name || original.trim();
  let resolved = matcher.resolveName(name);
  if (parsed.example && (!resolved[0]?.entry || resolved[0].entry.generic)) {
    // "green veg such as broccoli": the example is the thing to buy.
    const example = matcher.resolveName(parsed.example);
    if (example[0]?.entry && !example[0].entry.generic) resolved = example;
  }
  const qty = override ? override.qty : parsed.qty;
  const unit = override ? override.unit : parsed.unit;
  return resolved.map((item, index) => {
    if (item.entry && index === 0) item = { ...item, entry: countableOverride(item.entry, qty, unit) };
    // Only the first ingredient carries the quantity: "1 tsp salt and pepper" is not a teaspoon of pepper.
    const lineQty = index === 0 ? qty : null;
    const lineUnit = index === 0 ? unit : null;
    let shopping: ShoppingAmount | null = null;
    if (item.entry && lineQty !== null) {
      // A packaged line: "1 (400 g) can" is 400 g worth, "2 cans" of a canned entry is 2 pieces.
      if (parsed.pack && lineUnit && !isPlainCount(lineUnit)) {
        const each = toShoppingAmount(item.entry, parsed.pack);
        shopping = each ? { qty: each.qty * lineQty, unit: each.unit } : null;
      }
      shopping ??= toShoppingAmount(item.entry, { qty: lineQty, unit: lineUnit ?? "piece" });
    }
    return {
      entry: item.entry,
      name: item.entry ? item.entry.name : item.phrase || name,
      alias: item.alias,
      qty: lineQty,
      unit: lineUnit,
      shopping,
      amountLabel: formatRecipeAmount(lineQty, lineUnit),
      flags: parsed.flags,
      parsed,
    };
  });
}

/** The same line, resolved to a different entry (a learned correction). Recomputes the buying amount. */
export function rebindLine(line: ResolvedLine, entry: CatalogEntry): ResolvedLine {
  const shopping = line.qty === null ? null : toShoppingAmount(entry, { qty: line.qty, unit: line.unit ?? "piece" });
  return { ...line, entry, name: entry.name, shopping };
}

function isPlainCount(unit: RecipeUnit): boolean {
  return unit === "piece";
}

/**
 * Some words name a spice when measured and a vegetable or herb when counted:
 * "1 tsp paprika" is the powder, "2 Paprika" are bell peppers; "2 sprigs thyme" is the fresh herb.
 */
const COUNTED_AS: Record<string, string> = {
  paprika: "bell-pepper",
  pepper: "bell-pepper",
  "coriander-seed": "coriander-leaf",
  "dried-herbs": "spring-herbs",
};
const COUNT_UNITS = new Set<RecipeUnit>(["piece", "bunch", "sprig", "handful", "head", "stalk"]);

function countableOverride(entry: CatalogEntry, qty: number | null, unit: RecipeUnit | null): CatalogEntry {
  const target = COUNTED_AS[entry.id];
  if (!target || qty === null) return entry;
  if (!COUNT_UNITS.has(unit ?? "piece")) return entry;
  if (entry.id === "dried-herbs" && (unit ?? "piece") === "piece") return entry;
  return CATALOG_BY_ID.get(target) ?? entry;
}
