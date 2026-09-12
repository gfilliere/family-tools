import { describe, expect, it } from "vitest";
import { parseIngredientLine } from "./normalise";

describe("German ingredient measures", () => {
  it.each([
    ["2 Esslöffel Öl", { qty: 2, unit: "tbsp", name: "Öl" }],
    ["3 Teelöffel Salz", { qty: 3, unit: "tsp", name: "Salz" }],
    ["500 Gramm Mehl", { qty: 500, unit: "g", name: "Mehl" }],
    ["1 Päckchen Vanillezucker", { qty: 1, unit: null, name: "Vanillezucker" }],
    ["2 Bund Frühlingszwiebeln", { qty: 2, unit: null, name: "Frühlingszwiebeln" }],
    ["•; 500 g Hokkaido-Kürbis", { qty: 500, unit: "g", name: "Hokkaido-Kürbis" }],
  ])("parses %s", (line, expected) => {
    expect(parseIngredientLine(line)).toEqual(expected);
  });
});

describe("US ingredient measures", () => {
  it.each([
    ["1 1/2 pounds flank steak, thinly sliced", { qty: 1.5, unit: "lb", name: "flank steak" }],
    ["2-3 green onions, plus more to garnish", { qty: 3, unit: null, name: "green onions" }],
    ["1 tbsp (14g) unsalted butter", { qty: 14, unit: "g", name: "unsalted butter" }],
    ["1 (28 ounce) can crushed tomatoes", { qty: 1, unit: null, name: "crushed tomatoes" }],
    ["Olive oil — 30ml (approx. 2 tbsp)", { qty: 30, unit: "ml", name: "Olive oil" }],
  ])("parses %s", (line, expected) => {
    expect(parseIngredientLine(line)).toEqual(expected);
  });
});
