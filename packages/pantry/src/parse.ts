import type { Amount, LineFlags, ParsedLine, RecipeUnit } from "./types";
import { UNIT_WORDS, isMetric } from "./units";

const FRACTIONS: Record<string, number> = {
  "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875, "⅕": 0.2, "⅙": 1 / 6,
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12,
  half: 0.5, quarter: 0.25, ein: 1, eine: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, halbe: 0.5, halben: 0.5, halber: 0.5,
  couple: 2, few: 3, einige: 3, "ein paar": 3,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, demi: 0.5, demie: 0.5, quelques: 3,
};

const SIZE_WORDS = "(?:large|small|medium|big|heaped|heaping|level|whole|generous|good|scant|thick|thin|fat|juicy|ripe|fresh|large|grosse|grosser|kleine|kleiner|gehäufte|gehäufter|gestrichene|gestrichener|dicke|dünne|gros|grosse|grosses|petit|petite|petites|petits|belle|beau|bonne|bon|grande|grand)";

/** One number: 2, 2.5, 2,5, 1/2, 1 1/2, 1½, ½. */
const NUMBER = "(?:\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d+[¼½¾⅓⅔⅛⅜⅝⅞⅕⅙]|\\d+(?:[.,]\\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞⅕⅙])";

const UNIT_PATTERN = Object.keys(UNIT_WORDS)
  .toSorted((a, b) => b.length - a.length)
  .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  let total = 0;
  let found = false;
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    if (token in FRACTIONS) { total += FRACTIONS[token] ?? 0; found = true; continue; }
    const mixed = /^(\d+)([¼½¾⅓⅔⅛⅜⅝⅞⅕⅙])$/.exec(token);
    if (mixed) { total += Number(mixed[1]) + (FRACTIONS[mixed[2] ?? ""] ?? 0); found = true; continue; }
    const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(token);
    if (fraction && Number(fraction[2])) { total += Number(fraction[1]) / Number(fraction[2]); found = true; continue; }
    const numeric = Number(token);
    if (Number.isFinite(numeric)) { total += numeric; found = true; }
  }
  return found ? total : null;
}

function metricScale(unit: RecipeUnit): number {
  return unit === "kg" || unit === "l" ? 1_000 : 1;
}

function unitOf(raw: string | undefined): RecipeUnit | null {
  if (!raw) return null;
  const key = raw.toLocaleLowerCase().replaceAll(".", "").replace(/\s+/g, " ").trim();
  return UNIT_WORDS[key] ?? null;
}

function tidy(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.\-–—+*•·]+/, "")
    .replace(/[\s,;:.\-–—+*•·!]+$/, "")
    .trim();
}

function detectFlags(text: string): LineFlags {
  const lower = text.toLocaleLowerCase();
  return {
    optional: /\boptional\b|\bnach belieben\b|\bif desired\b|\bif you like\b|\bwenn gewünscht\b|\bfacultati(?:f|ve)\b|\boptionnel(?:le)?\b/.test(lower),
    toTaste: /\bto taste\b|\bnach geschmack\b|\bas needed\b|\bas required\b|\bnach bedarf\b|\betwas\b|\ba little\b|\ba bit\b|\bsome\b|\blots of\b|\bplenty of\b|\bgenerous pinch\b|\bpinch of\b|\bprise\b|\bsplash\b|\bschuss\b|\bdrizzle\b|\bdash\b|\bsprinkle\b|\bau go[uû]t\b|\bselon (?:le )?go[uû]t\b|\bselon (?:les )?envies?\b|\bq\.?s\.?\b|\bquantité suffisante\b|\bun peu\b|\bune pincée\b|\bun filet\b|\bun trait\b/.test(lower),
    serving: /\bto serve\b|\bfor serving\b|\bzum servieren\b|\bto garnish\b|\bfor garnish\b|\bfor the table\b|\bon the side\b|\bals beilage\b|\bzum garnieren\b|\bpour (?:le )?servi(?:r|ce)\b|\bpour (?:la )?(?:garniture|décoration|déco)\b|\bpour décorer\b|\ben accompagnement\b/.test(lower),
  };
}

