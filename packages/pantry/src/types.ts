/** Store sections, in the order you walk through a supermarket. */
export const AISLES = [
  "Produce", "Bakery", "Meat", "Fish & Seafood", "Dairy", "Eggs", "Pantry",
  "Baking", "Spices", "Frozen", "Beverages", "Household", "Other",
] as const;
export type Aisle = (typeof AISLES)[number];

/** Aisle names used before the split into Meat / Fish and Dairy / Eggs. */
const LEGACY_AISLES: Record<string, Aisle> = { "Meat & Seafood": "Meat", "Dairy & Eggs": "Dairy" };

export function isAisle(value: unknown): value is Aisle {
  return typeof value === "string" && (AISLES as readonly string[]).includes(value);
}

/** Accepts current and legacy aisle names; anything else is null. */
export function toAisle(value: unknown): Aisle | null {
  if (isAisle(value)) return value;
  return typeof value === "string" ? LEGACY_AISLES[value] ?? null : null;
}

/** How an ingredient is bought: by weight, by volume, or by the piece. */
export const MEASURES = ["g", "ml", "piece"] as const;
export type Measure = (typeof MEASURES)[number];

export interface CatalogEntry {
  /** Stable slug. Stored in databases; never rename. */
  id: string;
  /** English display name, lower-case singular. */
  name: string;
  /** Extra spellings in any language. Matched after normalisation, so plurals and casing are free. */
  aliases: readonly string[];
  aisle: Aisle;
  measure: Measure;
  /** Grams per millilitre, to convert cups and spoons into weight (or the reverse). */
  density?: number;
  /** Typical weight of one piece, to convert counts into weight or weights into pieces. */
  pieceGrams?: number;
  /** Typical volume yielded by one piece: a lemon gives ~45 ml of juice. */
  pieceMl?: number;
  /** What one "piece" is called when it is not simply the item: clove, can, bunch, slice. */
  pieceUnit?: string;
  /** Weight of other named pieces: garlic { head: 50 }, ginger { knob: 50 }, herbs { sprig: 3 }. */
  unitGrams?: Partial<Record<PieceUnit, number>>;
  /** A bucket for many distinct products (dried herbs, curry powders). Lines keep their own name and do not merge. */
  generic?: boolean;
  /** Something most kitchens already have: salt, oil, soy sauce. Listed under "check the pantry" rather than an aisle. */
  staple?: boolean;
  /** Never put on a shopping list: water, ice. */
  skip?: boolean;
}

export type MassUnit = "g" | "kg" | "oz" | "lb";
export type VolumeUnit = "ml" | "cl" | "dl" | "l" | "tsp" | "tbsp" | "cup" | "floz";
export type PieceUnit =
  | "piece" | "can" | "jar" | "packet" | "bunch" | "handful" | "pinch" | "dash" | "clove" | "slice"
  | "head" | "knob" | "stick" | "stalk" | "sprig" | "bottle" | "bag" | "block" | "cube" | "leaf"
  | "fillet" | "sheet" | "ball" | "pot" | "tube";
export type RecipeUnit = MassUnit | VolumeUnit | PieceUnit;

export interface Amount {
  qty: number;
  unit: RecipeUnit;
}

export interface ShoppingAmount {
  qty: number;
  unit: Measure;
}

export interface LineFlags {
  optional: boolean;
  toTaste: boolean;
  serving: boolean;
}

export interface ParsedLine {
  /** Quantity as written; for a range, the upper bound. */
  qty: number | null;
  unit: RecipeUnit | null;
  /** The ingredient text with quantity, unit, and parentheticals removed. */
  name: string;
  /** Text from parentheses and trailing prep notes. */
  note: string | null;
  /** Set when the source gave a range such as "2-3"; qty holds the upper bound. */
  range: [number, number] | null;
  /** Size of one package when the line reads "1 (400 g) can ...". */
  pack: Amount | null;
  /** A concrete example after "such as": "green veg such as broccoli" → "broccoli". */
  example: string | null;
  flags: LineFlags;
}

export interface ResolvedIngredient {
  entry: CatalogEntry | null;
  /** The cleaned phrase that was matched (or left unmatched). */
  phrase: string;
  /** Number of words in the alias that matched; 0 when nothing matched. */
  strength: number;
  /** The alias text that matched, normalised. Used to tell apart lines inside a generic entry. */
  alias: string;
  /** True when the alias covered every meaningful word of the phrase. */
  exact: boolean;
}
