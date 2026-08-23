import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import "@family-tools/ui/styles.css";
import "./app.css";

type Item = {
  id: number;
  name: string;
  canonical_name: string | null;
  qty: number | null;
  unit: string | null;
  aisle: string;
  checked_at: string | null;
  source_kind: "manual" | "recipe";
  source_title: string | null;
};

type View = "aisle" | "recipe";

function parseQuickAdd(value: string): { name: string; qty: number | null } {
  const trimmed = value.trim();
  const match = /^(\d+(?:[.,]\d+)?)\s+(.+)$/.exec(trimmed);
  if (!match) return { name: trimmed, qty: null };
  return { qty: Number(match[1]?.replace(",", ".")), name: match[2] ?? "" };
}

function quantity(item: Item): string {
  if (item.qty === null) return "";
  const qty = Number.isInteger(item.qty) ? String(item.qty) : String(Math.round(item.qty * 100) / 100);
  return `${qty}${item.unit ? ` ${item.unit}` : ""}`;
}

function shoppingName(item: Item): string {
  return item.canonical_name?.trim() || item.name;
}

function sourceName(item: Item): string | null {
  return shoppingName(item).toLocaleLowerCase() === item.name.trim().toLocaleLowerCase()
    ? null
    : item.name;
}

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [quick, setQuick] = useState("");
  const [view, setView] = useState<View>("aisle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setError(null);
    try {
      const response = await fetch("/list/api/items");
      if (!response.ok) throw new Error(`The list returned ${response.status}.`);
      const body = await response.json() as { items: Item[] };
      setItems(body.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the list.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => {
    const result = new Map<string, Item[]>();
    for (const item of items) {
      const key = view === "aisle" ? item.aisle : (item.source_title || "Ad hoc");
      result.set(key, [...(result.get(key) ?? []), item]);
    }
    return [...result.entries()].map(([name, rows]) => [
      name,
      rows.toSorted((a, b) => Number(Boolean(a.checked_at)) - Number(Boolean(b.checked_at))),
    ] as const);
  }, [items, view]);

  async function add(event: Event) {
    event.preventDefault();
    const parsed = parseQuickAdd(quick);
    if (!parsed.name) return;
    setError(null);
    const response = await fetch("/list/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed),
    });
    if (!response.ok) {
      const body = await response.json() as { error?: string };
      setError(body.error ?? "Could not add item.");
      return;
    }
    setQuick("");
    await load();
  }

  async function toggle(item: Item) {
    setItems((current) => current.map((row) => row.id === item.id
      ? { ...row, checked_at: row.checked_at ? null : new Date().toISOString() }
      : row));
    const response = await fetch(`/list/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checked: !item.checked_at }),
    });
    if (!response.ok) await load();
  }

  async function clearChecked() {
    const count = items.filter((item) => item.checked_at).length;
    if (!count || !globalThis.confirm(`Remove ${count} checked item${count === 1 ? "" : "s"}?`)) return;
    const response = await fetch("/list/api/checked", { method: "DELETE" });
    if (response.ok) await load();
  }

  async function copyList() {
    const byAisle = new Map<string, Item[]>();
    for (const item of items.filter((row) => !row.checked_at)) {
      byAisle.set(item.aisle, [...(byAisle.get(item.aisle) ?? []), item]);
    }
    const text = [...byAisle.entries()].map(([aisle, rows]) => [
      aisle,
      ...rows.map((row) => {
        const translated = sourceName(row) ? `${shoppingName(row)} / ${sourceName(row)}` : shoppingName(row);
        return `- ${quantity(row)}${quantity(row) ? " " : ""}${translated}${row.source_title ? ` (${row.source_title})` : ""}`;
      }),
    ].join("\n")).join("\n\n");
    await navigator.clipboard.writeText(text || "Shopping list is empty");
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main class="list-app">
      <nav class="app-nav"><a href="/">← Family Tools</a><span class="eyebrow">Sous-Chef</span></nav>
      <header class="title-row">
        <div><p class="eyebrow">Shopping mode</p><h1>Shopping List</h1></div>
        <span class="open-count">{items.filter((item) => !item.checked_at).length} open</span>
      </header>

      <form class="quick-add" onSubmit={add}>
        <input value={quick} onInput={(event) => setQuick(event.currentTarget.value)} placeholder="2 milk, bread, bananas…" aria-label="Quick add item" />
        <button type="submit">Add</button>
      </form>

      {error && <p class="notice error">{error}</p>}

      <div class="toolbar">
        <div class="segmented" aria-label="Group list by">
          <button class={view === "aisle" ? "active" : ""} onClick={() => setView("aisle")}>Aisle</button>
          <button class={view === "recipe" ? "active" : ""} onClick={() => setView("recipe")}>Recipe</button>
        </div>
        <button onClick={() => void copyList()}>{copied ? "Copied" : "Copy text"}</button>
      </div>

      {loading && <p class="notice">Loading your list…</p>}
      {!loading && groups.length === 0 && <div class="empty"><span>✓</span><h2>All clear</h2><p>Add anything you need above.</p></div>}

      <div class="groups">
        {groups.map(([name, rows]) => (
          <section class="list-group" key={name}>
            <div class="group-title"><h2>{name}</h2><span>{rows.length}</span></div>
            <div class="items">
              {rows.map((item) => (
                <button class={`item ${item.checked_at ? "checked" : ""}`} key={item.id} onClick={() => void toggle(item)}>
                  <span class="check">{item.checked_at ? "✓" : ""}</span>
                  <span class="item-copy">
                    <span class="item-main"><strong>{shoppingName(item)}</strong>{quantity(item) && <span>{quantity(item)}</span>}</span>
                    {(sourceName(item) || item.source_title) && (
                      <small>
                        {[sourceName(item), item.source_title ? `from ${item.source_title}` : null].filter(Boolean).join(" · ")}
                      </small>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {items.some((item) => item.checked_at) && <button class="clear" onClick={() => void clearChecked()}>Clear checked</button>}
    </main>
  );
}

render(<App />, document.getElementById("app")!);
