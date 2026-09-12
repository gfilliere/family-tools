import { CATALOG } from "./catalog";
import { contentTokens, normalise, singular } from "./text";
import type { CatalogEntry, ResolvedIngredient } from "./types";

interface Index {
  exact: Map<string, CatalogEntry>;
  singular: Map<string, CatalogEntry>;
}

function register(index: Index, tokens: readonly string[], entry: CatalogEntry): void {
  const exactKey = tokens.join(" ");
  const singularKey = tokens.map(singular).join(" ");
  if (!index.exact.has(exactKey)) index.exact.set(exactKey, entry);
  if (!index.singular.has(singularKey)) index.singular.set(singularKey, entry);
}

function aliasesOf(entry: CatalogEntry): string[] {
  return [entry.id.replaceAll("-", " "), entry.name, ...entry.aliases];
}

function buildIndex(entries: readonly CatalogEntry[]): Index {
  const index: Index = { exact: new Map(), singular: new Map() };
  // Every word of every alias first, so a spelled-out alias always wins.
  for (const entry of entries) {
    for (const alias of aliasesOf(entry)) register(index, normalise(alias).split(" ").filter(Boolean), entry);
  }
  // Then the meaningful words only ("head of garlic" → "head garlic"), when at least two remain.
  // A single leftover word would let "seasoning salt" claim "salt".
  for (const entry of entries) {
    for (const alias of aliasesOf(entry)) {
      const content = contentTokens(alias);
      if (content.length >= 2) register(index, content, entry);
    }
  }
  return index;
}

const BUILT_IN = buildIndex(CATALOG);
const MAX_WINDOW = 4;

/** Alternatives: "butter or oil" → ["butter", "oil"]; "mayo / yogurt" → both. */
export function splitAlternatives(phrase: string): string[] {
  return phrase
    .split(/\s+(?:or|oder|ou)\s+|\s*\/\s*|\s+alternativ\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Conjunctions: "salt and pepper" → ["salt", "pepper"]; "Salz & Pfeffer"; "salt, pepper, paprika". */
export function splitConjunctions(phrase: string): string[] {
  return phrase
    .split(/\s*(?:,|;|\s\+\s|\s&\s|\sand\s|\sund\s|\s\+\s)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export class Matcher {
  private readonly extra: Index;

  constructor(extraEntries: readonly CatalogEntry[] = []) {
    this.extra = buildIndex(extraEntries);
  }

  private lookup(tokens: readonly string[]): CatalogEntry | null {
    const exact = tokens.join(" ");
    const single = tokens.map(singular).join(" ");
    return this.extra.exact.get(exact) ?? BUILT_IN.exact.get(exact)
      ?? this.extra.singular.get(single) ?? BUILT_IN.singular.get(single) ?? null;
  }

  private scan(tokens: readonly string[]): { entry: CatalogEntry; size: number; alias: string } | null {
    for (let size = Math.min(MAX_WINDOW, tokens.length); size >= 1; size -= 1) {
      let found: { entry: CatalogEntry; size: number; alias: string } | null = null;
      for (let start = 0; start + size <= tokens.length; start += 1) {
        const window = tokens.slice(start, start + size);
        const entry = this.lookup(window);
        if (entry) found = { entry, size, alias: window.join(" ") };
      }
      if (found) return found;
    }
    return null;
  }

  /**
   * Find the catalog entry a phrase refers to.
   * Longest alias wins ("chicken stock" over "chicken"); on equal length the later window wins,
   * since English puts the head noun last ("sesame oil" is an oil).
   */
  matchPhrase(phrase: string): ResolvedIngredient {
    let tokens = contentTokens(phrase);
    let hit = tokens.length ? this.scan(tokens) : null;
    if (!hit) {
      // Try again with every word: "bay leaves", "oil", or a phrase made only of qualifier words.
      const raw = normalise(phrase).split(" ").filter((token) => token && !/^\d/.test(token));
      if (raw.length && raw.join(" ") !== tokens.join(" ")) {
        hit = this.scan(raw);
        if (hit) tokens = raw;
      }
    }
    const text = tokens.join(" ");
    if (!hit) return { entry: null, phrase: text || normalise(phrase), strength: 0, alias: "", exact: false };
    return { entry: hit.entry, phrase: text, strength: hit.size, alias: hit.alias, exact: hit.size >= tokens.length };
  }

  /**
   * Resolve an ingredient name that may list alternatives or several ingredients.
   * "butter or oil" → butter. "Kosher salt and black pepper" → salt, pepper.
   * Returns at least one element; the first is the primary ingredient.
   */
  resolveName(name: string): ResolvedIngredient[] {
    const whole = this.matchPhrase(name);
    if (whole.entry && whole.exact) return [whole];

    const isChoice = /(?:^|\s|,)(?:or|oder)\s/i.test(name) || /\s\/\s|\w\/\w/.test(name);
    if (isChoice) {
      // "shrimp, chicken, or tofu" / "butter or oil": the first named option is what the recipe prefers.
      for (const option of splitAlternatives(name).flatMap((part) => splitConjunctions(part))) {
        const resolved = this.matchPhrase(option);
        if (resolved.entry) return [resolved];
      }
    }

    const parts = splitConjunctions(name);
    if (parts.length > 1) {
      const resolved = parts.map((part) => this.matchPhrase(part));
      const hits = resolved.filter((item) => item.entry);
      // Every segment names something we know: they are separate ingredients ("salt, pepper, paprika").
      if (hits.length === parts.length) return dedupe(hits);
      // Otherwise the first segment is the ingredient and the rest is prep ("shallots, sliced").
      const first = resolved[0];
      if (first?.entry) return [first];
      if (whole.entry) return [whole];
      return [{ entry: null, phrase: first?.phrase || normalise(name), strength: 0, alias: "", exact: false }];
    }

    return [whole];
  }
}

function dedupe(items: ResolvedIngredient[]): ResolvedIngredient[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = item.entry?.id ?? item.phrase;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export const matcher = new Matcher();
