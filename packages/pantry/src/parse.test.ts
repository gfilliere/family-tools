import { describe, expect, it } from "vitest";
import { parseIngredientLine } from "./parse";

describe("parseIngredientLine", () => {
  it("reads quantity, unit and name", () => {
    expect(parseIngredientLine("400 g Kartoffeln")).toMatchObject({ qty: 400, unit: "g", name: "Kartoffeln" });
    expect(parseIngredientLine("3 EL Olivenöl")).toMatchObject({ qty: 3, unit: "tbsp", name: "Olivenöl" });
    expect(parseIngredientLine("2 Tablespoons fish sauce")).toMatchObject({ qty: 2, unit: "tbsp", name: "fish sauce" });
    expect(parseIngredientLine("1 1/2 pounds flank steak, thinly sliced")).toMatchObject({ qty: 1.5, unit: "lb", name: "flank steak" });
  });

  it("takes the upper bound of a range and keeps it out of the name", () => {
    const parsed = parseIngredientLine("2-3 green onions, plus more to garnish");
    expect(parsed).toMatchObject({ qty: 3, unit: null, name: "green onions", range: [2, 3] });
    expect(parseIngredientLine("800g–1kg Seelachs fillets (thawed)")).toMatchObject({ qty: 1000, unit: "g" });
    expect(parseIngredientLine("1-1 1/2 cups grilled chicken, cubed")).toMatchObject({ qty: 1.5, unit: "cup" });
  });

  it("prefers a metric amount written in parentheses", () => {
    expect(parseIngredientLine("1 tbsp (14g) unsalted butter")).toMatchObject({ qty: 14, unit: "g", name: "unsalted butter" });
    expect(parseIngredientLine("4 lb (1.8 kg) skin-on pork belly")).toMatchObject({ qty: 1.8, unit: "kg" });
    expect(parseIngredientLine("5 cups (1,200ml) hot water")).toMatchObject({ qty: 1200, unit: "ml" });
    // A per-serving note far from the leading amount is not the amount.
    expect(parseIngredientLine("5-6 cups hot cooked rice, about 1 cup (210g) for each serving")).toMatchObject({ qty: 6, unit: "cup" });
  });

  it("reads package sizes", () => {
    expect(parseIngredientLine("1 (28 ounce) can crushed tomatoes")).toMatchObject({ qty: 1, unit: "can", name: "crushed tomatoes", pack: { qty: 28, unit: "oz" } });
    expect(parseIngredientLine("1 tin (400g) chopped tomatoes")).toMatchObject({ qty: 400, unit: "g", name: "chopped tomatoes" });
  });

  it("handles bullets, trailing amounts and unicode fractions", () => {
    expect(parseIngredientLine("•; 500 g Hokkaido-Kürbis")).toMatchObject({ qty: 500, unit: "g", name: "Hokkaido-Kürbis" });
    expect(parseIngredientLine("Olive oil — 30ml (approx. 2 tbsp)")).toMatchObject({ qty: 30, unit: "ml", name: "Olive oil" });
    expect(parseIngredientLine("Salt — to taste")).toMatchObject({ qty: null, name: "Salt", flags: { toTaste: true } });
    expect(parseIngredientLine("½ tsp freshly cracked black pepper")).toMatchObject({ qty: 0.5, unit: "tsp" });
    expect(parseIngredientLine("Basil leaves — a handful")).toMatchObject({ qty: 1, unit: "handful" });
  });

  it("detects flags and drops prep notes", () => {
    const parsed = parseIngredientLine("Toasted sesame seeds (optional), to serve");
    expect(parsed.flags).toEqual({ optional: true, toTaste: false, serving: true });
    expect(parsed.name).toBe("Toasted sesame seeds");
    expect(parseIngredientLine("Optional: green veg such as broccoli").example).toBe("broccoli");
    expect(parseIngredientLine("2 shallots, sliced").name).toBe("shallots");
  });

  it("treats a pinch as no quantity and understands heads", () => {
    expect(parseIngredientLine("Generous pinch of toasted sesame seeds")).toMatchObject({ qty: null, unit: null });
    expect(parseIngredientLine("Garlic head — 1/2 a whole garlic head")).toMatchObject({ qty: 0.5, unit: "head" });
  });
});

describe("French measures", () => {
  it.each([
    ["2 c. à s. d'huile d'olive", { qty: 2, unit: "tbsp", name: "huile d'olive" }],
    ["1 cuillère à café de cumin", { qty: 1, unit: "tsp", name: "cumin" }],
    ["3 gousses d'ail hachées", { qty: 3, unit: "clove", name: "ail" }],
    ["200 g de farine", { qty: 200, unit: "g", name: "farine" }],
    ["25 cl de crème liquide", { qty: 25, unit: "cl", name: "crème liquide" }],
    ["1 botte de coriandre", { qty: 1, unit: "bunch", name: "coriandre" }],
    ["une pincée de sel", { qty: null, unit: null, name: "sel" }],
    ["2 oignons émincés", { qty: 2, unit: null, name: "oignons" }],
    ["Poivre du moulin, au goût", { qty: null, unit: null, name: "Poivre du moulin" }],
  ])("parses %s", (line, expected) => {
    expect(parseIngredientLine(line)).toMatchObject(expected);
  });
});
