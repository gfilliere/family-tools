import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID, type CatalogEntry } from "@family-tools/pantry";
import { buildCards, cardsToText, type ItemRow, type Resolved } from "./cards";

let nextId = 1;
function row(partial: Partial<ItemRow> & { ingredient_id: string; name: string }): ItemRow {
  return {
    id: nextId++,
    display_name: null, canonical_name: null, original: null, qty: null, unit: null, base_qty: null, base_unit: null,
    aisle: null, flags: null, checked_at: null, source_kind: "recipe", source_id: 1, source_title: "Steak Bowls",
    added_at: "2026-09-12 10:00:00",
    ...partial,
  };
}

const lookup = (id: string | null): Resolved | null => {
  const entry: CatalogEntry | undefined = id ? CATALOG_BY_ID.get(id) : undefined;
  return entry ? { entry, aisle: entry.aisle, staple: entry.staple ?? false } : null;
};

describe("buildCards", () => {
  it("merges every line of one ingredient into one card with a summed total", () => {
    const cards = buildCards([
      row({ ingredient_id: "butter", name: "butter, ghee, or oil", qty: 25, unit: "g", base_qty: 25, base_unit: "g" }),
      row({ ingredient_id: "butter", name: "butter or oil", qty: 2, unit: "tbsp", base_qty: 27, base_unit: "g", source_title: "Noodle Bowls" }),
    ], lookup);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ name: "butter", aisle: "Dairy", total: "50 g", partial: false, checked: false });
    expect(cards[0]?.parts.map((part) => part.amount)).toEqual(["25 g", "2 tbsp"]);
  });

  it("keeps an unconvertible part visible and marks the total as partial", () => {
    const cards = buildCards([
      row({ ingredient_id: "chicken-breast", name: "chicken breast", qty: 650, unit: "g", base_qty: 650, base_unit: "g" }),
      row({ ingredient_id: "chicken-breast", name: "grilled chicken", qty: 1, unit: null }),
    ], lookup);
    expect(cards[0]).toMatchObject({ total: "650 g", partial: true });
    expect(cards[0]?.parts[1]?.converted).toBe(false);
  });

  it("groups staples separately and orders groups like a supermarket", () => {
    const cards = buildCards([
      row({ ingredient_id: "salt", name: "Kosher salt" }),
      row({ ingredient_id: "beef", name: "flank steak", qty: 680, unit: "g", base_qty: 680, base_unit: "g" }),
      row({ ingredient_id: "broccoli", name: "broccoli florets", qty: 3, unit: "cup", base_qty: 0.64, base_unit: "piece" }),
    ], lookup);
    expect(cards.map((card) => [card.name, card.group])).toEqual([
      ["broccoli", "Produce"], ["beef", "Meat"], ["salt", "Check the pantry"],
    ]);
    expect(cards[0]?.total).toBe("1");
  });

  it("keeps generic bucket entries apart by their own name", () => {
    const cards = buildCards([
      row({ ingredient_id: "dried-herbs", display_name: "oregano", name: "dried oregano" }),
      row({ ingredient_id: "dried-herbs", display_name: "thyme", name: "Thymian" }),
    ], lookup);
    expect(cards.map((card) => card.name)).toEqual(["oregano", "thyme"]);
  });

  it("sinks fully checked cards and drops rows without a known ingredient", () => {
    const cards = buildCards([
      row({ ingredient_id: "egg", name: "eggs", qty: 2, base_qty: 2, base_unit: "piece", checked_at: "2026-09-12 11:00:00" }),
      row({ ingredient_id: "milk", name: "milk", qty: 1000, unit: "ml", base_qty: 1000, base_unit: "ml" }),
      row({ ingredient_id: "nope", name: "mystery" }),
    ], lookup);
    expect(cards.map((card) => [card.name, card.checked, card.total])).toEqual([["milk", false, "1 l"], ["egg", true, "2"]]);
  });

  it("exports readable text", () => {
    const text = cardsToText(buildCards([
      row({ ingredient_id: "beef", name: "flank steak", qty: 680, unit: "g", base_qty: 680, base_unit: "g" }),
      row({ ingredient_id: "salt", name: "salt" }),
    ], lookup));
    expect(text).toBe("MEAT\n- 680 g beef (Steak Bowls)\n\nCHECK THE PANTRY\n- salt (Steak Bowls)");
  });
});
