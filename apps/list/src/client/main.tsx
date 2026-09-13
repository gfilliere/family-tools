import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import "@family-tools/ui/styles.css";
import "./app.css";

type Part = {
  id: number;
  amount: string;
  name: string;
  original: string | null;
  sourceKind: "manual" | "recipe";
  sourceId: number | null;
  sourceTitle: string | null;
  checked: boolean;
  converted: boolean;
  optional: boolean;
};

type Card = {
  key: string;
  ingredientId: string;
  name: string;
  aisle: string;
  staple: boolean;
  group: string;
  measure: "g" | "ml" | "piece";
  pieceUnit: string | null;
  custom: boolean;
  total: string | null;
  needed: string | null;
  buy: { qty: number; unit: "g" | "ml" | "piece" } | null;
  partial: boolean;
  checked: boolean;
  optional: boolean;
  parts: Part[];
};

type Recipe = { id: number | null; title: string; open: number };
type Suggestion = { id: string; name: string; aisle: string; staple: boolean; measure: string };
type CatalogEntry = {
  id: string;
  name: string;
  aisle: string;
  staple: boolean;
  measure: "g" | "ml" | "piece";
  density: number | null;
  pieceGrams: number | null;
  pieceUnit: string | null;
  generic: boolean;
  custom: boolean;
  overridden: string[];
  aliases: string[];
  learnedAliases: string[];
};
type View = "aisle" | "recipe" | "catalog";

