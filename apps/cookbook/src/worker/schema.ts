import { z } from "zod";

export const ingredientInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  qty: z.number().finite().positive().nullable(),
  unit: z.enum(["g", "ml", "tsp", "tbsp"]).nullable(),
  original: z.string().trim().min(1).max(500),
  conversionNote: z.string().trim().max(300).nullable().optional(),
  aisle: z.string().trim().max(60).nullable().optional(),
});

export const recipeInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  instructionsMd: z.string().trim().max(50_000).nullable().optional(),
  cookMinutes: z.number().int().min(0).max(10_080).nullable().optional(),
  servings: z.number().int().positive().max(1_000).nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  sourceUrl: z.string().url().max(2_000).nullable().optional(),
  imageUrl: z.string().url().max(2_000).nullable().optional(),
  notes: z.string().trim().max(10_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  ingredients: z.array(ingredientInputSchema).max(300),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type IngredientInput = z.infer<typeof ingredientInputSchema>;

export const aiRecipeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  instructionsMd: z.string().max(50_000).nullable(),
  cookMinutes: z.number().int().min(0).max(10_080).nullable(),
  servings: z.number().int().positive().max(1_000).nullable(),
  imageUrl: z.string().max(2_000).nullable(),
  ingredients: z.array(z.object({
    original: z.string().trim().min(1).max(500),
    name: z.string().trim().min(1).max(160),
  })).min(1).max(300),
  ingredientFacts: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    aisle: z.enum(["Produce", "Dairy & Eggs", "Meat & Seafood", "Bakery", "Pantry", "Spices", "Frozen", "Beverages", "Household", "Other"]),
    gramsPerCup: z.number().positive().max(2_000).nullable(),
  })).max(300),
});

export const aiRecipeJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    instructionsMd: { type: ["string", "null"] },
    cookMinutes: { type: ["integer", "null"] },
    servings: { type: ["integer", "null"] },
    imageUrl: { type: ["string", "null"] },
    ingredients: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: { original: { type: "string" }, name: { type: "string" } },
        required: ["original", "name"],
      },
    },
    ingredientFacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          aisle: { type: "string", enum: ["Produce", "Dairy & Eggs", "Meat & Seafood", "Bakery", "Pantry", "Spices", "Frozen", "Beverages", "Household", "Other"] },
          gramsPerCup: { type: ["number", "null"] },
        },
        required: ["name", "aisle", "gramsPerCup"],
      },
    },
  },
  required: ["title", "instructionsMd", "cookMinutes", "servings", "imageUrl", "ingredients", "ingredientFacts"],
} as const;
