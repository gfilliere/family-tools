import { describe, expect, it } from "vitest";
import { sanitiseRecipeTitle } from "./text";

describe("sanitiseRecipeTitle", () => {
  it.each([
    ["Hong Shao Rou<br>Chinese Red Braised Pork Belly", "Hong Shao Rou Chinese Red Braised Pork Belly"],
    ["World&39;s Best", "World's Best"],
    ["World&#39;s Best", "World's Best"],
    ["World&#x27;s Best", "World's Best"],
    ["World&amp;#39;s Best", "World's Best"],
    ["Fish &amp; Chips&nbsp;Recipe", "Fish & Chips Recipe"],
  ])("normalises %s", (input, expected) => {
    expect(sanitiseRecipeTitle(input)).toBe(expected);
  });

  it("removes markup, comments, control characters, and excess whitespace", () => {
    expect(sanitiseRecipeTitle("  <strong>Best</strong><!-- draft -->\n\tLasagna  ")).toBe("Best Lasagna");
  });

  it("preserves unknown entities instead of corrupting the title", () => {
    expect(sanitiseRecipeTitle("Bread &unknown; Butter")).toBe("Bread &unknown; Butter");
  });

  it("caps cleaned titles at the recipe title limit", () => {
    expect(sanitiseRecipeTitle("a".repeat(250))).toHaveLength(200);
  });
});
