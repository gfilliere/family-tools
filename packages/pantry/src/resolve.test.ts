import { describe, expect, it } from "vitest";
import { resolveLine } from "./resolve";
import { formatShoppingAmount, roundShopping } from "./units";

function total(line: string): string[] {
  return resolveLine(line).map((item) =>
    `${item.entry?.id ?? "?"}: ${item.shopping ? formatShoppingAmount(roundShopping(item.shopping), item.entry?.pieceUnit) : "—"}`);
}

describe("resolveLine", () => {
  it("converts recipe amounts into buying amounts", () => {
    expect(total("2 tablespoons butter")).toEqual(["butter: 25 g"]);
    expect(total("1 tbsp (14g) unsalted butter")).toEqual(["butter: 14 g"]);
    expect(total("3 tablespoons lemon juice")).toEqual(["lemon: 1"]);
    expect(total("4 cups shredded lettuce")).toEqual(["lettuce: 1 head"]);
    expect(total("6 slices cooked bacon, crumbled")).toEqual(["bacon: 150 g"]);
    expect(total("12 lasagna noodles")).toEqual(["pasta: 240 g"]);
    expect(total("3 cloves garlic")).toEqual(["garlic: 3 cloves"]);
    expect(total("20g chopped garlic")).toEqual(["garlic: 4 cloves"]);
    expect(total("1 (28 ounce) can crushed tomatoes")).toEqual(["canned-tomato: 2 cans"]);
    expect(total("400g chopped tomatoes")).toEqual(["canned-tomato: 1 can"]);
    expect(total("1 large knob of ginger")).toEqual(["ginger: 50 g"]);
    expect(total("0.5 cup minced onion")).toEqual(["onion: 1"]);
  });

  it("leaves a guess unconverted", () => {
    expect(total("1 small cinnamon stick")).toEqual(["cinnamon: —"]);
    expect(total("Kosher salt, to taste")).toEqual(["salt: —"]);
  });

  it("gives the quantity only to the first of several ingredients", () => {
    expect(total("1 tsp salt and pepper")).toEqual(["salt: 6 g", "pepper: —"]);
  });

  it("switches spice to vegetable when counted", () => {
    expect(resolveLine("2 Paprika")[0]?.entry?.id).toBe("bell-pepper");
    expect(resolveLine("1 tsp Paprika")[0]?.entry?.id).toBe("paprika");
    expect(resolveLine("2 sprigs thyme")[0]?.entry?.id).toBe("spring-herbs");
  });

  it("uses the example after such as", () => {
    expect(resolveLine("Optional: green veg such as broccoli")[0]?.entry?.id).toBe("broccoli");
  });

  it("marks water to be skipped", () => {
    expect(resolveLine("5 cups (1,200ml) hot water")[0]?.entry?.skip).toBe(true);
  });
});
