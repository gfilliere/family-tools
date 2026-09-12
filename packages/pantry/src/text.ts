/** Lower-case, fold typography, drop punctuation. Umlauts are kept: they matter in German. */
export function normalise(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[’'`´]/g, "")
    .replace(/[-–—/&+,.;:!?()[\]{}"*•·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** English plural to singular. Only rules that are safe for food words. */
export function singular(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("oes")) return token.slice(0, -2);
  if (token.endsWith("ves") && token.length > 5) return `${token.slice(0, -3)}f`;
  if (/(?:ch|sh|ss|x|z)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("ss") || token.endsWith("us") || token.endsWith("is")) return token;
  if (token.endsWith("s")) return token.slice(0, -1);
  return token;
}

/** Words that describe preparation, size, or quality — never the ingredient itself. */
const STOPWORDS = new Set([
  // english
  "a", "an", "the", "of", "some", "any", "few", "lots", "lot", "plenty",
  "fresh", "freshly", "large", "small", "medium", "big", "little", "whole", "half", "halved", "quartered",
  "chopped", "sliced", "diced", "minced", "grated", "crushed", "shredded", "cubed", "torn", "crumbled",
  "peeled", "cut", "into", "wedges", "pieces", "piece", "strips", "chunks", "florets", "cubes", "slices",
  "thinly", "thickly", "finely", "roughly", "coarsely", "very", "well", "lightly", "generous", "heaped", "heaping", "level",
  "cooked", "uncooked", "raw", "cooled", "boiled", "grilled", "fried", "melted", "softened", "toasted", "roasted", "dry",
  "boneless", "skinless", "skin", "on", "off", "bone", "in", "lean", "extra", "virgin", "light", "low", "fat", "free",
  "reduced", "unsalted", "salted", "unsweetened", "sweetened", "plain", "natural", "organic", "ripe", "unwaxed",
  "hot", "cold", "warm", "room", "temperature", "day", "old", "preferred", "style", "fine", "coarse",
  "plus", "more", "divided", "optional", "to", "taste", "serve", "serving", "garnish", "needed", "as", "for", "or",
  "approx", "about", "roughly", "at", "least", "each", "per", "total", "with", "without", "from", "your", "choice",
  "protein", "such", "like", "eg", "ie", "etc", "if", "you", "dont", "prefer", "it", "spicy", "handful", "pinch",
  "packet", "sachet", "tin", "can", "jar", "cans", "tins", "jars", "packets", "block", "bunch", "sprig", "sprigs",
  "stalk", "stalks", "knob", "head", "heads", "bulb", "clove", "cloves", "slice", "leaves", "leaf", "stick", "sticks",
  "zest", "juice", "juiced", "pressed", "squeezed", "blitzed", "patted", "thawed", "thoroughly",
  "adjust", "replaces", "adds", "moisture", "binder", "heavy", "seasoned",
  // german
  "frisch", "frische", "frischer", "frisches", "gross", "grosse", "grosser", "grosses", "klein", "kleine", "kleiner",
  "gehackt", "gehackte", "gehackter", "geschnitten", "gewürfelt", "gerieben", "geriebener", "geriebene", "fein", "grob",
  "gekocht", "gekochte", "roh", "rohe", "mager", "magere", "fettarm", "fettarme", "ganz", "ganze", "ganzer", "am", "stück",
  "zum", "servieren", "nach", "belieben", "geschmack", "etwas", "einige", "ein", "eine", "einen", "aus", "der", "die", "das",
  "den", "dem", "des", "mühle", "sehr", "alternativ", "und", "oder", "mit", "ohne", "für", "in", "zu", "zerdrückt", "gepresst",
  "geschält", "gewaschen", "frischen", "getrocknete", "dicke", "sorte", "kochzeit", "minuten", "allerhöchstens", "tage", "alt",
  "grösse", "m", "l", "s", "xl",
]);

/** Words that change the identity of an ingredient and must be kept even though they look like qualifiers. */
const KEEP = new Set([
  "dried", "smoked", "sun", "frozen", "canned", "tinned", "crushed", "chopped", "ground", "sweet", "sour", "black", "white",
  "red", "green", "yellow", "brown", "spring", "baby", "cherry", "plum", "wild", "japanese", "korean", "thai", "italian",
  "greek", "chinese", "mexican", "indian", "french", "sichuan", "szechuan",
]);

// Some qualifiers only survive when combined with a specific noun ("chopped tomatoes", "ground beef").
// They are removed for the loose match, so entries must also carry the qualifier-free form when that is right.
export function contentTokens(value: string): string[] {
  return normalise(value)
    .split(" ")
    .filter((token) => token && !/^\d/.test(token) && (KEEP.has(token) || !STOPWORDS.has(token)));
}

export function singularKey(tokens: readonly string[]): string {
  return tokens.map(singular).join(" ");
}
