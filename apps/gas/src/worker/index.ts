import { Hono } from "hono";
import { fetchPrices, type Reading } from "./tankerkoenig";

declare global {
  interface Env {
    TANKERKOENIG_KEY: string;
  }
}

// basePath keeps every route in sync with the Worker route in wrangler.jsonc.
const app = new Hono<{ Bindings: Env }>().basePath("/gas");

app.get("/api/prices", async (c) => {
  const { results: stations } = await c.env.gas.prepare(
    "select id, label from stations where enabled = 1",
  ).all<{ id: string; label: string }>();

  if (stations.length === 0) {
    return c.json({
      checkedAt: new Date().toISOString(),
      stations: [],
      message: "No enabled stations configured in database.",
    });
  }

  const ids = stations.map((s) => s.id);
  const labelOf = new Map(stations.map((s) => [s.id, s.label]));
  const readings = await fetchPrices(c.env.TANKERKOENIG_KEY, ids);

  return c.json({
    checkedAt: new Date().toISOString(),
    stations: readings.map((r: Reading) => ({
      id: r.stationId,
      label: labelOf.get(r.stationId) ?? "Unnamed station",
      e10: r.e10,
    })),
  });
});

/** Last 7 days for one station, for the sparkline. */
app.get("/api/history/:id", async (c) => {
  const { results } = await c.env.gas.prepare(
    `select e10, observed_at from readings
      where station_id = ?1 and observed_at > datetime('now', '-7 days')
      order by observed_at`,
  )
    .bind(c.req.param("id"))
    .all();
  return c.json(results);
});

/** Anything else under /gas/ that is not an API route: serve the app shell. */
app.get("*", async (c) => {
  if (!c.req.header("accept")?.includes("text/html")) {
    return c.text(`No asset at ${new URL(c.req.url).pathname}`, 404);
  }
  return c.env.ASSETS.fetch(new Request(new URL("/gas/", c.req.url)));
});

/** Poll, record, and optionally notify. Cron runs bypass Access entirely. */
async function poll(env: Env): Promise<void> {
  const { results: stations } = await env.gas.prepare(
    "select id from stations where enabled = 1",
  ).all<{ id: string }>();

  const ids = stations.map((s) => s.id);
  if (ids.length === 0) return;

  const readings = await fetchPrices(env.TANKERKOENIG_KEY, ids);

  const rows = readings.filter((r) => r.e10 !== null);
  if (rows.length === 0) return;

  await env.gas.batch(
    rows.map((r) =>
      env.gas.prepare("insert into readings (station_id, e10) values (?1, ?2)").bind(
        r.stationId,
        r.e10,
      ),
    ),
  );

  // Opt in by setting NTFY_TOPIC. Empty means record silently.
  if (!env.NTFY_TOPIC) return;

  const threshold = Number(env.THRESHOLD_EUR);
  const cheap = rows.filter((r) => r.e10! <= threshold);
  if (cheap.length === 0) return;

  const best = cheap.reduce((a, b) => (a.e10! < b.e10! ? a : b));
  await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
    method: "POST",
    headers: { Title: "E10 below threshold", Tags: "fuelpump" },
    body: `${best.e10!.toFixed(3)} EUR is under your ${threshold.toFixed(3)} threshold.`,
  });
}

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(poll(env));
  },
} satisfies ExportedHandler<Env>;
