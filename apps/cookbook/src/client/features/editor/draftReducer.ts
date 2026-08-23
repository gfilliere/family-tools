import type { Ingredient, RecipeDraft } from "../../domain/recipe";

type DraftField = Exclude<keyof RecipeDraft, "id" | "importTier" | "ingredients" | "tags">;

export type DraftAction =
  | { type: "fieldChanged"; field: DraftField; value: RecipeDraft[DraftField] }
  | { type: "tagsChanged"; value: string }
  | { type: "ingredientAdded" }
  | { type: "ingredientChanged"; index: number; patch: Partial<Ingredient> }
  | { type: "ingredientRemoved"; index: number };

export function draftReducer(draft: RecipeDraft, action: DraftAction): RecipeDraft {
  switch (action.type) {
    case "fieldChanged":
      return { ...draft, [action.field]: action.value };
    case "tagsChanged":
      return {
        ...draft,
        tags: action.value.split(",").map((tag) => tag.trimStart()),
      };
    case "ingredientAdded":
      return {
        ...draft,
        ingredients: [
          ...draft.ingredients,
          { name: "", qty: null, unit: null, original: "" },
        ],
      };
    case "ingredientChanged":
      return {
        ...draft,
        ingredients: draft.ingredients.map((ingredient, index) => (
          index === action.index ? { ...ingredient, ...action.patch } : ingredient
        )),
      };
    case "ingredientRemoved":
      return {
        ...draft,
        ingredients: draft.ingredients.filter((_, index) => index !== action.index),
      };
  }
}
