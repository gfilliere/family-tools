import { describe, expect, it } from "vitest";
import { emptyRecipeDraft } from "../../domain/recipe";
import { normaliseDraft } from "./normaliseDraft";

describe("normaliseDraft", () => {
  it("trims fields, removes blank rows, and supplies an original line", () => {
    const draft = emptyRecipeDraft();
    draft.title = "  Bread  ";
    draft.tags = [" baking ", "", " weekend"];
    draft.ingredients = [
      { name: " Mehl ", canonicalName: " flour ", qty: 200, unit: "g", original: "" },
      { name: "", qty: null, unit: null, original: "" },
    ];

    expect(normaliseDraft(draft)).toMatchObject({
      title: "Bread",
      tags: ["baking", "weekend"],
      ingredients: [
        { name: "Mehl", canonicalName: "flour", qty: 200, unit: "g", original: "200 g Mehl" },
      ],
    });
  });
});
