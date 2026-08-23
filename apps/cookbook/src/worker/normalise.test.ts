import { describe, expect, it } from "vitest";
import { parseIngredientLine } from "./normalise";

describe("German ingredient measures", () => {
  it.each([
    ["2 Esslöffel Öl", { qty: 2, unit: "tbsp", name: "Öl" }],
    ["3 Teelöffel Salz", { qty: 3, unit: "tsp", name: "Salz" }],
    ["500 Gramm Mehl", { qty: 500, unit: "g", name: "Mehl" }],
    ["1 Päckchen Vanillezucker", { qty: 1, unit: null, name: "Vanillezucker" }],
    ["2 Bund Frühlingszwiebeln", { qty: 2, unit: null, name: "Frühlingszwiebeln" }],
  ])("parses %s", (line, expected) => {
    expect(parseIngredientLine(line)).toEqual(expected);
  });
});
