import { AISLES, CATALOG, MEASURES, isAisle, type Aisle, type Measure } from "@family-tools/pantry";
import type { NewIngredient } from "./knowledge";

export interface ModelIngredient extends NewIngredient {
  sourceName: string;
  /** An existing catalog id when the name is really a known ingredient spelled differently. */
  catalogId: string | null;
}

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceName: { type: "string" },
          catalogId: { type: ["string", "null"] },
          name: { type: "string" },
          aisle: { type: "string", enum: AISLES },
          measure: { type: "string", enum: MEASURES },
          staple: { type: "boolean" },
          densityGPerMl: { type: ["number", "null"] },
          pieceGrams: { type: ["number", "null"] },
          pieceUnit: { type: ["string", "null"] },
        },
        required: ["sourceName", "catalogId", "name", "aisle", "measure", "staple", "densityGPerMl", "pieceGrams", "pieceUnit"],
      },
    },
  },
  required: ["ingredients"],
} as const;

function positive(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) && input > 0 ? input : null;
}

function clean(value: unknown): ModelIngredient | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const sourceName = typeof record.sourceName === "string" ? record.sourceName.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim().toLocaleLowerCase().slice(0, 80) : "";
  if (!sourceName || !name) return null;
  const aisle: Aisle = isAisle(record.aisle) ? record.aisle : "Other";
  const measure: Measure = (MEASURES as readonly string[]).includes(record.measure as string) ? record.measure as Measure : "piece";
  return {
    sourceName,
    catalogId: typeof record.catalogId === "string" && record.catalogId.trim() ? record.catalogId.trim() : null,
    name,
    aisle,
    measure,
    staple: record.staple === true,
    density: positive(record.densityGPerMl),
    pieceGrams: positive(record.pieceGrams),
    pieceUnit: typeof record.pieceUnit === "string" && record.pieceUnit.trim() ? record.pieceUnit.trim().toLocaleLowerCase().slice(0, 20) : null,
  };
}

/**
 * Ask a model about ingredient names the catalog does not know. Best effort: any failure yields [].
 * The model may point at an existing catalog id instead of inventing a new ingredient.
 */
export async function describeUnknownIngredients(env: Env, names: string[]): Promise<ModelIngredient[]> {
  if (!names.length) return [];
  const ids = CATALOG.filter((entry) => !entry.skip).map((entry) => entry.id).join(", ");
  const prompt = `You maintain a family's shopping-list ingredient catalog. For each source name (English or German, may contain preparation words), answer:
- catalogId: an id from the existing catalog when the name is really that ingredient spelled differently, otherwise null. Existing ids: ${ids}
- name: a concise lower-case singular English shopping name
- aisle: one of ${AISLES.join(", ")}
- measure: how it is bought — "g" (by weight), "ml" (by volume), or "piece" (by count)
- staple: true only for things most kitchens keep for months (spices, oils, condiments, flour)
- densityGPerMl: grams per millilitre when reliably known, else null
- pieceGrams: typical weight of one piece when bought by the piece, else null
- pieceUnit: what one piece is called when it is not the item itself (can, jar, bunch, packet), else null
Copy sourceName exactly. Do not omit any name.

${JSON.stringify(names)}`;
  try {
    const result = await env.AI.run(env.INGREDIENT_MODEL, {
      messages: [
        { role: "system", content: "You answer only with JSON that matches the requested schema." },
        { role: "user", content: prompt },
      ],
      max_tokens: 2_048,
      temperature: 0.1,
      response_format: { type: "json_schema", json_schema: schema },
    } as Parameters<typeof env.AI.run>[1]);
    const response = (result as { response?: unknown }).response;
    const parsed = typeof response === "string" ? JSON.parse(response) as unknown : response;
    const list = (parsed as { ingredients?: unknown[] })?.ingredients;
    if (!Array.isArray(list)) return [];
    return list.map(clean).filter((item): item is ModelIngredient => item !== null);
  } catch (error) {
    console.error(JSON.stringify({ event: "ingredient_model_failed", error: error instanceof Error ? error.message : String(error) }));
    return [];
  }
}
