import {
  CATALOG, CATALOG_BY_ID, Matcher, contentTokens, isAisle, isMassUnit, isVolumeUnit, normalise, parseIngredientLine,
  rebindLine, resolveLine, singular,
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
}

export interface Override {
  aisle: Aisle | null;
  staple: boolean | null;
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

/** Key used for learned aliases: meaningful words, singular, lower-case. */
export function aliasKey(value: string): string {
  const tokens = contentTokens(value);
  const chosen = tokens.length ? tokens : normalise(value).split(" ").filter(Boolean);
  return chosen.map(singular).join(" ");
}

export function slugify(value: string): string {
  return normalise(value).replace(/[^a-z0-9äöü ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "item";
}

function customEntry(row: CustomRow): CatalogEntry {
  return {
    id: row.id,
    name: row.name,
    aliases: [],
    aisle: isAisle(row.aisle) ? row.aisle : "Other",
    measure: row.measure,
    density: row.density ?? undefined,
    pieceGrams: row.piece_grams ?? undefined,
    pieceUnit: row.piece_unit ?? undefined,
    staple: row.staple === 1,
  };
}

/**
 * Everything the list knows about ingredients: the built-in catalog, custom entries, learned aliases,
 * and per-ingredient overrides. Loaded once per request.
 */
export class Knowledge {
  private constructor(
    private readonly db: D1Database,
    private readonly custom: Map<string, CatalogEntry>,
    private readonly aliases: Map<string, string>,
    private readonly overrides: Map<string, Override>,
    private readonly matcher: Matcher,
  ) {}

  static async load(db: D1Database): Promise<Knowledge> {
    const results = await db.batch<CustomRow | { alias_normalised: string; ingredient_id: string } | OverrideRow>([
      db.prepare("SELECT id, name, aisle, measure, density, piece_grams, piece_unit, staple FROM custom_ingredients"),
      db.prepare("SELECT alias_normalised, ingredient_id FROM learned_aliases"),
      db.prepare("SELECT ingredient_id, aisle, staple FROM ingredient_overrides"),
    ]);
    const custom = (results[0]?.results ?? []) as CustomRow[];
    const aliases = (results[1]?.results ?? []) as { alias_normalised: string; ingredient_id: string }[];
    const overrides = (results[2]?.results ?? []) as OverrideRow[];
    const customEntries = new Map(custom.map((row) => [row.id, customEntry(row)]));
    const learned = new Map(aliases.map((row) => [row.alias_normalised, row.ingredient_id]));
    const overrideMap = new Map(overrides.map((row) => [row.ingredient_id, {
      aisle: isAisle(row.aisle) ? row.aisle : null,
      staple: row.staple === null ? null : row.staple === 1,
    }]));
    return new Knowledge(db, customEntries, learned, overrideMap, new Matcher([...customEntries.values()]));
  }

  entry(id: string | null | undefined): CatalogEntry | null {
    if (!id) return null;
    return this.custom.get(id) ?? CATALOG_BY_ID.get(id) ?? null;
  }

  /** Aisle and staple flag after overrides. */
  effective(entry: CatalogEntry): { aisle: Aisle; staple: boolean } {
    const override = this.overrides.get(entry.id);
    return { aisle: override?.aisle ?? entry.aisle, staple: override?.staple ?? entry.staple ?? false };
  }

  /** Search for the "change ingredient" picker. */
  search(query: string, limit = 8): CatalogEntry[] {
    const needle = normalise(query);
    if (!needle) return [];
    const all = [...this.custom.values(), ...CATALOG];
    const scored = all.flatMap((entry) => {
      if (entry.skip) return [];
      const names = [entry.name, ...entry.aliases].map(normalise);
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
      const id = this.aliases.get(aliasKey(candidate));
      const entry = this.entry(id);
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

    let lines = resolveLine(original, this.matcher, override);
    const first = lines[0];
    if (!first) return lines;

    const learned = this.learnedFor(name, first.parsed.name, hints.canonicalName, original);
    if (learned) return [rebindLine(first, learned)];
    if (!first.entry && hints.canonicalName) {
      const viaCanonical = this.matcher.resolveName(hints.canonicalName)[0];
      if (viaCanonical?.entry) lines = [rebindLine(first, viaCanonical.entry)];
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

  async setOverride(ingredientId: string, patch: Partial<Override>): Promise<void> {
    const current = this.overrides.get(ingredientId) ?? { aisle: null, staple: null };
    const next = { aisle: patch.aisle === undefined ? current.aisle : patch.aisle, staple: patch.staple === undefined ? current.staple : patch.staple };
    this.overrides.set(ingredientId, next);
    await this.db.prepare(
      `INSERT INTO ingredient_overrides(ingredient_id, aisle, staple) VALUES (?1, ?2, ?3)
       ON CONFLICT(ingredient_id) DO UPDATE SET aisle = excluded.aisle, staple = excluded.staple, updated_at = datetime('now')`,
    ).bind(ingredientId, next.aisle, next.staple === null ? null : next.staple ? 1 : 0).run();
  }

  async createCustom(definition: NewIngredient, aliasTexts: string[]): Promise<CatalogEntry> {
    let id = `${CUSTOM_PREFIX}${slugify(definition.name)}`;
    if (this.entry(id) && this.entry(id)?.name !== definition.name) id = `${id}-${Date.now().toString(36)}`;
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
    await this.db.prepare(
      `INSERT INTO custom_ingredients(id, name, aisle, measure, density, piece_grams, piece_unit, staple) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, aisle = excluded.aisle, measure = excluded.measure, density = excluded.density,
         piece_grams = excluded.piece_grams, piece_unit = excluded.piece_unit, staple = excluded.staple, updated_at = datetime('now')`,
    ).bind(id, entry.name, entry.aisle, entry.measure, entry.density ?? null, entry.pieceGrams ?? null, entry.pieceUnit ?? null, entry.staple ? 1 : 0).run();
    for (const text of aliasTexts) await this.learnAlias(text, id);
    return entry;
  }

  async renameCustom(id: string, name: string): Promise<void> {
    const entry = this.custom.get(id);
    if (!entry) return;
    this.custom.set(id, { ...entry, name });
    await this.db.prepare("UPDATE custom_ingredients SET name = ?1, updated_at = datetime('now') WHERE id = ?2").bind(name, id).run();
  }
}

/** A sensible buying unit for an unknown ingredient, from the unit the recipe used. */
export function measureFromUnit(unit: string | null | undefined): Measure {
  if (!unit) return "piece";
  if (isMassUnit(unit as RecipeUnit)) return "g";
  if (isVolumeUnit(unit as RecipeUnit)) return "ml";
  return "piece";
}
