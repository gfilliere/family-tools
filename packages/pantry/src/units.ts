import type { Amount, CatalogEntry, MassUnit, Measure, PieceUnit, RecipeUnit, ShoppingAmount, VolumeUnit } from "./types";

const MASS: Record<MassUnit, number> = { g: 1, kg: 1_000, oz: 28.3495, lb: 453.592 };
const VOLUME: Record<VolumeUnit, number> = { ml: 1, l: 1_000, tsp: 4.929, tbsp: 14.787, cup: 236.588, floz: 29.574 };

/** Spelling → unit. Keys are lower-case with dots removed. */
export const UNIT_WORDS: Record<string, RecipeUnit> = {
  g: "g", gr: "g", gram: "g", grams: "g", gramm: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg", kilogramm: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb", pfund: "lb",
  ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  l: "l", liter: "l", liters: "l", litre: "l", litres: "l",
  tsp: "tsp", tsps: "tsp", teaspoon: "tsp", teaspoons: "tsp", tl: "tsp", teelöffel: "tsp",
  tbsp: "tbsp", tbsps: "tbsp", tbs: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", el: "tbsp", esslöffel: "tbsp", essl: "tbsp",
  cup: "cup", cups: "cup", tasse: "cup", tassen: "cup",
  floz: "floz", "fl oz": "floz", "fluid ounce": "floz", "fluid ounces": "floz",
  can: "can", cans: "can", tin: "can", tins: "can", dose: "can", dosen: "can",
  jar: "jar", jars: "jar", glas: "jar", gläser: "jar",
  packet: "packet", packets: "packet", package: "packet", packages: "packet", pack: "packet", packs: "packet", sachet: "packet",
  sachets: "packet", envelope: "packet", packung: "packet", packungen: "packet", päckchen: "packet", paket: "packet", pakete: "packet", pck: "packet", pkg: "packet",
  bunch: "bunch", bunches: "bunch", bund: "bunch", bündel: "bunch",
  handful: "handful", handfuls: "handful", handvoll: "handful",
  pinch: "pinch", pinches: "pinch", prise: "pinch", prisen: "pinch",
  dash: "dash", dashes: "dash", splash: "dash", spritzer: "dash", schuss: "dash", drizzle: "dash",
  clove: "clove", cloves: "clove", zehe: "clove", zehen: "clove",
  slice: "slice", slices: "slice", scheibe: "slice", scheiben: "slice", rasher: "slice", rashers: "slice",
  head: "head", heads: "head", kopf: "head", köpfe: "head", bulb: "head", bulbs: "head", knolle: "head", knollen: "head",
  knob: "knob", knobs: "knob",
  stick: "stick", sticks: "stick", stange: "stick", stangen: "stick",
  stalk: "stalk", stalks: "stalk", rib: "stalk", ribs: "stalk",
  sprig: "sprig", sprigs: "sprig", zweig: "sprig", zweige: "sprig",
  bottle: "bottle", bottles: "bottle", flasche: "bottle", flaschen: "bottle",
  bag: "bag", bags: "bag", beutel: "bag", tüte: "bag", tüten: "bag",
  block: "block", blocks: "block",
  cube: "cube", cubes: "cube", würfel: "cube",
  leaf: "leaf", leaves: "leaf", blatt: "leaf", blätter: "leaf",
  fillet: "fillet", fillets: "fillet", filet: "fillet", filets: "fillet",
  sheet: "sheet", sheets: "sheet", platte: "sheet", platten: "sheet",
  ball: "ball", balls: "ball", kugel: "ball", kugeln: "ball",
  pot: "pot", pots: "pot", becher: "pot",
  tube: "tube", tubes: "tube",
  piece: "piece", pieces: "piece", stück: "piece", stk: "piece", x: "piece",
};

export function isMassUnit(unit: RecipeUnit): unit is MassUnit { return unit in MASS; }
export function isVolumeUnit(unit: RecipeUnit): unit is VolumeUnit { return unit in VOLUME; }
export function isPieceUnit(unit: RecipeUnit): unit is PieceUnit { return !isMassUnit(unit) && !isVolumeUnit(unit); }
export function isMetric(unit: RecipeUnit): boolean { return unit === "g" || unit === "kg" || unit === "ml" || unit === "l"; }

/** Units that mean "a little": no quantity worth shopping for. */
export const TRACE_UNITS: ReadonlySet<RecipeUnit> = new Set<RecipeUnit>(["pinch", "dash"]);

export function toGrams(amount: Amount): number | null {
  return isMassUnit(amount.unit) ? amount.qty * MASS[amount.unit] : null;
}

export function toMillilitres(amount: Amount): number | null {
  return isVolumeUnit(amount.unit) ? amount.qty * VOLUME[amount.unit] : null;
}

