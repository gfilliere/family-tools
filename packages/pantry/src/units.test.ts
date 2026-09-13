import { describe, expect, it } from "vitest";
import { formatShoppingAmount, roundShopping } from "./units";

describe("shopping amounts", () => {
  it("rounds to kitchen numbers and rounds pieces up", () => {
    expect(roundShopping({ qty: 683.4, unit: "g" })).toEqual({ qty: 680, unit: "g" });
    expect(roundShopping({ qty: 13.2, unit: "g" })).toEqual({ qty: 13, unit: "g" });
    expect(roundShopping({ qty: 1234, unit: "ml" })).toEqual({ qty: 1250, unit: "ml" });
    expect(roundShopping({ qty: 0.25, unit: "piece" })).toEqual({ qty: 1, unit: "piece" });
    expect(roundShopping({ qty: 2.1, unit: "piece" })).toEqual({ qty: 3, unit: "piece" });
  });

  it("formats for a shopper", () => {
    expect(formatShoppingAmount({ qty: 1250, unit: "g" })).toBe("1.25 kg");
    expect(formatShoppingAmount({ qty: 680, unit: "g" })).toBe("680 g");
    expect(formatShoppingAmount({ qty: 3, unit: "piece" })).toBe("3");
    expect(formatShoppingAmount({ qty: 7, unit: "piece" }, "clove")).toBe("7 cloves");
    expect(formatShoppingAmount({ qty: 1, unit: "piece" }, "bunch")).toBe("1 bunch");
  });
});
