import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { splitPrice } from "@family-tools/ui";
import "@family-tools/ui/styles.css";
import "./app.css";

type Station = { id: string; label: string; e10: number | null };

function parseStationLabel(label: string): { brand: string; address: string } {
  if (label.includes(" · ")) {
    const parts = label.split(" · ");
    const brand = parts[0] ?? label;
    const address = parts.slice(1).join(" · ");
    return { brand: brand.trim(), address: address.trim() };
  }
  if (label.includes(" - ")) {
    const parts = label.split(" - ");
    const brand = parts[0] ?? label;
    const address = parts.slice(1).join(" - ");
    return { brand: brand.trim(), address: address.trim() };
  }
  return { brand: label, address: "" };
}

function App() {
  const [stations, setStations] = useState<Station[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/gas/api/prices");
      if (!res.ok) throw new Error(`The price service returned ${res.status}.`);
      const body = (await res.json()) as { stations: Station[]; checkedAt: string };
      setStations(body.stations);
      setCheckedAt(new Date(body.checkedAt));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load fuel prices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Refresh every 5 minutes (Tankerkönig rate policy compliant)
    const id = setInterval(load, 300_000 + Math.random() * 30_000);
    return () => clearInterval(id);
  }, []);

  const open = (stations ?? []).filter((s) => s.e10 !== null).toSorted((a, b) => a.e10! - b.e10!);
  const shut = (stations ?? []).filter((s) => s.e10 === null);
  const bestStation = open[0];
  const otherOpen = open.slice(1);
  const low = bestStation?.e10 ?? 0;
  const high = open[open.length - 1]?.e10 ?? 0;
  const maxSavings = open.length > 1 ? (high - low) * 50 : 0; // 50L tank savings

  return (
    <div class="gas-container">
      {/* Top App Navigation */}
      <nav class="top-nav">
        <a href="/" class="nav-back">
          <svg class="nav-back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Family Tools</span>
        </a>
        <div class="live-pill">
          <span class="pulse-dot"></span>
          <span>Live Monitor</span>
        </div>
      </nav>

      {/* Header Bar */}
      <header class="app-header">
        <div class="header-main">
          <div class="header-title-group">
            <h1 class="header-title">Fuel Prices</h1>
            <span class="fuel-badge">E10 Super</span>
          </div>
          <button
            class={`refresh-btn ${loading ? "is-loading" : ""}`}
            onClick={load}
            disabled={loading}
            aria-label="Refresh fuel prices"
            title="Refresh prices"
          >
            <svg class="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span class="refresh-time">
              {checkedAt
                ? checkedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
                : "Checking…"}
            </span>
          </button>
        </div>
      </header>

      {/* Error Notice */}
      {error && (
        <div class="error-card">
          <div class="error-icon">⚠️</div>
          <div class="error-body">
            <p class="error-msg">{error}</p>
            <button class="retry-btn" onClick={load}>Try Again</button>
          </div>
        </div>
      )}

      {/* Skeleton Loading State */}
      {loading && !stations && (
        <div class="skeleton-list">
          <div class="skeleton-card hero-skeleton"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>
      )}

      {/* Content State */}
      {stations && (
        <>
          {/* Best Deal Hero Card - Exclusively showcases the cheapest station */}
          {bestStation && bestStation.e10 !== null && (
            <div class="best-deal-hero">
              <div class="hero-tag-row">
                <span class="hero-badge">
                  <svg class="hero-star" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Cheapest Station Now
                </span>
                {maxSavings >= 0.5 && (
                  <span class="savings-hint">
                    Save up to <b>{maxSavings.toFixed(2)} €</b> on a 50L fill
                  </span>
                )}
              </div>

              {(() => {
                const { main, tenth } = splitPrice(bestStation.e10!);
                const { brand, address } = parseStationLabel(bestStation.label);
                return (
                  <div class="hero-content">
                    <div class="hero-info">
                      <span class="hero-brand">{brand}</span>
                      {address && <span class="hero-address">{address}</span>}
                      <a
                        class="hero-map-link"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(bestStation.label + " Berlin")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span>Open in Maps</span>
                        <svg class="external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    </div>
                    <div class="hero-price-block">
                      <div class="hero-price">
                        <span class="price-main">{main}</span>
                        <span class="price-tenth">{tenth}</span>
                        <span class="price-unit">€/L</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Other Stations Section (Cheapest option excluded from this list) */}
          {(otherOpen.length > 0 || shut.length > 0) && (
            <section class="stations-section">
              <div class="section-header">
                <span class="section-title">Other Nearby Stations</span>
                <span class="station-count">{otherOpen.length + shut.length} stations</span>
              </div>

              <div class="stations-list">
                {otherOpen.map((s) => {
                  const { main, tenth } = splitPrice(s.e10!);
                  const gap = Math.round((s.e10! - low) * 1000) / 10;
                  const { brand, address } = parseStationLabel(s.label);

                  return (
                    <article key={s.id} class="station-card">
                      <div class="station-left">
                        <div class="brand-row">
                          <span class="brand-badge">{brand}</span>
                          <span class="delta-badge is-gap">+{gap.toFixed(1)} ct</span>
                        </div>
                        {address && <div class="station-address">{address}</div>}
                      </div>

                      <div class="station-right">
                        <div class="price-display">
                          <span class="price-main">{main}</span>
                          <span class="price-tenth">{tenth}</span>
                          <span class="price-unit">€</span>
                        </div>
                      </div>
                    </article>
                  );
                })}

                {shut.map((s) => {
                  const { brand, address } = parseStationLabel(s.label);
                  return (
                    <article key={s.id} class="station-card is-shut">
                      <div class="station-left">
                        <div class="brand-row">
                          <span class="brand-badge">{brand}</span>
                          <span class="delta-badge is-shut">Closed</span>
                        </div>
                        {address && <div class="station-address">{address}</div>}
                      </div>
                      <div class="station-right">
                        <span class="shut-label">No Price</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {open.length === 0 && shut.length === 0 && (
            <div class="empty-card">
              <p class="empty-title">No stations configured</p>
              <p class="empty-subtitle">Add stations to your database using the seeding script.</p>
            </div>
          )}
        </>
      )}

      {/* Footer Attributions */}
      <footer class="gas-footer">
        <p>
          Official price data from the Markttransparenzstelle für Kraftstoffe (MTS-K) via{" "}
          <a href="https://www.tankerkoenig.de" target="_blank" rel="noopener noreferrer">
            Tankerkönig
          </a>
          .
        </p>
      </footer>
    </div>
  );
}

render(<App />, document.getElementById("app")!);