/** Does this unit count the same thing the catalog entry counts? A plain number always does. */
function countsEntryPieces(unit: PieceUnit, entry: CatalogEntry): boolean {
  if (unit === "piece") return true;
  if (!entry.pieceUnit) return false;
  return unit === entry.pieceUnit;
}

/** Rough weights for informal units when the entry does not say otherwise. */
const DEFAULT_UNIT_GRAMS: Partial<Record<PieceUnit, number>> = { handful: 30, knob: 40, sprig: 3, leaf: 1, slice: 20, stick: 5 };

/** Grams for a named piece unit that is not the entry's own piece: "1 knob ginger", "2 sprigs thyme". */
function namedPieceGrams(unit: PieceUnit, entry: CatalogEntry): number | null {
  if (unit === "piece" || unit === entry.pieceUnit) return null;
  const specific = entry.unitGrams?.[unit];
  if (specific) return specific;
  const fallback = DEFAULT_UNIT_GRAMS[unit];
  if (!fallback) return null;
  return entry.measure !== "piece" || entry.pieceGrams ? fallback : null;
}

/**
 * Express a recipe amount in the unit the ingredient is bought in.
 * Returns null when the conversion would be a guess: the caller keeps the original amount as a separate line.
 */
export function toShoppingAmount(entry: CatalogEntry, amount: Amount): ShoppingAmount | null {
  if (TRACE_UNITS.has(amount.unit)) return null;
  let grams = toGrams(amount);
  const ml = toMillilitres(amount);
  const pieces = isPieceUnit(amount.unit) && countsEntryPieces(amount.unit, entry) ? amount.qty : null;
  if (grams === null && ml === null && pieces === null && isPieceUnit(amount.unit)) {
    const each = namedPieceGrams(amount.unit, entry);
    if (each) grams = amount.qty * each;
  }

  switch (entry.measure) {
    case "g": {
      if (grams !== null) return { qty: grams, unit: "g" };
      if (ml !== null && entry.density) return { qty: ml * entry.density, unit: "g" };
      if (pieces !== null && entry.pieceGrams) return { qty: pieces * entry.pieceGrams, unit: "g" };
      return null;
    }
    case "ml": {
      if (ml !== null) return { qty: ml, unit: "ml" };
      if (grams !== null && entry.density) return { qty: grams / entry.density, unit: "ml" };
      if (pieces !== null && entry.pieceMl) return { qty: pieces * entry.pieceMl, unit: "ml" };
      return null;
    }
    case "piece": {
      if (pieces !== null) return { qty: pieces, unit: "piece" };
      if (grams !== null && entry.pieceGrams) return { qty: grams / entry.pieceGrams, unit: "piece" };
      if (ml !== null && entry.pieceMl) return { qty: ml / entry.pieceMl, unit: "piece" };
      if (ml !== null && entry.density && entry.pieceGrams) return { qty: (ml * entry.density) / entry.pieceGrams, unit: "piece" };
      return null;
    }
  }
}

/** Round to numbers a shopper can act on. Pieces round up: you cannot buy a quarter onion. */
export function roundShopping(amount: ShoppingAmount): ShoppingAmount {
  if (amount.unit === "piece") return { qty: Math.max(1, Math.ceil(amount.qty - 0.05)), unit: "piece" };
  const value = amount.qty;
  const step = value >= 1_000 ? 50 : value >= 100 ? 10 : value >= 20 ? 5 : 1;
  return { qty: Math.max(step, Math.round(value / step) * step), unit: amount.unit };
}

function plural(word: string, count: number): string {
  if (count === 1) return word;
  if (/(?:ch|sh|s|x|z)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (word === "leaf") return "leaves";
  return `${word}s`;
}

function trimNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** "680 g", "1.2 kg", "3", "7 cloves", "2 cans". */
export function formatShoppingAmount(amount: ShoppingAmount, pieceUnit?: string): string {
  if (amount.unit === "piece") {
    const count = trimNumber(amount.qty);
    return pieceUnit ? `${count} ${plural(pieceUnit, amount.qty)}` : count;
  }
  if (amount.qty >= 1_000) return `${trimNumber(amount.qty / 1_000)} ${amount.unit === "g" ? "kg" : "l"}`;
  return `${trimNumber(amount.qty)} ${amount.unit}`;
}

/** The amount as the recipe wrote it, in a short form: "2 tbsp", "1 can", "3 cloves", "½". */
export function formatRecipeAmount(qty: number | null, unit: RecipeUnit | null): string {
  if (qty === null) return "";
  const count = trimNumber(qty);
  if (!unit || unit === "piece") return count;
  if (isMassUnit(unit) || isVolumeUnit(unit)) return `${count} ${unit === "floz" ? "fl oz" : unit}`;
  return `${count} ${plural(unit, qty)}`;
}

export function measureLabel(measure: Measure): string {
  return measure === "piece" ? "by the piece" : `in ${measure}`;
}
