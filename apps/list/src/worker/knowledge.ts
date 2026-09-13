import {
  CATALOG, CATALOG_BY_ID, Matcher, isMassUnit, isVolumeUnit, normalise, parseIngredientLine, rebindLine, resolveLine,
  singular, toAisle,
  type Aisle, type CatalogEntry, type Measure, type RecipeUnit, type ResolvedLine,
} from "@family-tools/pantry";

export const CUSTOM_PREFIX = "custom:";

interface CustomRow {
  id: string;
  name: string;
  aisle: string;
  measure: Measure;
  density: number | null;
  piece_grams: number | null;
  piece_unit: string | null;
  staple: number;
}

interface OverrideRow {
  ingredient_id: string;
  aisle: string | null;
  staple: number | null;
  name: string | null;
  measure: Measure | null;
  density: number | null;
  piece_grams: number | null;
  piece_unit: string | null;
}

/** Corrections to a built-in or custom entry. Every field is optional; null clears it. */
export interface Override {
  aisle?: Aisle | null;
  staple?: boolean | null;
  name?: string | null;
  measure?: Measure | null;
  density?: number | null;
  pieceGrams?: number | null;
  pieceUnit?: string | null;
}

/** What the caller already knows about a line, from the cookbook or from the quick-add box. */
export interface Hints {
  name?: string | null;
  canonicalName?: string | null;
  original?: string | null;
  qty?: number | null;
  unit?: string | null;
  aisle?: Aisle | null;
}

/** A learned or model-provided definition for a name the catalog does not know. */
export interface NewIngredient {
  name: string;
  aisle: Aisle;
  measure: Measure;
  staple: boolean;
  density: number | null;
  pieceGrams: number | null;
  pieceUnit: string | null;
}

/** A catalog entry as the API shows it: effective values plus what was overridden and learned. */
export interface CatalogView {
  id: string;
  name: string;
  aisle: Aisle;
  staple: boolean;
  measure: Measure;
  density: number | null;
  pieceGrams: number | null;
  pieceUnit: string | null;
  generic: boolean;
  custom: boolean;
  overridden: (keyof Override)[];
  aliases: string[];
  learnedAliases: string[];
}

/**
 * Key used for learned aliases: the spelling with amounts and trailing prep removed, every remaining
 * word kept, singular, lower-case. Keeping qualifiers is deliberate: a correction for "grilled chicken"
 * must not redirect "whole chicken".
 */
export function aliasKey(value: string): string {
  const cleaned = parseIngredientLine(value).name || value;
  return normalise(cleaned).split(" ").filter(Boolean).map(singular).join(" ");
}

