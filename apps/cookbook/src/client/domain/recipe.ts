export type Difficulty = "easy" | "medium" | "hard";
export type IngredientUnit = "g" | "ml" | "tsp" | "tbsp";

export interface Ingredient {
  id?: number;
  name: string;
  canonicalName?: string | null;
  qty: number | null;
  unit: IngredientUnit | null;
  original: string;
  conversionNote?: string | null;
}

export interface RecipeSummary {
  id: number;
  title: string;
  cookMinutes: number | null;
  rating: number | null;
  lastCookedAt: string | null;
  ingredientCount: number;
  tags: string[];
}

export interface Recipe {
  id: number;
  title: string;
  instructionsMd: string | null;
  cookMinutes: number | null;
  servings: number | null;
  difficulty: Difficulty | null;
  rating: number | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  notes: string | null;
  lastCookedAt: string | null;
  createdAt?: string;
  createdBy?: string | null;
  ingredients: Ingredient[];
  tags: string[];
}

export interface RecipeDraft {
  id?: number;
  title: string;
  instructionsMd: string | null;
  cookMinutes: number | null;
  servings: number | null;
  difficulty: Difficulty | null;
  rating: number | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  notes: string | null;
  ingredients: Ingredient[];
  tags: string[];
  importTier?: string;
}

export type RecipePayload = Omit<RecipeDraft, "id" | "importTier">;

const EMPTY_INGREDIENT: Ingredient = {
  name: "",
  canonicalName: null,
  qty: null,
  unit: null,
  original: "",
};

export function emptyRecipeDraft(): RecipeDraft {
  return {
    title: "",
    instructionsMd: "",
    cookMinutes: null,
    servings: null,
    difficulty: null,
    rating: null,
    sourceUrl: null,
    imageUrl: null,
    notes: "",
    ingredients: [{ ...EMPTY_INGREDIENT }],
    tags: [],
  };
}

export function recipeToDraft(recipe: Recipe): RecipeDraft {
  return {
    id: recipe.id,
    title: recipe.title,
    instructionsMd: recipe.instructionsMd,
    cookMinutes: recipe.cookMinutes,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    rating: recipe.rating,
    sourceUrl: recipe.sourceUrl,
    imageUrl: recipe.imageUrl,
    notes: recipe.notes,
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
    tags: [...recipe.tags],
  };
}
