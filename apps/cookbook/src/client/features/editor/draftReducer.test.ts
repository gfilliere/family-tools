import { describe, expect, it } from "vitest";
import { emptyRecipeDraft } from "../../domain/recipe";
import { draftReducer } from "./draftReducer";

describe("draftReducer", () => {
  it("updates, adds, and removes ingredients without mutating the draft", () => {
    const initial = emptyRecipeDraft();
    const named = draftReducer(initial, {
      type: "ingredientChanged",
      index: 0,
      patch: { name: "flour" },
    });
    const added = draftReducer(named, { type: "ingredientAdded" });
    const removed = draftReducer(added, { type: "ingredientRemoved", index: 0 });

    expect(initial.ingredients[0]?.name).toBe("");
    expect(named.ingredients[0]?.name).toBe("flour");
    expect(added.ingredients).toHaveLength(2);
    expect(removed.ingredients).toEqual([
      { name: "", qty: null, unit: null, original: "" },
    ]);
  });

  it("updates scalar fields and canonicalizes comma-separated tag spacing", () => {
    const initial = emptyRecipeDraft();
    const titled = draftReducer(initial, {
      type: "fieldChanged",
      field: "title",
      value: "Bread",
    });
    const tagged = draftReducer(titled, {
      type: "tagsChanged",
      value: "baking,      weekend",
    });

    expect(tagged.title).toBe("Bread");
    expect(tagged.tags).toEqual(["baking", "weekend"]);
  });
});
