import { aiRecipeJsonSchema, aiRecipeSchema, type RecipeInput } from "./schema";
import { normaliseIngredientName, normaliseInstructions, parseAndNormaliseIngredient } from "./normalise";

const MAX_DOCUMENT_BYTES = 3_000_000;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readLimited(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`Recipe site returned ${response.status}.`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) throw new Error("Recipe page is too large to import.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DOCUMENT_BYTES) throw new Error("Recipe page is too large to import.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

function hasRecipeType(value: unknown): boolean {
  const types = isObject(value) ? value["@type"] : null;
  return types === "Recipe" || (Array.isArray(types) && types.includes("Recipe"));
}

function findRecipe(value: unknown, depth = 0): JsonObject | null {
  if (depth > 12) return null;
  if (hasRecipeType(value) && isObject(value)) return value;
  if (Array.isArray(value)) {
    for (const child of value) { const found = findRecipe(child, depth + 1); if (found) return found; }
  } else if (isObject(value)) {
    for (const child of Object.values(value)) { const found = findRecipe(child, depth + 1); if (found) return found; }
  }
  return null;
}

function recipeFromJsonLd(html: string): JsonObject | null {
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const parsed: unknown = JSON.parse((match[1] ?? "").trim());
      const recipe = findRecipe(parsed);
      if (recipe) return recipe;
    } catch { /* Malformed JSON-LD is common; try the next block. */ }
  }
  return null;
}

function durationMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i.exec(value.trim());
  if (!match) return null;
  return Number(match[1] ?? 0) * 1_440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) return value.map(textValue).filter((item): item is string => Boolean(item)).join("\n");
  if (isObject(value)) return textValue(value.text ?? value.name);
  return null;
}

function instructionLines(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(instructionLines);
  if (!isObject(value)) return [];
  if (value.itemListElement) return instructionLines(value.itemListElement);
  const text = textValue(value.text ?? value.name);
  return text ? [text] : [];
}

function imageValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return imageValue(value[0]);
  if (isObject(value)) return textValue(value.url ?? value.contentUrl);
  return null;
}

function servingsValue(value: unknown): number | null {
  const text = textValue(value);
  const match = text ? /\d+/.exec(text) : null;
  return match ? Number(match[0]) : null;
}

async function saveFacts(db: D1Database, facts: { name: string; aisle: string; gramsPerCup: number | null }[]): Promise<void> {
  if (!facts.length) return;
  await db.batch(facts.map((fact) => db.prepare(
    `INSERT INTO ingredient_facts(name_normalised, aisle, grams_per_cup) VALUES (?1, ?2, ?3)
     ON CONFLICT(name_normalised) DO UPDATE SET aisle=excluded.aisle,
       grams_per_cup=COALESCE(excluded.grams_per_cup, ingredient_facts.grams_per_cup), updated_at=datetime('now')`,
  ).bind(normaliseIngredientName(fact.name), fact.aisle, fact.gramsPerCup)));
}

async function buildDraft(
  db: D1Database,
  raw: {
    title: string;
    instructionsMd: string | null;
    cookMinutes: number | null;
    servings: number | null;
    imageUrl: string | null;
    ingredients: { original: string; name?: string }[];
  },
  sourceUrl: string | null,
  tier: "json-ld" | "ai" | "browser",
): Promise<RecipeInput & { importTier: string }> {
  const ingredients = await Promise.all(raw.ingredients.map((ingredient) =>
    parseAndNormaliseIngredient(db, ingredient.original, ingredient.name),
  ));
  return {
    title: raw.title,
    instructionsMd: raw.instructionsMd ? normaliseInstructions(raw.instructionsMd) : null,
    cookMinutes: raw.cookMinutes,
    servings: raw.servings,
    difficulty: null,
    rating: null,
    sourceUrl,
    imageUrl: raw.imageUrl,
    notes: null,
    tags: [],
    ingredients,
    importTier: tier,
  };
}

async function fromJsonLd(db: D1Database, recipe: JsonObject, sourceUrl: string): Promise<(RecipeInput & { importTier: string }) | null> {
  const title = textValue(recipe.name ?? recipe.headline);
  const ingredientLines = Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient.map(textValue).filter((value): value is string => Boolean(value))
    : [];
  if (!title || ingredientLines.length === 0) return null;
  const steps = instructionLines(recipe.recipeInstructions);
  return buildDraft(db, {
    title,
    ingredients: ingredientLines.map((original) => ({ original })),
    instructionsMd: steps.length ? steps.map((step, index) => `${index + 1}. ${step}`).join("\n\n") : null,
    cookMinutes: durationMinutes(recipe.totalTime) ?? durationMinutes(recipe.cookTime) ?? durationMinutes(recipe.prepTime),
    servings: servingsValue(recipe.recipeYield),
    imageUrl: imageValue(recipe.image),
  }, sourceUrl, "json-ld");
}

