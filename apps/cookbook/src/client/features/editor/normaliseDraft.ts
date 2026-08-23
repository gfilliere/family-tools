import type { RecipeDraft, RecipePayload } from "../../domain/recipe";
import { ingredientAmount } from "../../lib/format";

export function normaliseDraft(draft: RecipeDraft): RecipePayload {
  return {
    title: draft.title.trim(),
    instructionsMd: draft.instructionsMd,
    cookMinutes: draft.cookMinutes,
    servings: draft.servings,
    difficulty: draft.difficulty,
    rating: draft.rating,
    sourceUrl: draft.sourceUrl,
    imageUrl: draft.imageUrl,
    notes: draft.notes,
    tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    ingredients: draft.ingredients
      .filter((ingredient) => ingredient.name.trim() || ingredient.original.trim())
      .map((ingredient) => {
        const name = ingredient.name.trim() || ingredient.original.trim();
        return {
          name,
          canonicalName: ingredient.canonicalName?.trim() || null,
          qty: ingredient.qty,
          unit: ingredient.unit,
          original: ingredient.original.trim() || ingredientAmount({ ...ingredient, name }),
          conversionNote: ingredient.conversionNote,
        };
      }),
  };
}
