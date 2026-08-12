export type Reading = { stationId: string; e10: number | null };

type PricesResponse = {
  ok: boolean;
  message?: string;
  prices: Record<string, { status: string; e10?: number }>;
};

/**
 * Batch price lookup. prices.php is far lighter on Tankerkoenig's servers than
 * repeated radius (list.php) or per-station (detail.php) calls.
 */
export async function fetchPrices(
  apiKey: string,
  stationIds: string[],
): Promise<Reading[]> {
  const url = new URL("https://creativecommons.tankerkoenig.de/json/prices.php");
  url.searchParams.set("ids", stationIds.join(","));
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url, { cf: { cacheTtl: 60 } });
  if (!res.ok) throw new Error(`Tankerkoenig returned HTTP ${res.status}`);

  const body = (await res.json()) as PricesResponse;
  if (!body.ok) throw new Error(body.message ?? "Tankerkoenig rejected the request");

  return stationIds.map((stationId) => {
    const entry = body.prices[stationId];
    const open = entry?.status === "open" && typeof entry.e10 === "number";
    return { stationId, e10: open ? entry.e10! : null };
  });
}
