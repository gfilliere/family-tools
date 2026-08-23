import { describe, expect, it } from "vitest";
import { aiRecipeSchema, ingredientIdentitySchema, recipeInputSchema } from "./schema";

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

  it("requires an English shopping identity for every extracted ingredient", () => {
    const result = aiRecipeSchema.safeParse({
      title: "Zwiebelsuppe",
      instructionsMd: null,
      cookMinutes: null,
      servings: null,
      imageUrl: null,
      ingredients: [{ original: "2 große Zwiebeln", name: "große Zwiebeln" }],
      ingredientFacts: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("ingredient identity schema", () => {
  it("accepts a German-to-English shopping mapping", () => {
    expect(ingredientIdentitySchema.parse({
      ingredients: [{
        sourceName: "Zwiebeln",
        canonicalName: "onion",
        aisle: "Produce",
        gramsPerCup: null,
      }],
    }).ingredients[0]?.canonicalName).toBe("onion");
  });
});
