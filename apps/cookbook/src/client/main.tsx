import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { marked } from "marked";
import "@family-tools/ui/styles.css";
import "./app.css";

type Ingredient = { id?: number; name: string; qty: number | null; unit: "g" | "ml" | "tsp" | "tbsp" | null; original: string; conversionNote?: string | null };
type Recipe = {
  id?: number; title: string; instructionsMd: string | null; cookMinutes: number | null; servings: number | null;
  difficulty: "easy" | "medium" | "hard" | null; rating: number | null; sourceUrl: string | null; imageUrl: string | null;
  notes: string | null; lastCookedAt?: string | null; createdAt?: string; createdBy?: string | null;
  ingredients: Ingredient[]; tags: string[]; ingredientCount?: number; importTier?: string;
};
type Screen = "catalog" | "detail" | "form" | "import";

const EMPTY: Recipe = { title: "", instructionsMd: "", cookMinutes: null, servings: null, difficulty: null, rating: null, sourceUrl: null, imageUrl: null, notes: "", ingredients: [{ name: "", qty: null, unit: null, original: "" }], tags: [] };

function relativeCooked(value?: string | null): string {
  if (!value) return "never cooked";
  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  const days = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 86_400_000));
  if (days === 0) return "cooked today";
  if (days < 7) return `cooked ${days}d ago`;
  return `cooked ${Math.floor(days / 7)}w ago`;
}

function amount(ingredient: Ingredient): string {
  if (ingredient.qty === null) return ingredient.name;
  const qty = Number.isInteger(ingredient.qty) ? ingredient.qty : Math.round(ingredient.qty * 100) / 100;
  return `${qty}${ingredient.unit ? ` ${ingredient.unit}` : ""} ${ingredient.name}`;
}

function safeMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false });
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script,style,iframe,object,embed,form,input,button").forEach((node) => node.remove());
  document.querySelectorAll("*").forEach((node) => {
    for (const attributeName of node.getAttributeNames()) {
      if (!(["href", "title"].includes(attributeName))) node.removeAttribute(attributeName);
    }
    if (node instanceof HTMLAnchorElement) {
      const href = node.getAttribute("href") ?? "";
      if (!/^(https?:|\/|#)/i.test(href)) node.removeAttribute("href");
      else { node.target = "_blank"; node.rel = "noopener noreferrer"; }
    }
  });
  return document.body.innerHTML;
}

function Stars({ value }: { value: number | null }) {
  return <span class="stars" aria-label={value ? `${value} out of 5 stars` : "Unrated"}>{value ? "★".repeat(value) + "☆".repeat(5 - value) : "Unrated"}</span>;
}

function App() {
  const [screen, setScreen] = useState<Screen>("catalog");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [current, setCurrent] = useState<Recipe | null>(null);
  const [draft, setDraft] = useState<Recipe>({ ...EMPTY, ingredients: [...EMPTY.ingredients] });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("stale");
  const [importUrl, setImportUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadRecipes() {
    const params = new URLSearchParams({ sort });
    if (query.trim()) params.set("q", query.trim());
    const response = await fetch(`/cookbook/api/recipes?${params}`);
    if (!response.ok) throw new Error("Could not load recipes.");
    const body = await response.json() as { recipes: Recipe[] };
    setRecipes(body.recipes);
  }

  useEffect(() => { void loadRecipes().catch((reason) => setError(reason.message)); }, [sort]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shared = params.get("import");
    if (shared) { setImportUrl(shared); setScreen("import"); void runImport({ url: shared }); }
    else if (params.get("share") === "empty") { setNotice("Nothing was shared. Paste the recipe URL or text below."); setScreen("import"); }
    if (params.size) history.replaceState(null, "", "/cookbook/");
  }, []);

  async function openRecipe(id: number) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/cookbook/api/recipes/${id}`);
      if (!response.ok) throw new Error("Recipe not found.");
      const body = await response.json() as { recipe: Recipe };
      setCurrent(body.recipe); setScreen("detail"); scrollTo(0, 0);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open recipe."); }
    finally { setBusy(false); }
  }

  async function runImport(input?: { url?: string; text?: string }) {
    const payload = input ?? (importText.trim() ? { text: importText } : { url: importUrl });
    setBusy(true); setError(null); setNotice("Finding the recipe…");
    try {
      const response = await fetch("/cookbook/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { draft?: Recipe; error?: string; manualFallback?: boolean };
      if (!response.ok || !body.draft) throw new Error(body.error ?? "Could not import recipe.");
      setDraft(body.draft); setScreen("form"); setNotice(`Draft imported via ${body.draft.importTier}. Review it before saving.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not import recipe.");
      setScreen("import"); setNotice("You can always paste the recipe text below.");
    } finally { setBusy(false); }
  }

  function updateIngredient(index: number, patch: Partial<Ingredient>) {
    setDraft((recipe) => ({ ...recipe, ingredients: recipe.ingredients.map((ingredient, position) => position === index ? { ...ingredient, ...patch } : ingredient) }));
  }

  async function save(event: Event) {
    event.preventDefault(); setBusy(true); setError(null);
    const clean = {
      ...draft,
      title: draft.title.trim(),
      tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
      ingredients: draft.ingredients.filter((ingredient) => ingredient.name.trim() || ingredient.original.trim()).map((ingredient) => ({
        ...ingredient,
        name: ingredient.name.trim() || ingredient.original.trim(),
        original: ingredient.original.trim() || amount(ingredient),
      })),
    };
    try {
      const response = await fetch(clean.id ? `/cookbook/api/recipes/${clean.id}` : "/cookbook/api/recipes", {
        method: clean.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(clean),
      });
      const body = await response.json() as { recipe?: Recipe; error?: string };
      if (!response.ok || !body.recipe) throw new Error(body.error ?? "Could not save recipe.");
      setCurrent(body.recipe); setScreen("detail"); setNotice("Recipe saved."); await loadRecipes();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save recipe."); }
    finally { setBusy(false); }
  }

  async function cooked() {
    if (!current?.id) return;
    const response = await fetch(`/cookbook/api/recipes/${current.id}/cooked`, { method: "POST" });
    if (response.ok) { setCurrent({ ...current, lastCookedAt: new Date().toISOString() }); setNotice("Marked as cooked today."); await loadRecipes(); }
  }

  async function addToList() {
    if (!current?.id) return;
    setBusy(true); setError(null);
    const response = await fetch(`/cookbook/api/recipes/${current.id}/to-list`, { method: "POST" });
    const body = await response.json() as { added?: number; error?: string };
    if (response.ok) setNotice(`${body.added ?? current.ingredients.length} ingredients added to the shopping list.`);
    else setError(body.error ?? "Could not add ingredients to the list.");
    setBusy(false);
  }

  async function removeRecipe() {
    if (!current?.id || !confirm(`Delete “${current.title}”?`)) return;
    const response = await fetch(`/cookbook/api/recipes/${current.id}`, { method: "DELETE" });
    if (response.ok) { setScreen("catalog"); setCurrent(null); await loadRecipes(); }
  }

  const filteredCount = useMemo(() => recipes.length, [recipes]);

  return (
    <main class="cookbook-app">
      <nav class="app-nav"><a href="/">← Family Tools</a><span class="eyebrow">Sous-Chef</span></nav>
      {(error || notice) && <div class={`notice ${error ? "error" : ""}`}>{error ?? notice}<button aria-label="Dismiss" onClick={() => { setError(null); setNotice(null); }}>×</button></div>}

      {screen === "catalog" && <>
        <header class="title-row"><div><p class="eyebrow">Your kitchen archive</p><h1>Cookbook</h1></div><button class="primary compact" onClick={() => setScreen("import")}>Import</button></header>
        <form class="catalog-tools" onSubmit={(event) => { event.preventDefault(); void loadRecipes(); }}>
          <input value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Search recipes…" aria-label="Search recipes" />
          <button>Search</button>
        </form>
        <div class="sort-row"><span>{filteredCount} recipes</span><label>Sort <select value={sort} onChange={(event) => setSort(event.currentTarget.value)}><option value="stale">Stalest first</option><option value="newest">Newest</option><option value="title">Title</option></select></label></div>
        <section class="catalog">
          {recipes.map((recipe) => <button class="recipe-card" key={recipe.id} onClick={() => void openRecipe(recipe.id!)}>
            <div class="card-top"><h2>{recipe.title}</h2><span class={`cooked-badge ${recipe.lastCookedAt ? "" : "never"}`}>{relativeCooked(recipe.lastCookedAt)}</span></div>
            <div class="recipe-meta"><Stars value={recipe.rating} /><span>{recipe.cookMinutes ? `${recipe.cookMinutes} min` : "No time"}</span><span>{recipe.ingredientCount ?? 0} ingredients</span></div>
            {recipe.tags.length > 0 && <div class="tags">{recipe.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
          </button>)}
          {!recipes.length && <div class="empty"><span>♨</span><h2>No recipes yet</h2><p>Import a URL or paste your favourite recipe.</p></div>}
        </section>
        <button class="new-button" onClick={() => { setDraft({ ...EMPTY, ingredients: [...EMPTY.ingredients] }); setScreen("form"); }}>Write a recipe</button>
      </>}

      {screen === "import" && <section class="panel import-panel">
        <button class="back" onClick={() => setScreen("catalog")}>← Cookbook</button>
        <div><p class="eyebrow">Bring a recipe home</p><h1>Import recipe</h1><p class="lede">Paste a link. Nothing is saved until you review the draft.</p></div>
        <label>Recipe URL<input type="url" value={importUrl} onInput={(event) => setImportUrl(event.currentTarget.value)} placeholder="https://…" /></label>
        <button class="primary" disabled={busy || !importUrl.trim()} onClick={() => void runImport({ url: importUrl })}>{busy ? "Importing…" : "Import URL"}</button>
        <div class="or"><span>or paste the recipe text</span></div>
        <label>Recipe text<textarea rows={12} value={importText} onInput={(event) => setImportText(event.currentTarget.value)} placeholder="Ingredients and instructions…" /></label>
        <button disabled={busy || !importText.trim()} onClick={() => void runImport({ text: importText })}>Extract pasted recipe</button>
      </section>}

      {screen === "detail" && current && <article class="detail">
        <button class="back" onClick={() => setScreen("catalog")}>← Cookbook</button>
        {current.imageUrl && <img class="recipe-image" src={current.imageUrl} alt="" />}
        <header><p class="eyebrow">{current.tags.join(" · ") || "Recipe"}</p><h1>{current.title}</h1><div class="recipe-meta"><Stars value={current.rating} />{current.cookMinutes && <span>{current.cookMinutes} min</span>}{current.servings && <span>serves {current.servings}</span>}</div></header>
        <div class="wet-actions"><button class="primary" onClick={() => void cooked()}>✓ Cooked today</button><button class="rust" disabled={busy} onClick={() => void addToList()}>+ Add to list</button></div>
        <section><h2 class="section-label">Ingredients</h2><ul class="ingredients">{current.ingredients.map((ingredient, index) => <li key={ingredient.id ?? index}><strong>{amount(ingredient)}</strong><small>{ingredient.original}{ingredient.conversionNote ? ` · ${ingredient.conversionNote}` : ""}</small></li>)}</ul></section>
        {current.instructionsMd && <section><h2 class="section-label">Method</h2><div class="markdown" dangerouslySetInnerHTML={{ __html: safeMarkdown(current.instructionsMd) }} /></section>}
        {current.notes && <section class="notes"><h2 class="section-label">Notes</h2><p>{current.notes}</p></section>}
        {current.sourceUrl && <a class="source" href={current.sourceUrl} target="_blank" rel="noopener noreferrer">View original recipe ↗</a>}
        <div class="minor-actions"><button onClick={() => { setDraft(current); setScreen("form"); }}>Edit</button><button class="danger" onClick={() => void removeRecipe()}>Delete</button></div>
      </article>}

      {screen === "form" && <form class="recipe-form" onSubmit={save}>
        <button type="button" class="back" onClick={() => setScreen(draft.id ? "detail" : "catalog")}>← Cancel</button>
        <header><p class="eyebrow">Review every detail</p><h1>{draft.id ? "Edit recipe" : "New recipe"}</h1></header>
        <label>Title<input required maxLength={200} value={draft.title} onInput={(event) => setDraft({ ...draft, title: event.currentTarget.value })} /></label>
        <div class="field-grid"><label>Minutes<input type="number" min="0" value={draft.cookMinutes ?? ""} onInput={(event) => setDraft({ ...draft, cookMinutes: event.currentTarget.value ? Number(event.currentTarget.value) : null })} /></label><label>Servings<input type="number" min="1" value={draft.servings ?? ""} onInput={(event) => setDraft({ ...draft, servings: event.currentTarget.value ? Number(event.currentTarget.value) : null })} /></label><label>Rating<select value={draft.rating ?? ""} onChange={(event) => setDraft({ ...draft, rating: event.currentTarget.value ? Number(event.currentTarget.value) : null })}><option value="">Unrated</option>{[1,2,3,4,5].map((value) => <option value={value}>{value}</option>)}</select></label></div>
        <fieldset><legend>Ingredients</legend>{draft.ingredients.map((ingredient, index) => <div class="ingredient-row" key={index}><div class="ingredient-fields"><input class="qty" type="number" step="any" min="0" placeholder="Qty" value={ingredient.qty ?? ""} onInput={(event) => updateIngredient(index, { qty: event.currentTarget.value ? Number(event.currentTarget.value) : null })} /><select value={ingredient.unit ?? ""} onChange={(event) => updateIngredient(index, { unit: (event.currentTarget.value || null) as Ingredient["unit"] })}><option value="">count</option><option>g</option><option>ml</option><option>tsp</option><option>tbsp</option></select><input required placeholder="Ingredient" value={ingredient.name} onInput={(event) => updateIngredient(index, { name: event.currentTarget.value })} /><button type="button" aria-label="Remove ingredient" onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, position) => position !== index) })}>×</button></div><input class="original" required placeholder="Original source line" value={ingredient.original} onInput={(event) => updateIngredient(index, { original: event.currentTarget.value })} /></div>)}<button type="button" onClick={() => setDraft({ ...draft, ingredients: [...draft.ingredients, { name: "", qty: null, unit: null, original: "" }] })}>+ Ingredient</button></fieldset>
        <label>Tags<input value={draft.tags.join(", ")} onInput={(event) => setDraft({ ...draft, tags: event.currentTarget.value.split(",") })} placeholder="weeknight, baking" /></label>
        <label>Instructions <button type="button" class="preview-toggle" onClick={() => setPreview(!preview)}>{preview ? "Edit" : "Preview"}</button>{preview ? <div class="markdown preview" dangerouslySetInnerHTML={{ __html: safeMarkdown(draft.instructionsMd ?? "") }} /> : <textarea rows={14} value={draft.instructionsMd ?? ""} onInput={(event) => setDraft({ ...draft, instructionsMd: event.currentTarget.value })} />}</label>
        <label>Notes<textarea rows={4} value={draft.notes ?? ""} onInput={(event) => setDraft({ ...draft, notes: event.currentTarget.value })} /></label>
        <label>Source URL<input type="url" value={draft.sourceUrl ?? ""} onInput={(event) => setDraft({ ...draft, sourceUrl: event.currentTarget.value || null })} /></label>
        <label>Image URL<input type="url" value={draft.imageUrl ?? ""} onInput={(event) => setDraft({ ...draft, imageUrl: event.currentTarget.value || null })} /></label>
        <button class="primary save" disabled={busy}>{busy ? "Saving…" : "Save recipe"}</button>
      </form>}
    </main>
  );
}

render(<App />, document.getElementById("app")!);
