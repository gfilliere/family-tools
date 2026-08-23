import { describe, expect, it } from "vitest";
import { ingredientAmount } from "./format";

describe("ingredientAmount", () => {
  it("formats measured and unmeasured ingredients", () => {
    expect(ingredientAmount({
      name: "flour",
      qty: 125.555,
      unit: "g",
      original: "125.555 g flour",
    })).toBe("125.56 g flour");

    expect(ingredientAmount({
      name: "salt",
      qty: null,
      unit: null,
      original: "salt to taste",
    })).toBe("salt");
  });
});
