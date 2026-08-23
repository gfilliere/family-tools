import { describe, expect, it } from "vitest";
import { normaliseName, sameMergeBucket } from "./identity";

describe("shopping item identities", () => {
  it("normalises display spelling without changing the stored label", () => {
    expect(normaliseName("  ONIONS  ")).toBe("onion");
    expect(normaliseName("Zwiebeln")).toBe("zwiebeln");
  });

  it("merges translated names through their shared canonical identity", () => {
    expect(sameMergeBucket(
      { canonicalName: "onion", qty: 2, unit: null },
      { canonicalName: "onion", qty: 3, unit: null },
    )).toBe(true);
  });

  it("collapses repeated unmeasured identities but keeps incompatible quantities and units apart", () => {
    expect(sameMergeBucket(
      { canonicalName: "salt", qty: null, unit: null },
      { canonicalName: "salt", qty: null, unit: null },
    )).toBe(true);
    expect(sameMergeBucket(
      { canonicalName: "flour", qty: 200, unit: "g" },
      { canonicalName: "flour", qty: null, unit: null },
    )).toBe(false);
    expect(sameMergeBucket(
      { canonicalName: "flour", qty: 200, unit: "g" },
      { canonicalName: "flour", qty: 200, unit: "ml" },
    )).toBe(false);
  });
});
