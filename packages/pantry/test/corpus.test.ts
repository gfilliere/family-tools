import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveLine } from "../src/index";

type Expected = Record<string, string[]>;

/**
 * Golden test over real imported recipe lines (English and German).
 * Every line must resolve to at least one catalog entry, and the mapping must not drift.
 * Set PANTRY_UPDATE_CORPUS=1 to accept intentional changes.
 */
describe("recipe corpus", () => {
  const lines = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8")) as string[];
  const expectedUrl = new URL("./corpus.expected.json", import.meta.url);
  const actual: Expected = {};
  for (const line of lines) actual[line] = resolveLine(line).map((item) => item.entry?.id ?? "?");

  it("resolves every line to a catalog entry", () => {
    const unmatched = Object.entries(actual).filter(([, ids]) => ids.includes("?")).map(([line]) => line);
    expect(unmatched).toEqual([]);
  });

  it("matches the frozen expectations", () => {
    if (process.env.PANTRY_UPDATE_CORPUS) writeFileSync(expectedUrl, `${JSON.stringify(actual, null, 1)}\n`);
    const expected = JSON.parse(readFileSync(expectedUrl, "utf8")) as Expected;
    expect(actual).toEqual(expected);
  });
});
