import { describe, expect, it } from "vitest";
import { matcher } from "./match";

const id = (name: string) => matcher.resolveName(name).map((item) => item.entry?.id ?? null);

describe("matcher", () => {
  it("matches on word boundaries with the longest alias winning", () => {
    expect(id("flank steak")).toEqual(["beef"]);
    expect(id("steak")).toEqual(["beef"]);
    expect(id("chicken stock")).toEqual(["chicken-stock"]);
    expect(id("garlic powder")).toEqual(["garlic-powder"]);
    expect(id("black pepper")).toEqual(["pepper"]);
    expect(id("lemon juice")).toEqual(["lemon"]);
    expect(id("toasted sesame oil")).toEqual(["sesame-oil"]);
    expect(id("cream cheese")).toEqual(["cream-cheese"]);
  });

  it("ignores preparation words and plurals", () => {
    expect(id("chicken breasts or thighs, thinly sliced")).toEqual(["chicken-breast"]);
    expect(id("crumbled blue cheese or shredded cheddar")).toEqual(["blue-cheese"]);
    expect(id("large tortillas")).toEqual(["tortilla"]);
    expect(id("gluten free tortillas")).toEqual(["tortilla"]);
    expect(id("low-fat cream cheese")).toEqual(["cream-cheese"]);
    expect(id("light cheese")).toEqual(["cheese"]);
  });

  it("speaks German", () => {
    expect(id("Zwiebeln")).toEqual(["onion"]);
    expect(id("Hähnchenbrustfilet")).toEqual(["chicken-breast"]);
    expect(id("Knoblauchzehen")).toEqual(["garlic"]);
    expect(id("Brokkoli")).toEqual(["broccoli"]);
    expect(id("Feta Light")).toEqual(["feta"]);
    expect(id("Seelachs fillets")).toEqual(["white-fish"]);
    expect(id("Magerquark")).toEqual(["quark"]);
  });

  it("splits conjunctions into several ingredients", () => {
    expect(id("Kosher salt and black pepper")).toEqual(["salt", "pepper"]);
    expect(id("Salz & Pfeffer")).toEqual(["salt", "pepper"]);
    expect(id("avocado, sesame seeds and green onions")).toEqual(["avocado", "sesame-seed", "spring-onion"]);
    expect(id("Salt, pepper, paprika, cumin, turmeric, coriander & garam masala"))
      .toEqual(["salt", "pepper", "paprika", "cumin", "turmeric", "coriander-seed", "garam-masala"]);
  });

  it("takes the first option of an alternative", () => {
    expect(id("butter, ghee, or oil")).toEqual(["butter"]);
    expect(id("mayo, or yogurt")).toEqual(["mayo"]);
    expect(id("uncooked shrimp, chicken, or extra-firm tofu")).toEqual(["shrimp"]);
    expect(id("Magerquark or Greek yogurt")).toEqual(["quark"]);
    expect(id("Japanese sweet potatoes/sweet potatoes")).toEqual(["sweet-potato"]);
  });

  it("returns null for unknown food", () => {
    expect(id("dragon scales")).toEqual([null]);
  });
});

describe("matcher in French", () => {
  it("resolves French names", () => {
    expect(id("blancs de poulet")).toEqual(["chicken-breast"]);
    expect(id("oignon rouge")).toEqual(["red-onion"]);
    expect(id("crème fraîche épaisse")).toEqual(["creme-fraiche"]);
    expect(id("gousses d'ail")).toEqual(["garlic"]);
    expect(id("huile d'olive vierge extra")).toEqual(["olive-oil"]);
    expect(id("Sel et poivre")).toEqual(["salt", "pepper"]);
    expect(id("beurre ou huile")).toEqual(["butter"]);
    expect(id("pommes de terre")).toEqual(["potato"]);
    expect(id("lardons fumés")).toEqual(["bacon"]);
  });
});