function conversionData(result: unknown): string {
  if (Array.isArray(result)) return result.map(conversionData).filter(Boolean).join("\n");
  if (isObject(result) && result.format !== "error" && typeof result.data === "string") return result.data;
  return "";
}

function aiResponse(result: unknown): unknown {
  if (!isObject(result)) return result;
  const response = result.response;
  if (typeof response === "string") {
    try { return JSON.parse(response); } catch { return null; }
  }
  return response;
}

async function extractWithAi(env: Env, markdown: string, sourceUrl: string | null, tier: "ai" | "browser"): Promise<RecipeInput & { importTier: string }> {
  const prompt = `Extract one usable recipe from the Markdown. For every ingredient, keep the source line verbatim in original and return a clean canonical name containing only the food identity: remove quantities, units, packaging, measurement notes, preparation instructions, and surrounding commentary. For example, "2 cups (standard measuring cup) uncooked short-grain white rice" has name "uncooked short-grain white rice". Return ingredient facts keyed by those clean names: one aisle from the allowed list and gramsPerCup only when a reliable dry-volume density is known. Instructions must be Markdown. Do not invent missing values.\n\n${markdown.slice(0, 180_000)}`;
  let parsed: ReturnType<typeof aiRecipeSchema.parse> | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await env.AI.run(env.RECIPE_MODEL, {
        messages: [
          { role: "system", content: "You extract cooking recipes into the exact requested JSON schema." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_schema", json_schema: aiRecipeJsonSchema },
      });
      parsed = aiRecipeSchema.parse(aiResponse(result));
      break;
    } catch (error) { lastError = error; }
  }
  if (!parsed) throw new Error(`The recipe model could not produce a valid draft${lastError instanceof Error ? `: ${lastError.message}` : "."}`);
  await saveFacts(env.COOKBOOK, parsed.ingredientFacts);
  return buildDraft(env.COOKBOOK, {
    title: parsed.title,
    instructionsMd: parsed.instructionsMd,
    cookMinutes: parsed.cookMinutes,
    servings: parsed.servings,
    imageUrl: parsed.imageUrl && /^https?:\/\//.test(parsed.imageUrl) ? parsed.imageUrl : null,
    ingredients: parsed.ingredients,
  }, sourceUrl, tier);
}

async function markdownFromHtml(env: Env, html: string): Promise<string> {
  const result = await env.AI.toMarkdown({ name: "recipe.html", blob: new Blob([html], { type: "text/html" }) });
  return conversionData(result).trim();
}

export async function importRecipe(env: Env, input: { url?: string; text?: string }): Promise<RecipeInput & { importTier: string }> {
  const pasted = input.text?.trim();
  if (pasted) return extractWithAi(env, pasted.slice(0, 180_000), null, "ai");
  if (!input.url) throw new Error("Enter a recipe URL or paste recipe text.");
  let url: URL;
  try { url = new URL(input.url); } catch { throw new Error("Enter a valid recipe URL."); }
  if (!(["http:", "https:"].includes(url.protocol))) throw new Error("Recipe URLs must use http or https.");
  if (url.username || url.password) throw new Error("Recipe URLs cannot contain credentials.");
  const hostname = url.hostname.toLocaleLowerCase().replace(/^\[|\]$/g, "");
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  const privateIpv4 = ipv4 && (
    Number(ipv4[1]) === 10 || Number(ipv4[1]) === 127 ||
    (Number(ipv4[1]) === 169 && Number(ipv4[2]) === 254) ||
    (Number(ipv4[1]) === 172 && Number(ipv4[2]) >= 16 && Number(ipv4[2]) <= 31) ||
    (Number(ipv4[1]) === 192 && Number(ipv4[2]) === 168)
  );
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1" || privateIpv4) {
    throw new Error("Private-network recipe URLs are not allowed.");
  }

  const response = await fetch(url, { headers: { "user-agent": "Sous-Chef Recipe Importer/1.0", accept: "text/html" }, redirect: "follow" });
  const html = await readLimited(response);
  const jsonLd = recipeFromJsonLd(html);
  if (jsonLd) {
    const draft = await fromJsonLd(env.COOKBOOK, jsonLd, url.href);
    if (draft) return draft;
  }

  const markdown = await markdownFromHtml(env, html);
  if (markdown.length >= 80) return extractWithAi(env, markdown, url.href, "ai");

  const browserResponse = await env.BROWSER.quickAction("markdown", {
    url: url.href,
    gotoOptions: { waitUntil: "networkidle2", timeout: 20_000 },
  });
  if (!browserResponse.ok) throw new Error("The page needs a browser, but Browser Rendering could not load it. Paste the recipe text instead.");
  const browserResult: unknown = await browserResponse.json();
  const browserMarkdown = isObject(browserResult) && typeof browserResult.result === "string" ? browserResult.result.trim() : "";
  if (browserMarkdown.length < 80) throw new Error("No usable recipe text was found. Paste the recipe text instead.");
  return extractWithAi(env, browserMarkdown, url.href, "browser");
}