export function slugify(value: string): string {
  return normalise(value).replace(/[^a-z0-9äöüàâçéèêëîïôûùüÿœ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "item";
}

function customEntry(row: CustomRow): CatalogEntry {
  return {
    id: row.id,
    name: row.name,
    aliases: [],
    aisle: toAisle(row.aisle) ?? "Other",
    measure: row.measure,
    density: row.density ?? undefined,
    pieceGrams: row.piece_grams ?? undefined,
    pieceUnit: row.piece_unit ?? undefined,
    staple: row.staple === 1,
  };
}

function overrideFrom(row: OverrideRow): Override {
  return {
    aisle: toAisle(row.aisle),
    staple: row.staple === null ? null : row.staple === 1,
    name: row.name,
    measure: row.measure,
    density: row.density,
    pieceGrams: row.piece_grams,
    pieceUnit: row.piece_unit,
  };
}

/** The entry with its overrides applied. */
function overlay(entry: CatalogEntry, override: Override | undefined): CatalogEntry {
  if (!override) return entry;
  return {
    ...entry,
    name: override.name ?? entry.name,
    aisle: override.aisle ?? entry.aisle,
    staple: override.staple ?? entry.staple,
    measure: override.measure ?? entry.measure,
    density: override.density ?? entry.density,
    pieceGrams: override.pieceGrams ?? entry.pieceGrams,
    pieceUnit: override.pieceUnit ?? entry.pieceUnit,
  };
}

/**
 * Everything the list knows about ingredients: the built-in catalog, custom entries, learned aliases,
 * and per-ingredient overrides. Loaded once per request. `entry()` always returns the overlaid view.
 */
export class Knowledge {
  private matcher: Matcher;

  private constructor(
    private readonly db: D1Database,
    private readonly custom: Map<string, CatalogEntry>,
    private readonly aliases: Map<string, string>,
    private readonly overrides: Map<string, Override>,
  ) {
    this.matcher = new Matcher([...custom.values()]);
  }

  static async load(db: D1Database): Promise<Knowledge> {
    const results = await db.batch<CustomRow | { alias_normalised: string; ingredient_id: string } | OverrideRow>([
      db.prepare("SELECT id, name, aisle, measure, density, piece_grams, piece_unit, staple FROM custom_ingredients"),
      db.prepare("SELECT alias_normalised, ingredient_id FROM learned_aliases"),
      db.prepare("SELECT ingredient_id, aisle, staple, name, measure, density, piece_grams, piece_unit FROM ingredient_overrides"),
    ]);
    const custom = (results[0]?.results ?? []) as CustomRow[];
    const aliases = (results[1]?.results ?? []) as { alias_normalised: string; ingredient_id: string }[];
    const overrides = (results[2]?.results ?? []) as OverrideRow[];
    return new Knowledge(
      db,
      new Map(custom.map((row) => [row.id, customEntry(row)])),
      new Map(aliases.map((row) => [row.alias_normalised, row.ingredient_id])),
      new Map(overrides.map((row) => [row.ingredient_id, overrideFrom(row)])),
    );
  }

  /** Built-in or custom entry with overrides applied, or null. */
  entry(id: string | null | undefined): CatalogEntry | null {
    if (!id) return null;
    const base = this.custom.get(id) ?? CATALOG_BY_ID.get(id);
    return base ? overlay(base, this.overrides.get(id)) : null;
  }

  private baseEntry(id: string): CatalogEntry | null {
    return this.custom.get(id) ?? CATALOG_BY_ID.get(id) ?? null;
  }

  /** Aisle and staple flag, for callers that only need those. */
  effective(entry: CatalogEntry): { aisle: Aisle; staple: boolean } {
    const view = this.entry(entry.id) ?? entry;
    return { aisle: view.aisle, staple: view.staple ?? false };
  }

  view(id: string): CatalogView | null {
    const base = this.baseEntry(id);
    if (!base) return null;
    const override = this.overrides.get(id) ?? {};
    const entry = overlay(base, override);
    const overridden = (Object.keys(override) as (keyof Override)[]).filter((key) => override[key] !== null && override[key] !== undefined);
    const learnedAliases = [...this.aliases.entries()].filter(([, target]) => target === id).map(([alias]) => alias).toSorted();
    return {
      id,
      name: entry.name,
      aisle: entry.aisle,
      staple: entry.staple ?? false,
      measure: entry.measure,
      density: entry.density ?? null,
      pieceGrams: entry.pieceGrams ?? null,
      pieceUnit: entry.pieceUnit ?? null,
      generic: entry.generic ?? false,
      custom: id.startsWith(CUSTOM_PREFIX),
      overridden,
      aliases: [...base.aliases],
      learnedAliases,
    };
  }

  /** Search for the pickers and the catalog page. Matches names, aliases, and learned aliases. */
  search(query: string, limit = 8): CatalogEntry[] {
    const needle = normalise(query);
    if (!needle) return [];
    const learnedByEntry = new Map<string, string[]>();
    for (const [alias, id] of this.aliases) learnedByEntry.set(id, [...(learnedByEntry.get(id) ?? []), alias]);
    const all = [...this.custom.values(), ...CATALOG];
    const scored = all.flatMap((base) => {
      if (base.skip) return [];
      const entry = overlay(base, this.overrides.get(base.id));
      const names = [entry.name, base.name, ...base.aliases, ...(learnedByEntry.get(base.id) ?? [])].map(normalise);
      const exact = names.some((name) => name === needle);
      const starts = names.some((name) => name.startsWith(needle));
      const contains = names.some((name) => name.includes(needle));
      if (!contains) return [];
      return [{ entry, score: exact ? 0 : starts ? 1 : 2 }];
    });
    return scored.toSorted((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name)).slice(0, limit).map((item) => item.entry);
  }

  private learnedFor(...candidates: (string | null | undefined)[]): CatalogEntry | null {
    for (const candidate of candidates) {
      if (!candidate) continue;
      const entry = this.entry(this.aliases.get(aliasKey(candidate)));
      if (entry) return entry;
    }
    return null;
  }

  /**
   * Resolve one incoming line into shopping lines. Usually one; "salt and pepper" gives two.
   * Order: learned aliases → catalog on the line → catalog on the cookbook's canonical name.
   * Unknown names come back with entry null; the caller decides whether to ask a model.
   */
  resolve(hints: Hints): ResolvedLine[] {
    const original = hints.original?.trim() || hints.name?.trim() || "";
    const name = hints.name?.trim() || undefined;
    let override: { qty: number | null; unit: RecipeUnit | null; name?: string } | undefined;
    if (hints.qty !== null && hints.qty !== undefined && hints.unit) {
      // The cookbook already normalised this amount to metric.
      override = { qty: hints.qty, unit: hints.unit as RecipeUnit, name };
    } else if (name || (hints.qty !== null && hints.qty !== undefined)) {
      // A bare count from the cookbook: the original line may still say "can" or "clove".
      const parsed = parseIngredientLine(original);
      override = { qty: parsed.qty ?? hints.qty ?? null, unit: parsed.qty !== null ? parsed.unit : null, name };
    }

    // Matched entries come back as base entries; rebind the overridden ones so conversions use the corrected attributes.
    let lines = resolveLine(original, this.matcher, override)
      .map((line) => (line.entry && this.overrides.has(line.entry.id) ? rebindLine(line, this.entry(line.entry.id) ?? line.entry) : line));
    const first = lines[0];
    if (!first) return lines;

    const learned = this.learnedFor(name, first.parsed.name, hints.canonicalName, original);
    if (learned) return [rebindLine(first, learned)];
    if (!first.entry && hints.canonicalName) {
      const viaCanonical = this.matcher.resolveName(hints.canonicalName)[0];
      const entry = viaCanonical?.entry ? this.entry(viaCanonical.entry.id) : null;
      if (entry) lines = [rebindLine(first, entry)];
    }
    return lines;
  }

  async learnAlias(text: string, ingredientId: string): Promise<void> {
    const key = aliasKey(text);
    if (!key) return;
    this.aliases.set(key, ingredientId);
    await this.db.prepare(
      `INSERT INTO learned_aliases(alias_normalised, ingredient_id) VALUES (?1, ?2)
       ON CONFLICT(alias_normalised) DO UPDATE SET ingredient_id = excluded.ingredient_id, updated_at = datetime('now')`,
    ).bind(key, ingredientId).run();
  }

  async forgetAlias(text: string): Promise<void> {
    const key = aliasKey(text);
    this.aliases.delete(key);
    await this.db.prepare("DELETE FROM learned_aliases WHERE alias_normalised = ?1").bind(key).run();
  }

  /** Merge a patch into the ingredient's overrides. A null field clears that override. */
  async setOverride(ingredientId: string, patch: Override): Promise<void> {
    const next: Override = { ...this.overrides.get(ingredientId), ...patch };
    this.overrides.set(ingredientId, next);
    await this.db.prepare(
      `INSERT INTO ingredient_overrides(ingredient_id, aisle, staple, name, measure, density, piece_grams, piece_unit)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(ingredient_id) DO UPDATE SET aisle = excluded.aisle, staple = excluded.staple, name = excluded.name,
         measure = excluded.measure, density = excluded.density, piece_grams = excluded.piece_grams, piece_unit = excluded.piece_unit,
         updated_at = datetime('now')`,
    ).bind(
      ingredientId, next.aisle ?? null, next.staple === null || next.staple === undefined ? null : next.staple ? 1 : 0,
      next.name ?? null, next.measure ?? null, next.density ?? null, next.pieceGrams ?? null, next.pieceUnit ?? null,
    ).run();
  }

  async clearOverride(ingredientId: string): Promise<void> {
    this.overrides.delete(ingredientId);
    await this.db.prepare("DELETE FROM ingredient_overrides WHERE ingredient_id = ?1").bind(ingredientId).run();
  }

  async createCustom(definition: NewIngredient, aliasTexts: string[]): Promise<CatalogEntry> {
    let id = `${CUSTOM_PREFIX}${slugify(definition.name)}`;
    if (this.baseEntry(id) && this.baseEntry(id)?.name !== definition.name) id = `${id}-${Date.now().toString(36)}`;
    const entry: CatalogEntry = {
      id,
      name: definition.name,
      aliases: [],
      aisle: definition.aisle,
      measure: definition.measure,
      density: definition.density ?? undefined,
      pieceGrams: definition.pieceGrams ?? undefined,
      pieceUnit: definition.pieceUnit ?? undefined,
      staple: definition.staple,
    };
    this.custom.set(id, entry);
    this.matcher = new Matcher([...this.custom.values()]);
    await this.db.prepare(
      `INSERT INTO custom_ingredients(id, name, aisle, measure, density, piece_grams, piece_unit, staple) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, aisle = excluded.aisle, measure = excluded.measure, density = excluded.density,
         piece_grams = excluded.piece_grams, piece_unit = excluded.piece_unit, staple = excluded.staple, updated_at = datetime('now')`,
    ).bind(id, entry.name, entry.aisle, entry.measure, entry.density ?? null, entry.pieceGrams ?? null, entry.pieceUnit ?? null, entry.staple ? 1 : 0).run();
    for (const text of aliasTexts) await this.learnAlias(text, id);
    return entry;
  }
}

/** A sensible buying unit for an unknown ingredient, from the unit the recipe used. */
export function measureFromUnit(unit: string | null | undefined): Measure {
  if (!unit) return "piece";
  if (isMassUnit(unit as RecipeUnit)) return "g";
  if (isVolumeUnit(unit as RecipeUnit)) return "ml";
  return "piece";
}
