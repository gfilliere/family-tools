import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { splitPrice } from "@family-tools/ui";
import "@family-tools/ui/styles.css";
import "./app.css";

type Station = { id: string; label: string; e10: number | null };

function App() {
  const [stations, setStations] = useState<Station[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/gas/api/prices");
      if (!res.ok) throw new Error(`The price service returned ${res.status}.`);
      const body = (await res.json()) as { stations: Station[]; checkedAt: string };
      setStations(body.stations);
      setCheckedAt(new Date(body.checkedAt));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load prices.");
    }
  }

  useEffect(() => {
    load();
    // Tankerkoenig asks for no more than one call per 5 minutes.
    const id = setInterval(load, 300_000 + Math.random() * 45_000);
    return () => clearInterval(id);
  }, []);

  const open = (stations ?? []).filter((s) => s.e10 !== null).sort((a, b) => a.e10! - b.e10!);
  const shut = (stations ?? []).filter((s) => s.e10 === null);
  const low = open[0]?.e10 ?? 0;

  return (
    <>
      <header class="bar">
        <span class="eyebrow"><b>E10</b> Super</span>
        <span class="eyebrow">
          {checkedAt?.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </header>

      {error && <p class="error">{error} <button onClick={load}>Try again</button></p>}
      {!stations && !error && <p class="eyebrow">Loading…</p>}

      {open.map((s) => {
        const { main, tenth } = splitPrice(s.e10!);
        const best = s.e10 === low;
        const gap = Math.round((s.e10! - low) * 1000) / 10;
        return (
          <article key={s.id} class={best ? "row best" : "row"}>
            <div class="name">{s.label}</div>
            <span class="sign">{main}<span class="tenth">{tenth}</span></span>
            <span class="delta">{best ? "cheapest" : `+${gap.toFixed(1)} ct`}</span>
          </article>
        );
      })}

      {shut.map((s) => (
        <article key={s.id} class="row shut">
          <div class="name">{s.label} — no price reported</div>
          <span class="sign none">closed</span>
        </article>
      ))}

      <footer class="eyebrow foot">
        Prices from the Markttransparenzstelle für Kraftstoffe via{" "}
        <a href="https://www.tankerkoenig.de">tankerkoenig.de</a>, CC BY 4.0.
      </footer>
    </>
  );
}

render(<App />, document.getElementById("app")!);
