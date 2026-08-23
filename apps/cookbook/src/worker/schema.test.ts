import { describe, expect, it } from "vitest";
import { aiRecipeSchema, recipeInputSchema } from "./schema";

describe("recipe title schema", () => {
  it("sanitises titles when a recipe is saved", () => {
    const recipe = recipeInputSchema.parse({
      title: "World&39;s <em>Best</em>",
      ingredients: [],
    });
    expect(recipe.title).toBe("World's Best");
  });

  it("rejects titles that contain only markup", () => {
    expect(() => recipeInputSchema.parse({ title: "<br>", ingredients: [] })).toThrow();
  });
});

describe("AI recipe schema", () => {
  it("requires at least one extracted ingredient", () => {
    const result = aiRecipeSchema.safeParse({
      title: "Lasagna",
      instructionsMd: null,
      cookMinutes: null,
      servings: null,
      imageUrl: null,
      ingredients: [],
      ingredientFacts: [],
    });
    expect(result.success).toBe(false);
  });
});
