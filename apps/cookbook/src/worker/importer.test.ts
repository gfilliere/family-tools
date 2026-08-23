import { describe, expect, it } from "vitest";
import { ingredientIdentityModelOptions, parseAiResponse, recipeModelOptions } from "./importer";

describe("parseAiResponse", () => {
  it("accepts structured and JSON-string Workers AI responses", () => {
    expect(parseAiResponse({ response: { title: "Lasagna" } })).toEqual({ title: "Lasagna" });
    expect(parseAiResponse({ response: '{"title":"Lasagna"}' })).toEqual({ title: "Lasagna" });
  });

  it.each([
    [{ response: null }, "empty structured response"],
    [{ response: "" }, "empty structured response"],
    [{ response: '{"title":' }, "incomplete or invalid JSON"],
  ])("reports unusable model output", (result, message) => {
    expect(() => parseAiResponse(result)).toThrow(message);
  });
});

describe("recipeModelOptions", () => {
  it("allocates enough output tokens for long recipes", () => {
    expect(recipeModelOptions("recipe", 0).max_tokens).toBe(4_096);
  });

  it("adds corrective guidance only on retries", () => {
    const first = recipeModelOptions("recipe", 0);
    const retry = recipeModelOptions("recipe", 1);
    expect(first.messages).toHaveLength(2);
    expect(retry.messages).toHaveLength(3);
    expect(retry.messages[1]?.content).toContain("previous response was empty or invalid");
  });
});

describe("ingredientIdentityModelOptions", () => {
  it("asks for exact multilingual source mappings and retries incomplete output", () => {
    const first = ingredientIdentityModelOptions(["Zwiebeln", "Mehl"], 0);
    const retry = ingredientIdentityModelOptions(["Zwiebeln", "Mehl"], 1);
    expect(first.messages.at(-1)?.content).toContain('["Zwiebeln","Mehl"]');
    expect(first.messages.at(-1)?.content).toContain("lower-case");
    expect(retry.messages[1]?.content).toContain("one mapping for every input name");
  });
});
