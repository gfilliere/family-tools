import { describe, expect, it } from "vitest";
import { emptyRecipeDraft } from "./domain/recipe";
import { isRoute, routeFromPath, routePath, type Route } from "./routing";

describe("cookbook routing", () => {
  it.each([
    ["/cookbook/", { name: "catalog" }],
    ["/cookbook/import", { name: "import" }],
    ["/cookbook/recipes/42", { name: "detail", recipeId: 42 }],
  ])("reads %s", (path, expected) => {
    expect(routeFromPath(path)).toEqual(expected);
  });

  it("uses safe screens when an editor draft is not in browser history", () => {
    expect(routeFromPath("/cookbook/recipes/42/edit")).toEqual({
      name: "detail",
      recipeId: 42,
    });
    expect(routeFromPath("/cookbook/import/review")).toEqual({ name: "import" });
  });

  it("writes stable URLs for each screen", () => {
    const newRecipe: Route = {
      name: "editor",
      draft: emptyRecipeDraft(),
      returnTo: { name: "catalog" },
    };
    const importedRecipe: Route = {
      name: "editor",
      draft: emptyRecipeDraft(),
      returnTo: { name: "import" },
    };
    const editedRecipe: Route = {
      name: "editor",
      draft: { ...emptyRecipeDraft(), id: 42 },
      returnTo: { name: "detail", recipeId: 42 },
    };

    expect(routePath(newRecipe)).toBe("/cookbook/new");
    expect(routePath(importedRecipe)).toBe("/cookbook/import/review");
    expect(routePath(editedRecipe)).toBe("/cookbook/recipes/42/edit");
  });

  it("rejects malformed history routes", () => {
    expect(isRoute({ name: "detail", recipeId: 0 })).toBe(false);
    expect(isRoute({ name: "editor", draft: null, returnTo: { name: "catalog" } })).toBe(false);
  });
});
