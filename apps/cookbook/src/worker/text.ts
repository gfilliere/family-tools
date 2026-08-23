const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
};

function character(codePoint: number, original: string): string {
  if (!Number.isInteger(codePoint) || codePoint < 1 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return original;
  }
  return String.fromCodePoint(codePoint);
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:#x([\da-f]+)|#(\d+)|(\d+)|([a-z][\da-z]+));/gi,
    (original, hexadecimal: string | undefined, decimal: string | undefined, malformedDecimal: string | undefined, named: string | undefined) => {
      if (hexadecimal) return character(Number.parseInt(hexadecimal, 16), original);
      if (decimal || malformedDecimal) return character(Number(decimal ?? malformedDecimal), original);
      return named ? (HTML_ENTITIES[named.toLocaleLowerCase()] ?? original) : original;
    },
  );
}

export function sanitiseRecipeTitle(value: string): string {
  let title = value;
  // A second pass handles double-encoded values such as &amp;#39;.
  for (let pass = 0; pass < 2; pass += 1) title = decodeHtmlEntities(title);
  return title
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/\p{Control}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
