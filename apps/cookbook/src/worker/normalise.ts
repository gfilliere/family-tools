import type { IngredientInput } from "./schema";

const FRACTIONS: Record<string, number> = {
  "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

const UNIT_PATTERN = "fl\\.?\\s*oz|fluid ounces?|tablespoons?|tbsp\\.?|teaspoons?|tsp\\.?|cups?|ounces?|oz\\.?|pounds?|lbs?\\.?|kilograms?|kg|grams?|g|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|EL|TL";

export function normaliseIngredientName(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/\s+/g, " ").replace(/s$/, "");
}

function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  let total = 0;
  let found = false;
  for (const token of text.split(/\s+/)) {
    if (token in FRACTIONS) { total += FRACTIONS[token] ?? 0; found = true; continue; }
    const mixed = /^(\d+)([¼½¾⅓⅔⅛⅜⅝⅞])$/.exec(token);
    if (mixed) { total += Number(mixed[1]) + (FRACTIONS[mixed[2] ?? ""] ?? 0); found = true; continue; }
    const fraction = /^(\d+)\/(\d+)$/.exec(token);
    if (fraction && Number(fraction[2])) { total += Number(fraction[1]) / Number(fraction[2]); found = true; continue; }
    const numeric = Number(token);
    if (Number.isFinite(numeric)) { total += numeric; found = true; }
  }
  return found ? total : null;
}

function roundKitchen(value: number, kind: "g" | "ml"): number {
  const step = kind === "g" && value >= 100 ? 10 : 5;
  return Math.max(step, Math.round(value / step) * step);
}

function canonicalUnit(raw: string): string {
  const value = raw.toLocaleLowerCase().replaceAll(".", "").trim();
  if (["oz", "ounce", "ounces"].includes(value)) return "oz";
  if (["lb", "lbs", "pound", "pounds"].includes(value)) return "lb";
  if (["cup", "cups"].includes(value)) return "cup";
  if (["fl oz", "fluid ounce", "fluid ounces"].includes(value)) return "fl oz";
  if (["tablespoon", "tablespoons", "tbsp", "el"].includes(value)) return "tbsp";
  if (["teaspoon", "teaspoons", "tsp", "tl"].includes(value)) return "tsp";
  if (["kilogram", "kilograms", "kg"].includes(value)) return "kg";
  if (["gram", "grams", "g"].includes(value)) return "g";
  if (["milliliter", "milliliters", "millilitre", "millilitres", "ml"].includes(value)) return "ml";
  if (["liter", "liters", "litre", "litres", "l"].includes(value)) return "l";
  return value;
}

function cleanParsedName(value: string): string {
  return value
    .trim()
    .replace(/^(?:\([^)]{1,80}\)\s*)+/, "")
    .replace(/^[-–—,;:]\s*/, "")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

export async function parseAndNormaliseIngredient(
  db: D1Database,
  original: string,
  preferredName?: string,
): Promise<IngredientInput> {
  const clean = original.trim();
  if (!clean) throw new Error("An imported ingredient was empty.");
  const match = new RegExp(`^([\\d\\s.,/¼½¾⅓⅔⅛⅜⅝⅞]+)?\\s*(?:(${UNIT_PATTERN})(?=\\s|$))?\\s*(?:of\\s+)?(.+)$`, "i").exec(clean);
  const qty = match?.[1] ? parseNumber(match[1]) : null;
  const rawUnit = match?.[2] ? canonicalUnit(match[2]) : null;
  const parsedName = cleanParsedName(match?.[3] ?? clean);
  const name = preferredName ? cleanParsedName(preferredName) : parsedName;
  if (!name) throw new Error(`Could not identify the ingredient in “${clean}”.`);
  const fact = await db.prepare(
    "SELECT aisle, grams_per_cup FROM ingredient_facts WHERE name_normalised = ?1",
  ).bind(normaliseIngredientName(name)).first<{ aisle: string | null; grams_per_cup: number | null }>();

  if (qty === null || rawUnit === null) return { name, qty, unit: null, original: clean, aisle: fact?.aisle ?? null };
  if (rawUnit === "g") return { name, qty, unit: "g", original: clean, aisle: fact?.aisle ?? null };
  if (rawUnit === "kg") return { name, qty: roundKitchen(qty * 1_000, "g"), unit: "g", original: clean, conversionNote: "converted from kilograms", aisle: fact?.aisle ?? null };
  if (rawUnit === "oz") return { name, qty: roundKitchen(qty * 28.3495, "g"), unit: "g", original: clean, conversionNote: "converted from ounces", aisle: fact?.aisle ?? null };
  if (rawUnit === "lb") return { name, qty: roundKitchen(qty * 453.592, "g"), unit: "g", original: clean, conversionNote: "converted from pounds", aisle: fact?.aisle ?? null };
  if (rawUnit === "ml") return { name, qty, unit: "ml", original: clean, aisle: fact?.aisle ?? null };
  if (rawUnit === "l") return { name, qty: roundKitchen(qty * 1_000, "ml"), unit: "ml", original: clean, conversionNote: "converted from litres", aisle: fact?.aisle ?? null };

  const mlPerUnit = rawUnit === "cup" ? 236.588 : rawUnit === "fl oz" ? 29.574 : rawUnit === "tbsp" ? 14.787 : 4.929;
  if (["cup", "tbsp", "tsp"].includes(rawUnit) && fact?.grams_per_cup) {
    const grams = qty * (mlPerUnit / 236.588) * fact.grams_per_cup;
    return {
      name,
      qty: roundKitchen(grams, "g"),
      unit: "g",
      original: clean,
      conversionNote: `from ${qty} ${rawUnit}${qty === 1 ? "" : "s"}; assumed ${fact.grams_per_cup} g/cup for ${name}`,
      aisle: fact.aisle,
    };
  }
  return {
    name,
    qty: roundKitchen(qty * mlPerUnit, "ml"),
    unit: "ml",
    original: clean,
    conversionNote: rawUnit === "cup" ? "volume converted to ml; no reliable density available" : `converted from ${rawUnit}`,
    aisle: fact?.aisle ?? null,
  };
}

export function normaliseInstructions(markdown: string): string {
  return markdown
    .replace(/(\d{2,3})\s*°?\s*F\b/gi, (original, raw: string) => {
      const celsius = Math.round(((Number(raw) - 32) * 5 / 9) / 5) * 5;
      return `${celsius} °C (${original})`;
    })
    .replace(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|in\.?)(?!\w)/gi, (original, a: string, b: string) => {
      const cmA = Math.round(Number(a) * 2.54);
      const cmB = Math.round(Number(b) * 2.54);
      return `${cmA}×${cmB} cm (${original})`;
    });
}
