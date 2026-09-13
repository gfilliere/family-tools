import { describe, expect, it } from "vitest";
import { Knowledge, aliasKey } from "./knowledge";

/** Just enough of D1 for Knowledge: remembers writes, returns empty reads. */
function fakeDb(seed: { aliases?: [string, string][]; overrides?: [string, string | null, number | null][] } = {}): D1Database {
  const writes: { sql: string; values: unknown[] }[] = [];
  const results = (sql: string) => {
    if (sql.includes("FROM learned_aliases")) return (seed.aliases ?? []).map(([alias_normalised, ingredient_id]) => ({ alias_normalised, ingredient_id }));
    if (sql.includes("FROM ingredient_overrides")) return (seed.overrides ?? []).map(([ingredient_id, aisle, staple]) => ({ ingredient_id, aisle, staple, name: null, measure: null, density: null, piece_grams: null, piece_unit: null }));
    return [];
  };
  const statement = (sql: string, values: unknown[] = []) => ({
    bind: (...bound: unknown[]) => statement(sql, bound),
    run: async () => { writes.push({ sql, values }); return { meta: { changes: 1 } }; },
    all: async () => ({ results: results(sql) }),
    first: async () => results(sql)[0] ?? null,
    sql,
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: { sql: string }[]) => statements.map((item) => ({ results: results(item.sql) })),
    writes,
  } as unknown as D1Database;
}

describe("Knowledge.resolve", () => {
  it("uses the cookbook's metric amount and the catalog identity", async () => {
    const knowledge = await Knowledge.load(fakeDb());
    const [line] = knowledge.resolve({ name: "flank steak, thinly sliced", original: "1 1/2 pounds flank steak, thinly sliced", qty: 680, unit: "g" });
    expect(line?.entry?.id).toBe("beef");
    expect(line?.shopping).toEqual({ qty: 680, unit: "g" });
  });

  it("recovers packaging from the original line when the cookbook only has a count", async () => {
    const knowledge = await Knowledge.load(fakeDb());
    const [line] = knowledge.resolve({ name: "can crushed tomatoes", original: "1 (28 ounce) can crushed tomatoes", qty: 1, unit: null });
    expect(line?.entry?.id).toBe("canned-tomato");
    expect(line?.unit).toBe("can");
    expect(line?.shopping?.qty).toBeCloseTo(1.98, 1);
  });

  it("splits a line that names two ingredients", async () => {
    const knowledge = await Knowledge.load(fakeDb());
    const lines = knowledge.resolve({ name: "Kosher salt and black pepper", original: "kosher salt and black pepper", qty: null, unit: null });
    expect(lines.map((line) => line.entry?.id)).toEqual(["salt", "pepper"]);
  });

  it("prefers a learned alias over the catalog", async () => {
    const knowledge = await Knowledge.load(fakeDb({ aliases: [[aliasKey("Seelachs fillets"), "salmon"]] }));
    const [line] = knowledge.resolve({ name: "Seelachs fillets", original: "800g–1kg Seelachs fillets", qty: 1000, unit: "g" });
    expect(line?.entry?.id).toBe("salmon");
    expect(line?.shopping).toEqual({ qty: 1000, unit: "g" });
  });

  it("falls back to the cookbook's canonical name for unknown spellings", async () => {
    const knowledge = await Knowledge.load(fakeDb());
    const [line] = knowledge.resolve({ name: "Xyzzy", canonicalName: "spring onion", qty: 2, unit: null });
    expect(line?.entry?.id).toBe("spring-onion");
  });

  it("learns a correction for the spelling only, not for the whole ingredient", async () => {
    const knowledge = await Knowledge.load(fakeDb());
    await knowledge.learnAlias("grilled chicken, cubed or shredded", "chicken-breast");
    expect(knowledge.resolve({ name: "grilled chicken, cubed or shredded", original: "1 1/2 cups grilled chicken, cubed or shredded" })[0]?.entry?.id).toBe("chicken-breast");
    expect(knowledge.resolve({ name: "whole chicken", original: "1 whole chicken" })[0]?.entry?.id).toBe("chicken");
  });

  it("applies attribute overrides to resolution and views", async () => {
    const knowledge = await Knowledge.load(fakeDb());
    await knowledge.setOverride("butter", { name: "Butter (Kerrygold)", measure: "piece", pieceGrams: 250 });
    const [line] = knowledge.resolve({ name: "butter", original: "500 g butter" });
    expect(line?.entry?.name).toBe("Butter (Kerrygold)");
    expect(line?.shopping).toEqual({ qty: 2, unit: "piece" });
    expect(knowledge.view("butter")).toMatchObject({ overridden: ["name", "measure", "pieceGrams"], aisle: "Dairy" });
    await knowledge.clearOverride("butter");
    expect(knowledge.view("butter")?.overridden).toEqual([]);
  });

  it("applies aisle and staple overrides", async () => {
    const knowledge = await Knowledge.load(fakeDb({ overrides: [["tofu", "Produce", null], ["soy-sauce", null, 0]] }));
    expect(knowledge.effective(knowledge.entry("tofu")!)).toEqual({ aisle: "Produce", staple: false });
    expect(knowledge.effective(knowledge.entry("soy-sauce")!)).toEqual({ aisle: "Pantry", staple: false });
  });

  it("parses quick-add text on its own", async () => {
    const knowledge = await Knowledge.load(fakeDb());
    expect(knowledge.resolve({ name: "2 courgettes", original: "2 courgettes" })[0]).toMatchObject({ qty: 2, shopping: { qty: 2, unit: "piece" } });
    expect(knowledge.resolve({ name: "500g Hackfleisch", original: "500g Hackfleisch" })[0]?.entry?.id).toBe("ground-beef");
    expect(knowledge.resolve({ name: "milk", original: "milk" })[0]?.entry?.id).toBe("milk");
  });
});
