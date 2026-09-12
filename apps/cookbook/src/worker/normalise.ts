import type { IngredientInput } from "./schema";

import {
  isMassUnit, isVolumeUnit, matcher, parseIngredientLine as parsePantryLine, toGrams, toMillilitres,
  type RecipeUnit,
} from "@family-tools/pantry";

export function normaliseIngredientName(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/\s+/g, " ").replace(/s$/, "");
}

function roundKitchen(value: number, kind: "g" | "ml"): number {
  const step = kind === "g" && value >= 100 ? 10 : 5;
  return Math.max(step, Math.round(value / step) * step);
}

function cleanParsedName(value: string): string {
  return value
    .trim()
    .replace(/^(?:\([^)]{1,80}\)\s*)+/, "")
    .replace(/^[-–—,;:]\s*/, "")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

/**
 * Quantity, unit and name of one recipe line, using the shared pantry parser.
 * Package units (Päckchen, Bund, can, clove) become a bare count: the recipe row stores metric or a count only.
 */
export function parseIngredientLine(original: string, preferredName?: string): {
  qty: number | null;
  unit: RecipeUnit | null;
  name: string;
} {
  const clean = original.trim();
  if (!clean) throw new Error("An imported ingredient was empty.");
  const parsed = parsePantryLine(clean);
  const name = preferredName ? cleanParsedName(preferredName) : cleanParsedName(parsed.name);
  if (!name) throw new Error(`Could not identify the ingredient in “${clean}”.`);
  const unit = parsed.unit && (isMassUnit(parsed.unit) || isVolumeUnit(parsed.unit)) ? parsed.unit : null;
  return { qty: parsed.qty, unit, name };
}

const ML_PER_CUP = 236.588;

export async function parseAndNormaliseIngredient(
  db: D1Database,
  original: string,
  preferredName?: string,
): Promise<IngredientInput> {
  const clean = original.trim();
  const { qty, unit: rawUnit, name } = parseIngredientLine(original, preferredName);
  const entry = matcher.resolveName(name)[0]?.entry ?? null;
  const fact = await db.prepare(
    "SELECT aisle, grams_per_cup FROM ingredient_facts WHERE name_normalised = ?1",
  ).bind(normaliseIngredientName(name)).first<{ aisle: string | null; grams_per_cup: number | null }>();
  const aisle = entry?.aisle ?? fact?.aisle ?? null;
  const canonicalName = entry && !entry.generic ? entry.name : undefined;
  const base = { name, original: clean, aisle, ...(canonicalName ? { canonicalName } : {}) };

  if (qty === null || rawUnit === null) return { ...base, qty, unit: null };
  const grams = toGrams({ qty, unit: rawUnit });
  if (grams !== null) {
    return rawUnit === "g"
      ? { ...base, qty, unit: "g" }
      : { ...base, qty: roundKitchen(grams, "g"), unit: "g", conversionNote: `converted from ${rawUnit === "kg" ? "kilograms" : rawUnit === "oz" ? "ounces" : "pounds"}` };
  }
  const ml = toMillilitres({ qty, unit: rawUnit });
  if (ml === null) return { ...base, qty, unit: null };
  if (rawUnit === "ml") return { ...base, qty, unit: "ml" };
  if (rawUnit === "l") return { ...base, qty: roundKitchen(ml, "ml"), unit: "ml", conversionNote: "converted from litres" };

  // Cups and spoons of a dry ingredient: weigh them when a density is known.
  const gramsPerMl = entry?.density ?? (fact?.grams_per_cup ? fact.grams_per_cup / ML_PER_CUP : null);
  const isSpoonOrCup = rawUnit === "cup" || rawUnit === "tbsp" || rawUnit === "tsp";
  if (isSpoonOrCup && gramsPerMl && (entry?.measure === "g" || !entry)) {
    const unitLabel = `${rawUnit}${qty === 1 ? "" : "s"}`;
    return {
      ...base,
      qty: roundKitchen(ml * gramsPerMl, "g"),
      unit: "g",
      conversionNote: `from ${qty} ${unitLabel}; assumed ${Math.round(gramsPerMl * ML_PER_CUP)} g/cup for ${name}`,
    };
  }
  return {
    ...base,
    qty: roundKitchen(ml, "ml"),
    unit: "ml",
    conversionNote: rawUnit === "cup" && !gramsPerMl ? "volume converted to ml; no reliable density available" : `converted from ${rawUnit === "floz" ? "fl oz" : rawUnit}`,
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