/** A quantity + unit written inside a parenthesis, e.g. "(14g)", "(1,200ml)", "(28 ounce)". */
function amountIn(text: string): Amount | null {
  const match = new RegExp(`(?:approx\\.?|about|ca\\.?|circa|etwa|roughly|~)?\\s*(${NUMBER})\\s*(${UNIT_PATTERN})\\b`, "i").exec(text);
  if (!match) return null;
  const qty = parseNumber(match[1] ?? "");
  const unit = unitOf(match[2]);
  return qty !== null && unit ? { qty, unit } : null;
}

interface Head {
  qty: number | null;
  unit: RecipeUnit | null;
  range: [number, number] | null;
  rest: string;
}

/** Read a leading quantity (possibly a range, possibly with units on both sides) and unit. */
function readHead(text: string): Head {
  const cleaned = text;
  const pattern = new RegExp(
    `^(${NUMBER})\\s*(${UNIT_PATTERN})?\\s*(?:(?:-|–|—|to|bis|or|oder)\\s*(${NUMBER})\\s*(${UNIT_PATTERN})?)?(?:\\s+|$|(?=[^\\w]))`,
    "i",
  );
  const match = pattern.exec(cleaned);
  if (match) {
    const first = parseNumber(match[1] ?? "");
    const second = match[3] ? parseNumber(match[3]) : null;
    let unit = unitOf(match[4]) ?? unitOf(match[2]);
    let rest = cleaned.slice(match[0].length);
    // "2 large cloves garlic": the unit may sit after a size word.
    if (!unit) {
      const later = new RegExp(`^${SIZE_WORDS}?\\s*(${UNIT_PATTERN})\\b(?!\\s*(?:pieces?|stücke?))\\s*(?:of\\s+|von\\s+|de\\s+|d['’]\\s*|des\\s+|du\\s+)?`, "i").exec(rest);
      if (later) { unit = unitOf(later[1]); rest = rest.slice(later[0].length); }
    } else {
      rest = rest.replace(/^(?:of|von|de|des|du)\s+|^d['’]\s*/i, "");
    }
    // Ranges with a unit on each side: "800g–1kg". Compare in the same unit when both are metric.
    const range: [number, number] | null = first !== null && second !== null ? [first, second] : null;
    let qty = first;
    if (range) {
      const unitA = unitOf(match[2]);
      const unitB = unitOf(match[4]);
      if (unitA && unitB && unitA !== unitB && isMetric(unitA) && isMetric(unitB)) {
        qty = Math.max(range[0] * metricScale(unitA), range[1] * metricScale(unitB));
        unit = unitA === "kg" || unitA === "g" ? "g" : "ml";
      } else {
        qty = Math.max(range[0], range[1]);
      }
    }
    return { qty, unit, range, rest };
  }

  // Word quantities: "a handful of", "half a lemon", "one onion", "einige".
  const words = /^((?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|dozen|half|quarter|couple|few|ein|eine|einen|einer|zwei|drei|vier|fünf|sechs|halbe|halben|halber|einige|un|une|deux|trois|quatre|cinq|six|demi|demie|quelques)\b(?:\s+(?:a|an|of|dozen))?)\s*/i.exec(cleaned);
  if (words) {
    const parts = (words[1] ?? "").toLocaleLowerCase().split(/\s+/);
    let qty = parts.reduce((total, part) => total + (WORD_NUMBERS[part] ?? 0), 0) || null;
    if (parts.includes("dozen") && parts.length > 1) qty = (WORD_NUMBERS[parts[0] ?? ""] ?? 1) * 12;
    let rest = cleaned.slice(words[0].length);
    let unit: RecipeUnit | null = null;
    const later = new RegExp(`^${SIZE_WORDS}?\\s*(${UNIT_PATTERN})\\b\\s*(?:of\\s+|von\\s+|de\\s+|d['’]\\s*|des\\s+|du\\s+)?`, "i").exec(rest);
    if (later) { unit = unitOf(later[1]); rest = rest.slice(later[0].length); }
    return { qty, unit, range: null, rest };
  }
  return { qty: null, unit: null, range: null, rest: cleaned };
}

/**
 * Parse one ingredient line into quantity, unit, and name.
 * Ranges resolve to their upper bound (a shopping list should not run short).
 * A metric amount in parentheses beats the imperial amount before it: "1 tbsp (14g) butter" is 14 g.
 */
export function parseIngredientLine(original: string): ParsedLine {
  const flags = detectFlags(original);
  let text = original.normalize("NFKC").replaceAll("⁄", "/")
    // Abbreviation dots: "c. à s.", "tbsp.", "env." → matched as plain words.
    .replace(/\b([A-Za-zÀ-ÿ]{1,5})\.(?=\s|$)/g, "$1").replace(/(\d) \/ (\d)/g, "$1/$2").replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/\s+/g, " ").trim();
  // Bullets and list markers.
  text = text.replace(/^(?:[•*·\-–—+;:]\s*)+/, "").replace(/^\d+[.)]\s+(?=[A-Za-zÄÖÜäöü])/, "");
  text = text.replace(/^(?:optional|optionally|note|tip)\s*:\s*/i, "");
  // Unicode fractions glued to digits: "1½" → "1 1/2" handled by parseNumber; "1-1 1/2" ranges too.

  // Pull out parentheticals. The first metric one that sits right after a quantity overrides it.
  const notes: string[] = [];
  const found: { hint: Amount | null; pack: Amount | null } = { hint: null, pack: null };
  text = text.replace(/\(([^()]*)\)/g, (_, inner: string, offset: number) => {
    const content = tidy(inner);
    if (content) notes.push(content);
    const amount = amountIn(content);
    if (amount) {
      const before = text.slice(0, offset);
      const followedByPack = new RegExp(`^\\s*(?:${["can", "cans", "tin", "tins", "jar", "jars", "packet", "packets", "package", "packages", "pack", "packs", "sachet", "sachets", "bottle", "bottles", "bag", "bags", "block", "blocks", "dose", "dosen", "glas", "packung", "packungen", "päckchen", "flasche", "flaschen", "beutel"].join("|")})\\b`, "i")
        .test(text.slice(offset + inner.length + 2));
      if (followedByPack) found.pack = amount;
      else if (!found.hint && isMetric(amount.unit) && /^[\s•*·\-–—+;:]*[\d¼½¾⅓⅔⅛⅜⅝⅞][^(),]{0,28}$/.test(before)) found.hint = amount;
      else if (!found.hint && isMetric(amount.unit) && /(?:—|–|:)\s*[^,]*$/.test(before)) found.hint = amount;
    }
    return " ";
  }).replace(/\s+/g, " ").trim();

  // "Name — 30ml" / "Name: 2 pieces" / "Name - a handful": move the trailing amount to the front.
  const trailing = /^([^—–:]+?)\s*(?:—|–|:|\s-\s)\s*(.+)$/.exec(text);
  if (trailing && !new RegExp(`^${NUMBER}`).test(text) && !/^(?:optional|optionally|note|tip|for the [a-z]+|für die [a-z]+|zum [a-z]+)\s*:/i.test(text)) {
    const [, left = "", right = ""] = trailing;
    const rightHead = readHead(right);
    if (rightHead.qty !== null || /^(?:to taste|nach geschmack|a handful|handful|some|etwas)/i.test(right)) {
      text = `${right} ${left}`.replace(/\s+/g, " ").trim();
    }
  }

  const head = readHead(text);
  let { qty, unit } = head;
  let rest = head.rest;

  // A trailing "x" form: "eggs x 2".
  if (qty === null) {
    const tail = new RegExp(`^(.*?)\\s*[x×]\\s*(${NUMBER})$`, "i").exec(rest);
    if (tail) { qty = parseNumber(tail[2] ?? ""); rest = tail[1] ?? rest; }
  }

  const { hint, pack } = found;
  if (hint) {
    // Prefer the source's own metric figure over converting an imperial one.
    if (qty === null || unit === null || !isMetric(unit) || (hint.unit !== unit && !(unit === "g" || unit === "ml"))) {
      qty = hint.qty;
      unit = hint.unit;
    }
  }

  // Trace amounts ("a pinch", "a splash") are not worth a number.
  if (unit === "pinch" || unit === "dash") { qty = null; unit = null; }

  // Drop prep instructions after the ingredient: ", thinly sliced" / ", cut into wedges" / ", to serve".
  let name = tidy(rest);
  const prep = /,\s*(?:thinly|finely|roughly|coarsely|thickly)?\s*(?:sliced|chopped|diced|minced|grated|crushed|cubed|shredded|torn|crumbled|peeled|cut|halved|quartered|divided|softened|melted|beaten|separated|pressed|zested|juiced|trimmed|rinsed|drained|deseeded|seeded|pitted|stemmed|cored|julienned|toasted|to serve|for serving|to taste|for garnish|to garnish|plus more|or more|as needed|at room temperature|in total|in\b|geschnitten|gehackt|gewürfelt|gerieben|zerdrückt|gepresst|zum servieren|nach geschmack|nach belieben|haché|hachée|hachés|hachées|émincé|émincée|émincés|émincées|râpé|râpée|râpés|râpées|coupé|coupée|coupés|coupées|pelé|pelée|pelés|pelées|épluché|épluchée|écrasé|écrasée|pressé|pressée|ciselé|ciselée|concassé|concassée|concassés|concassées|en dés|en rondelles|en lamelles|en morceaux|en tranches|en julienne|en quartiers|entier|entière|pour servir|au go[uû]t|selon go[uû]t|facultatif|facultative)\b.*$/i;
  name = name.replace(prep, "");
  name = name.replace(/\b(?:plus|and) (?:more|extra)\b.*$/i, "").replace(/\s*\bor more\b.*$/i, "");
  // A trailing participle without a comma: "oignons émincés", "shallots sliced".
  name = name.replace(/\s+(?:chopped|sliced|diced|minced|grated|crushed|peeled|shredded|crumbled|melted|softened|beaten|haché|hachée|hachés|hachées|émincé|émincée|émincés|émincées|râpé|râpée|râpés|râpées|coupé|coupée|coupés|coupées|pelé|pelée|pelés|pelées|épluché|épluchée|épluchés|épluchées|ciselé|ciselée|ciselés|ciselées|concassé|concassée|concassés|concassées|écrasé|écrasée|écrasés|écrasées|pressé|pressée|pressés|pressées|fondu|fondue|ramolli|ramollie|battu|battus|battue|battues|en dés|en rondelles|en lamelles|en morceaux|en tranches|en julienne|en quartiers)+$/i, "");
  name = name.replace(/\b(?:to serve|for serving|to garnish|for garnish|zum servieren|zum garnieren|nach belieben|nach geschmack|to taste|optional|pour servir|pour la garniture|pour décorer|au go[uû]t|selon go[uû]t|facultatif|facultative|optionnel|optionnelle)\b/gi, "");
  const exampleMatch = /\b(?:such as|like|e\.?g\.?|z\.?\s?b\.?|zum beispiel|comme|par exemple|p\.?\s?ex\.?)\s+(.+)$/i.exec(name);
  const example = exampleMatch ? tidy(exampleMatch[1] ?? "").split(/,|\bor\b|\boder\b|\bou\b/)[0]?.trim() || null : null;
  name = name.replace(/\b(?:such as|like|e\.?g\.?|z\.?\s?b\.?|zum beispiel|comme|par exemple|p\.?\s?ex\.?)\b.*$/i, "");
  name = tidy(name).replace(/^(?:of|von)\s+/i, "");
  // "1/2 garlic head", "1 head of lettuce": the piece is a head, not the plant.
  if (!unit && /\b(?:heads?|bulbs?|knolle|kopf|tête|têtes)\b/i.test(name)) {
    unit = "head";
    name = tidy(name.replace(/\b(?:a whole|whole|heads?|bulbs?|knolle|kopf|tête|têtes|d['’]|de)\b/gi, " ").replace(/\s+/g, " "));
  }

  return {
    qty,
    unit,
    name,
    note: notes.length ? notes.join("; ") : null,
    range: head.range,
    pack,
    example,
    flags,
  };
}
