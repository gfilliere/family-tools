import { readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { formatShoppingAmount, resolveLine, roundShopping } from "../src/index";

// Dev aid: prints how every corpus line resolves. Set PANTRY_REPORT=1 to run.
describe.skipIf(!process.env.PANTRY_REPORT)("corpus report", () => {
  it("prints", () => {
    const lines = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8")) as string[];
    const out: string[] = [];
    let unmatched = 0;
    for (const line of lines) {
      const results = resolveLine(line);
      for (const r of results) {
        if (!r.entry) unmatched += 1;
        const total = r.shopping ? formatShoppingAmount(roundShopping(r.shopping), r.entry?.pieceUnit) : "—";
        out.push(`${(r.entry?.id ?? "??").padEnd(20)} ${(r.entry?.aisle ?? "").padEnd(14)} ${r.amountLabel.padEnd(10)} ${total.padEnd(10)} | ${r.parsed.name.padEnd(40).slice(0, 40)} | ${line}`);
      }
    }
    out.push(`unmatched: ${unmatched} / ${lines.length}`);
    writeFileSync(process.env.PANTRY_REPORT_OUT ?? "/dev/stdout", `${out.join("\n")}\n`);
  });
});