const STAPLE_GROUP = "Check the pantry";
const API = "/list/api";

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API}${path}`, init);
  if (!response.ok) {
    let message = `The list returned ${response.status}.`;
    try { message = ((await response.json()) as { error?: string }).error ?? message; } catch { /* keep default */ }
    throw new Error(message);
  }
  return response;
}

const json = (body: unknown): RequestInit => ({ method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

function partLabel(part: Part, card: Card): string {
  const pieces = [part.amount, sameName(part.name, card.name) ? "" : part.name].filter(Boolean).join(" ");
  return pieces || card.name;
}

function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [aisles, setAisles] = useState<string[]>([]);
  const [quick, setQuick] = useState("");
  const [view, setView] = useState<View>("aisle");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [staplesOpen, setStaplesOpen] = useState(false);

  async function load() {
    setError(null);
    try {
      const body = await (await call("/items")).json() as { cards: Card[]; recipes: Recipe[]; aisles: string[] };
      setCards(body.cards);
      setRecipes(body.recipes);
      setAisles(body.aisles);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the list.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try { await action(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  const groups = useMemo(() => {
    const result = new Map<string, Card[]>();
    for (const card of cards) result.set(card.group, [...(result.get(card.group) ?? []), card]);
    return [...result.entries()];
  }, [cards]);

  const byRecipe = useMemo(() => {
    const result = new Map<string, { recipe: Recipe | null; lines: { part: Part; card: Card }[] }>();
    for (const card of cards) {
      for (const part of card.parts) {
        const title = part.sourceKind === "recipe" && part.sourceTitle ? part.sourceTitle : "Added by hand";
        const bucket = result.get(title) ?? { recipe: recipes.find((recipe) => recipe.title === title) ?? null, lines: [] };
        bucket.lines.push({ part, card });
        result.set(title, bucket);
      }
    }
    return [...result.entries()].map(([title, bucket]) => [title, {
      ...bucket,
      lines: bucket.lines.toSorted((a, b) => Number(a.part.checked) - Number(b.part.checked) || a.card.name.localeCompare(b.card.name)),
    }] as const);
  }, [cards, recipes]);

  const openCount = cards.filter((card) => !card.checked).length;

  async function add(event: Event) {
    event.preventDefault();
    const text = quick.trim();
    if (!text) return;
    await run(async () => {
      await call("/items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      setQuick("");
    });
  }

  async function toggleCard(card: Card) {
    setCards((current) => current.map((row) => row.key === card.key
      ? { ...row, checked: !card.checked, parts: row.parts.map((part) => ({ ...part, checked: !card.checked })) }
      : row));
    try { await call(`/cards/${encodeURIComponent(card.key)}`, json({ checked: !card.checked })); }
    catch { await load(); }
  }

  async function togglePart(part: Part) {
    setCards((current) => current.map((card) => ({
      ...card,
      parts: card.parts.map((row) => (row.id === part.id ? { ...row, checked: !part.checked } : row)),
    })).map((card) => ({ ...card, checked: card.parts.every((row) => row.checked) })));
    try { await call(`/items/${part.id}`, json({ checked: !part.checked })); }
    catch { await load(); }
  }

  async function clearChecked() {
    const count = cards.flatMap((card) => card.parts).filter((part) => part.checked).length;
    if (!count || !globalThis.confirm(`Remove ${count} checked line${count === 1 ? "" : "s"}?`)) return;
    await run(() => call("/checked", { method: "DELETE" }));
  }

  async function removeRecipe(recipe: Recipe | null, title: string) {
    if (!globalThis.confirm(`Remove everything from “${title}” that is still open?`)) return;
    const query = recipe?.id ? `id=${recipe.id}` : `title=${encodeURIComponent(title)}`;
    await run(() => call(`/recipes?${query}`, { method: "DELETE" }));
  }

  async function copyList() {
    const text = await (await call("/items.txt")).text();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 1600);
  }

  const anyChecked = cards.some((card) => card.parts.some((part) => part.checked));

  return (
    <main class="list-app">
      <nav class="app-nav"><a href="/">← Family Tools</a><span class="eyebrow">Sous-Chef</span></nav>
      <header class="title-row">
        <div><p class="eyebrow">Shopping mode</p><h1>Shopping List</h1></div>
        <span class="open-count">{openCount} open</span>
      </header>

      <form class="quick-add" onSubmit={add}>
        <input
          value={quick}
          onInput={(event) => setQuick(event.currentTarget.value)}
          placeholder="2 courgettes, 500 g Hackfleisch, milk…"
          aria-label="Quick add item"
          disabled={busy}
        />
        <button type="submit" disabled={busy}>Add</button>
      </form>

      {error && <p class="notice error">{error}</p>}

      <div class="toolbar">
        <div class="segmented" aria-label="Group list by">
          <button class={view === "aisle" ? "active" : ""} onClick={() => setView("aisle")}>Aisle</button>
          <button class={view === "recipe" ? "active" : ""} onClick={() => setView("recipe")}>Recipe</button>
          <button class={view === "catalog" ? "active" : ""} onClick={() => setView("catalog")}>Catalog</button>
        </div>
        <button onClick={() => void copyList()}>{copied ? "Copied" : "Copy text"}</button>
      </div>

      {view !== "catalog" && loading && <p class="notice">Loading your list…</p>}
      {view !== "catalog" && !loading && cards.length === 0 && <div class="empty"><span>✓</span><h2>All clear</h2><p>Add anything you need above.</p></div>}

      {view === "aisle" && (
        <div class="groups">
          {groups.map(([name, members]) => {
            const isStaples = name === STAPLE_GROUP;
            const open = members.filter((card) => !card.checked).length;
            const collapsed = isStaples && !staplesOpen;
            return (
              <section class={`list-group ${isStaples ? "staples" : ""}`} key={name}>
                <button class="group-title" onClick={() => isStaples && setStaplesOpen((value) => !value)} disabled={!isStaples}>
                  <h2>{name}</h2>
                  <span>{isStaples ? `${open} · ${collapsed ? "show" : "hide"}` : open}</span>
                </button>
                {isStaples && collapsed && <p class="staples-hint">Salt, oil, spices and sauces you most likely have. Tap to check.</p>}
                {!collapsed && (
                  <div class="items">
                    {members.map((card) => (
                      <CardRow
                        key={card.key}
                        card={card}
                        aisles={aisles}
                        editing={editing === card.key}
                        onToggle={() => void toggleCard(card)}
                        onEdit={() => setEditing(editing === card.key ? null : card.key)}
                        onPatch={(patch) => run(() => call(`/cards/${encodeURIComponent(card.key)}`, json(patch)))}
                        onRemove={() => run(() => call(`/cards/${encodeURIComponent(card.key)}`, { method: "DELETE" }))}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {view === "recipe" && (
        <div class="groups">
          {byRecipe.map(([title, bucket]) => (
            <section class="list-group" key={title}>
              <div class="group-title">
                <h2>{title}</h2>
                {title !== "Added by hand" && bucket.lines.some((line) => !line.part.checked) && (
                  <button class="link" onClick={() => void removeRecipe(bucket.recipe, title)}>Remove</button>
                )}
              </div>
              <div class="items">
                {bucket.lines.map(({ part, card }) => (
                  <button class={`item line ${part.checked ? "checked" : ""}`} key={part.id} onClick={() => void togglePart(part)}>
                    <span class="check">{part.checked ? "✓" : ""}</span>
                    <span class="item-copy">
                      <span class="item-main"><strong>{card.name}</strong>{part.amount && <span>{part.amount}</span>}</span>
                      {!sameName(part.name, card.name) && <small>{part.name}</small>}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {view === "catalog" && <CatalogPage aisles={aisles} onChanged={() => void load()} onError={setError} />}

      {view !== "catalog" && anyChecked && <button class="clear" onClick={() => void clearChecked()}>Clear checked</button>}
    </main>
  );
}

interface CardRowProps {
  card: Card;
  aisles: string[];
  editing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onRemove: () => Promise<void>;
}

function CardRow({ card, aisles, editing, onToggle, onEdit, onPatch, onRemove }: CardRowProps) {
  const showParts = card.parts.length > 1 || !card.total || card.partial
    || card.parts.some((part) => !sameName(part.name, card.name) || part.sourceTitle);
  return (
    <div class={`card-row ${card.checked ? "checked" : ""} ${editing ? "editing" : ""}`}>
      <button class="item" onClick={onToggle} aria-pressed={card.checked}>
        <span class="check">{card.checked ? "✓" : ""}</span>
        <span class="item-copy">
          <span class="item-main">
            <strong>{card.name}{card.optional && <em class="tag">optional</em>}</strong>
            {card.total && <span class={`total ${card.buy ? "adjusted" : ""}`}>{card.total}{card.partial ? "+" : ""}</span>}
          </span>
          {card.buy && card.needed && card.needed !== card.total && <small class="needed">recipes need {card.needed}</small>}
          {showParts && (
            <small class="parts">
              {card.parts.map((part) => (
                <span class={`part ${part.checked ? "done" : ""} ${!part.converted && part.amount ? "loose" : ""}`} key={part.id}>
                  {partLabel(part, card)}
                  {part.sourceTitle ? <i> · {part.sourceTitle}</i> : null}
                </span>
              ))}
            </small>
          )}
        </span>
      </button>
      <button class="more" onClick={onEdit} aria-label={`Edit ${card.name}`} aria-expanded={editing}>···</button>
      {editing && <CardEditor card={card} aisles={aisles} onPatch={onPatch} onRemove={onRemove} />}
    </div>
  );
}

interface CardEditorProps {
  card: Card;
  aisles: string[];
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onRemove: () => Promise<void>;
}

function CardEditor({ card, aisles, onPatch, onRemove }: CardEditorProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [name, setName] = useState(card.name);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      fetch(`${API}/ingredients?q=${encodeURIComponent(needle)}`, { signal: controller.signal })
        .then((response) => response.json() as Promise<{ ingredients: Suggestion[] }>)
        .then((body) => setSuggestions(body.ingredients.filter((item) => item.id !== card.ingredientId)))
        .catch(() => setSuggestions([]));
    }, 180);
    return () => { controller.abort(); globalThis.clearTimeout(timer); };
  }, [query, card.ingredientId]);

  return (
    <div class="editor">
      <BuyEditor card={card} onPatch={onPatch} />
      <label>
        <span>Aisle</span>
        <select value={card.aisle} onChange={(event) => void onPatch({ aisle: event.currentTarget.value })}>
          {aisles.map((aisle) => <option key={aisle}>{aisle}</option>)}
        </select>
      </label>
      <label class="inline">
        <input type="checkbox" checked={card.staple} onChange={(event) => void onPatch({ staple: event.currentTarget.checked })} />
        <span>Pantry staple (we usually have it)</span>
      </label>
      {card.custom && (
        <label>
          <span>Name</span>
          <input value={name} onInput={(event) => setName(event.currentTarget.value)} onBlur={() => name.trim() && name !== card.name && void onPatch({ name })} />
        </label>
      )}
      <label>
        <span>This is really…</span>
        <input value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Search an ingredient, e.g. spring onion" />
      </label>
      {suggestions.length > 0 && (
        <div class="suggestions">
          {suggestions.map((item) => (
            <button key={item.id} onClick={() => void onPatch({ ingredientId: item.id })}>
              <strong>{item.name}</strong><small>{item.aisle}{item.staple ? " · staple" : ""}</small>
            </button>
          ))}
        </div>
      )}
      <details class="lines">
        <summary>{card.parts.length} source line{card.parts.length === 1 ? "" : "s"}</summary>
        <ul>{card.parts.map((part) => <li key={part.id}>{part.original ?? `${part.amount} ${part.name}`.trim()}{part.sourceTitle ? ` — ${part.sourceTitle}` : ""}</li>)}</ul>
      </details>
      <button class="danger" onClick={() => void onRemove()}>Remove from list</button>
    </div>
  );
}

const BUY_UNITS: { value: string; label: string; unit: "g" | "ml" | "piece"; factor: number }[] = [
  { value: "g", label: "g", unit: "g", factor: 1 },
  { value: "kg", label: "kg", unit: "g", factor: 1_000 },
  { value: "ml", label: "ml", unit: "ml", factor: 1 },
  { value: "l", label: "l", unit: "ml", factor: 1_000 },
  { value: "piece", label: "pieces", unit: "piece", factor: 1 },
];

function defaultBuyUnit(card: Card): string {
  const amount = card.buy;
  if (amount) return amount.unit === "g" && amount.qty >= 1_000 ? "kg" : amount.unit === "ml" && amount.qty >= 1_000 ? "l" : amount.unit;
  return card.measure;
}

function defaultBuyQty(card: Card, unitValue: string): string {
  const amount = card.buy;
  if (!amount) return "";
  const unit = BUY_UNITS.find((item) => item.value === unitValue);
  return unit ? String(Math.round((amount.qty / unit.factor) * 100) / 100) : String(amount.qty);
}

/** "Buy this much": overrides the computed total for one card. */
function BuyEditor({ card, onPatch }: { card: Card; onPatch: (patch: Record<string, unknown>) => Promise<void> }) {
  const [unitValue, setUnitValue] = useState(() => defaultBuyUnit(card));
  const [qty, setQty] = useState(() => defaultBuyQty(card, defaultBuyUnit(card)));
  const pieceLabel = card.pieceUnit ? `${card.pieceUnit}s` : "pieces";

  function apply(event: Event) {
    event.preventDefault();
    const value = Number(qty.replace(",", "."));
    const unit = BUY_UNITS.find((item) => item.value === unitValue);
    if (!unit || !Number.isFinite(value) || value <= 0) return;
    void onPatch({ buy: { qty: value * unit.factor, unit: unit.unit } });
  }

  return (
    <form class="buy" onSubmit={apply}>
      <span class="buy-label">Buy</span>
      <input inputMode="decimal" value={qty} onInput={(event) => setQty(event.currentTarget.value)} placeholder={card.needed ?? "amount"} aria-label="Amount to buy" />
      <select value={unitValue} onChange={(event) => setUnitValue(event.currentTarget.value)} aria-label="Unit">
        {BUY_UNITS.map((item) => <option key={item.value} value={item.value}>{item.value === "piece" ? pieceLabel : item.label}</option>)}
      </select>
      <button type="submit">Set</button>
      {card.buy && <button type="button" class="link" onClick={() => void onPatch({ buy: null })}>Use recipe total{card.needed ? ` (${card.needed})` : ""}</button>}
    </form>
  );
}

interface CatalogPageProps {
  aisles: string[];
  onChanged: () => void;
  onError: (message: string | null) => void;
}

/** Search and correct any ingredient: name, aisle, staple, buying unit, densities, and spellings. */
function CatalogPage({ aisles, onChanged, onError }: CatalogPageProps) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) { setEntries([]); return; }
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      fetch(`${API}/catalog?q=${encodeURIComponent(needle)}`, { signal: controller.signal })
        .then((response) => response.json() as Promise<{ entries: CatalogEntry[] }>)
        .then((body) => setEntries(body.entries))
        .catch(() => setEntries([]));
    }, 180);
    return () => { controller.abort(); globalThis.clearTimeout(timer); };
  }, [query]);

  async function patch(id: string, payload: Record<string, unknown>) {
    onError(null);
    try {
      const body = await (await call(`/catalog/${encodeURIComponent(id)}`, json(payload))).json() as { entry: CatalogEntry };
      setEntries((current) => current.map((entry) => (entry.id === id ? body.entry : entry)));
      onChanged();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not update the ingredient.");
    }
  }

  return (
    <section class="catalog">
      <p class="staples-hint">Fix how an ingredient is named, where it is shelved, whether it is a staple, and how it is bought. Changes apply to the list right away and are remembered.</p>
      <input class="catalog-search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Search an ingredient, alias, or German / French name" aria-label="Search the catalog" />
      {query.trim().length >= 2 && entries.length === 0 && <p class="notice">Nothing matches. Add the item to the list and it will be created.</p>}
      <div class="items">
        {entries.map((entry) => (
          <div class={`card-row ${open === entry.id ? "editing" : ""}`} key={entry.id}>
            <button class="item" onClick={() => setOpen(open === entry.id ? null : entry.id)} aria-expanded={open === entry.id}>
              <span class="item-copy">
                <span class="item-main">
                  <strong>{entry.name}{entry.overridden.length > 0 && <em class="tag">edited</em>}{entry.custom && <em class="tag">custom</em>}</strong>
                  <span class="muted">{entry.staple ? "Check the pantry" : entry.aisle}</span>
                </span>
                <small>{entry.measure === "piece" ? `by the ${entry.pieceUnit ?? "piece"}` : `in ${entry.measure}`}{entry.aliases.length ? ` · ${entry.aliases.slice(0, 6).join(", ")}${entry.aliases.length > 6 ? "…" : ""}` : ""}</small>
              </span>
            </button>
            {open === entry.id && <CatalogEditor entry={entry} aisles={aisles} onPatch={(payload) => patch(entry.id, payload)} />}
          </div>
        ))}
      </div>
    </section>
  );
}

interface CatalogEditorProps {
  entry: CatalogEntry;
  aisles: string[];
  onPatch: (payload: Record<string, unknown>) => Promise<void>;
}

function CatalogEditor({ entry, aisles, onPatch }: CatalogEditorProps) {
  const [name, setName] = useState(entry.name);
  const [alias, setAlias] = useState("");
  const [density, setDensity] = useState(entry.density?.toString() ?? "");
  const [pieceGrams, setPieceGrams] = useState(entry.pieceGrams?.toString() ?? "");
  const [pieceUnit, setPieceUnit] = useState(entry.pieceUnit ?? "");
  const commit = (field: string, value: string, current: string) => { if (value !== current) void onPatch({ [field]: value.trim() || null }); };

  return (
    <div class="editor">
      <label><span>Name</span><input value={name} onInput={(event) => setName(event.currentTarget.value)} onBlur={() => commit("name", name, entry.name)} /></label>
      <label>
        <span>Aisle</span>
        <select value={entry.aisle} onChange={(event) => void onPatch({ aisle: event.currentTarget.value })}>
          {aisles.map((aisle) => <option key={aisle}>{aisle}</option>)}
        </select>
      </label>
      <label class="inline">
        <input type="checkbox" checked={entry.staple} onChange={(event) => void onPatch({ staple: event.currentTarget.checked })} />
        <span>Pantry staple (we usually have it)</span>
      </label>
      <label>
        <span>Bought</span>
        <select value={entry.measure} onChange={(event) => void onPatch({ measure: event.currentTarget.value })}>
          <option value="g">by weight (g)</option>
          <option value="ml">by volume (ml)</option>
          <option value="piece">by the piece</option>
        </select>
      </label>
      <div class="grid">
        <label><span>Grams per ml</span><input inputMode="decimal" value={density} onInput={(event) => setDensity(event.currentTarget.value)} onBlur={() => commit("density", density, entry.density?.toString() ?? "")} placeholder="e.g. 0.9" /></label>
        <label><span>Grams per piece</span><input inputMode="decimal" value={pieceGrams} onInput={(event) => setPieceGrams(event.currentTarget.value)} onBlur={() => commit("pieceGrams", pieceGrams, entry.pieceGrams?.toString() ?? "")} placeholder="e.g. 150" /></label>
        <label><span>Piece is called</span><input value={pieceUnit} onInput={(event) => setPieceUnit(event.currentTarget.value)} onBlur={() => commit("pieceUnit", pieceUnit, entry.pieceUnit ?? "")} placeholder="can, bunch, clove" /></label>
      </div>
      <label>
        <span>Also known as</span>
        <form class="alias-add" onSubmit={(event) => { event.preventDefault(); if (alias.trim()) { void onPatch({ addAlias: alias.trim() }); setAlias(""); } }}>
          <input value={alias} onInput={(event) => setAlias(event.currentTarget.value)} placeholder="Add a spelling that should map here" />
          <button type="submit">Add</button>
        </form>
      </label>
      {entry.learnedAliases.length > 0 && (
        <div class="chips">
          {entry.learnedAliases.map((item) => (
            <button key={item} class="chip" onClick={() => void onPatch({ removeAlias: item })} title="Forget this spelling">{item} ×</button>
          ))}
        </div>
      )}
      {entry.overridden.length > 0 && <button class="danger" onClick={() => void onPatch({ reset: true })}>Reset to built-in values</button>}
    </div>
  );
}

render(<App />, document.getElementById("app")!);
