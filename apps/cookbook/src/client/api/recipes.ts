import type {
  Recipe,
  RecipeDraft,
  RecipePayload,
  RecipeSummary,
} from "../domain/recipe";
import { requestJson } from "./client";

const API_BASE = "/cookbook/api";

export type CatalogSort = "stale" | "newest" | "title";

export interface CatalogFilters {
  query: string;
  sort: CatalogSort;
}

export type ImportInput = { url: string } | { text: string };

export async function listRecipes(
  filters: CatalogFilters,
): Promise<RecipeSummary[]> {
  const params = new URLSearchParams({ sort: filters.sort });
  if (filters.query.trim()) params.set("q", filters.query.trim());

  const body = await requestJson<{ recipes: RecipeSummary[] }>(
    `${API_BASE}/recipes?${params}`,
  );
  return body.recipes;
}

export async function getRecipe(id: number): Promise<Recipe> {
  const body = await requestJson<{ recipe: Recipe }>(`${API_BASE}/recipes/${id}`);
  return body.recipe;
}

export async function saveRecipe(
  id: number | undefined,
  payload: RecipePayload,
): Promise<Recipe> {
  const body = await requestJson<{ recipe: Recipe }>(
    id ? `${API_BASE}/recipes/${id}` : `${API_BASE}/recipes`,
    {
      method: id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return body.recipe;
}

export async function deleteRecipe(id: number): Promise<void> {
  await requestJson<{ deleted: true }>(`${API_BASE}/recipes/${id}`, {
    method: "DELETE",
  });
}

export async function markRecipeCooked(id: number): Promise<string> {
  const body = await requestJson<{ cookedAt: string }>(
    `${API_BASE}/recipes/${id}/cooked`,
    { method: "POST" },
  );
  return body.cookedAt;
}

export async function addRecipeToList(id: number): Promise<number> {
  const body = await requestJson<{ added: number }>(
    `${API_BASE}/recipes/${id}/to-list`,
    { method: "POST" },
  );
  return body.added;
}

export async function importRecipe(input: ImportInput): Promise<RecipeDraft> {
  const body = await requestJson<{ draft: RecipeDraft }>(`${API_BASE}/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return body.draft;
}
