# Sous-Chef: implementation specification

Two micro apps for the existing Cloudflare Workers monorepo: a **cookbook** and a
**shopping list**. Derived from an earlier multi-tenant SaaS spec, stripped of
everything the platform already provides.

Audience: a coding agent working in this repo. Build in phases; each phase must be
usable on its own before the next begins.

---

## 0. Read before writing anything

- `README.md` — the "Things that will bite you" section is not optional
- `apps/gas/` — the reference app. Copy its structure and conventions
- `packages/ui/src/` — design tokens and shared helpers

Follow whatever conventions the repo currently uses for base paths, asset layout,
dev setup, and deploy. **Do not introduce a different pattern for these apps.** If
something here conflicts with the repo as it stands, the repo wins — say so rather
than silently diverging.

Non-negotiables inherited from the repo:

- `workers_dev: false` on every Worker
- Vite `base` and `build.outDir` must agree with the Worker route
- In `index.html`, module `src` must not carry the base prefix
- The SPA fallback serves the app shell only for navigations; non-navigation
  misses must 404
- PWA manifest links need `crossorigin="use-credentials"` (Access omits cookies
  on manifest fetches otherwise)
- No personal data in committed config — see §7

---

## 1. Non-goals

These were in the original spec. They are cut deliberately, not deferred. Do not
build them, and do not leave scaffolding for them.

| Cut | Why |
|---|---|
| Registration, login, sessions, password reset | Cloudflare Access does this |
| Households, data isolation, invitations, member management | Two users on one Access policy; there is no second household |
| `household_id` on any table | Same |
| Metric ⇄ imperial toggle, saved unit preference | Units are normalised once at import; there is nothing left to toggle |
| WYSIWYG rich-text editor | Largest dependency in the original spec. Markdown in a textarea renders fine and survives paste |
| Pantry inventory tracking | Requires accurately logging consumption. Nobody does this. It is where these apps die |
| Real-time collaboration machinery | One database, two users. Last-write-wins is correct here, not a compromise |

---

## 2. Architecture

Three apps, three databases. The `core` database and admin app already exist.

```
home.<domain>/cookbook/*   Worker "cookbook"   D1: COOKBOOK   AI binding
home.<domain>/list/*       Worker "list"       D1: LIST
home.<domain>/*            Worker "shell"      D1: CORE (read)
```

Bindings must have distinct names — `COOKBOOK`, `LIST`, `CORE` — never two called
`DB`. Each app owns migrations for its own database only.

**Cookbook → list uses a service binding, not a shared database.** The list app
exposes a `WorkerEntrypoint` class; the cookbook calls it as a typed method. This
is a direct isolate-to-isolate call: no HTTP, no CORS, and it bypasses Access
entirely, so no service token is needed.

```jsonc
// apps/cookbook/wrangler.jsonc
"services": [
  { "binding": "LIST_APP", "service": "list", "entrypoint": "ShoppingList" }
]
```

The contract is the method signature. Keep it minimal:

```ts
addItems(items: { name: string; qty: number | null; unit: string | null }[],
         source: { kind: "recipe"; id: number; title: string }): Promise<{ added: number }>
```

For local dev, `wrangler dev` can run multiple Workers together from several
configs — check `wrangler dev --help` for the current flag spelling and wire it
into the dev script so the binding resolves locally.

---

## 3. Phase 1 — Cookbook

Must be worth using with no shopping list and no meal plan.

### 3.1 Schema (`apps/cookbook/migrations/`)

```sql
recipes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  instructions_md TEXT,            -- markdown, rendered read-only
  cook_minutes INTEGER,
  servings INTEGER,
  difficulty TEXT,                 -- 'easy' | 'medium' | 'hard'
  rating INTEGER,                  -- 1..5, null = unrated
  source_url TEXT,
  image_url TEXT,
  notes TEXT,
  last_cooked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT                  -- Access email, for "who added this"
)

ingredients(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,       -- preserves recipe order
  name TEXT NOT NULL,
  qty REAL,                        -- normalised, metric
  unit TEXT,                       -- 'g' | 'ml' | 'tsp' | 'tbsp' | null (countable)
  original TEXT NOT NULL,          -- the source line, verbatim
  conversion_note TEXT             -- e.g. 'from 2 cups, assumed flour'
)

tags(recipe_id INTEGER, tag TEXT, PRIMARY KEY (recipe_id, tag))
```

**`original` is mandatory and never dropped.** Display it as a subtitle
(`225 g (2 cups flour)`). A silent bad conversion in baking is worse than no
conversion; showing the source line lets a human catch it in half a second.

Enable `PRAGMA foreign_keys = ON` per connection if relying on the cascade —
D1 does not enable it by default.

### 3.2 Import pipeline — the feature that makes this stick

Three tiers, cheapest first. Stop at the first that yields a usable recipe.

**Tier 1 — JSON-LD.** Fetch the URL server-side in the Worker (no CORS, no
proxy). Parse `schema.org/Recipe` from `<script type="application/ld+json">`.
Handle the real-world shapes: `@graph` arrays, `@type` as an array, a Recipe
nested inside a WebPage. Parse ISO-8601 durations (`PT1H30M`) into minutes. Most
German and US recipe sites publish this, so tier 1 should handle the majority and
no model is called at all.

**Tier 2 — markdown plus a model.** `env.AI.toMarkdown()` on the fetched HTML.
This is free for HTML and cuts tokens by roughly 80–99%, which is what makes a
small model sufficient. Send the markdown to a text model with a JSON schema
(§6).

**Tier 3 — Browser Rendering `/markdown`.** Only when tier 2 returns empty
because the page renders client-side. The free plan allows 10 minutes of browser
time per day with 3 concurrent browsers, and it is slow — treat it as a last
resort, and surface a clear error rather than hanging if it fails.

**Always fall back to a paste-the-text box.** Some sites defeat all three, and a
textarea into tier 2's model path is a fine manual escape hatch.

Import never saves directly. It pre-fills the recipe form for review.

### 3.3 Unit normalisation — one way, at import, to metric

US sites are a primary source, so this is required, not a nicety. It runs once per
import, so latency and cost are irrelevant.

**Tier A — exact and deterministic.** Lookup table, no model: oz→g, lb→g,
tsp/tbsp/cup/fl oz→ml, °F→°C. Dimensionally lossless.

**Tier B — ingredient-dependent, and the actual problem.** US baking measures dry
goods by volume. A cup of flour is ~120 g, sugar ~200 g, butter ~227 g, cocoa
~85 g. Converting a cup to 236 ml is dimensionally correct and useless at a
scale. Resolve density per ingredient (§6), and record what was assumed in
`conversion_note`.

**Tier C — unknown.** No density available: convert volume→ml, leave it, and note
it. Never guess a weight silently.

**Round to kitchen numbers.** 240 ml, not 236.6. 120 g, not 118.3. Nearest 5 g
under 100 g, nearest 10 g above; nearest 5 ml. A cook's answer, not a machine's.

**Also convert oven temperatures and pan sizes**, which live in the instructions
text rather than the ingredient rows. `9×13 inch` appears constantly on US sites.
Convert in `instructions_md` and keep the original in parentheses.

### 3.4 Share target — the primary import path

Register a Web Share Target so a recipe URL shared from Chrome lands in the app.

```json
"share_target": {
  "action": "/cookbook/share",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": { "title": "title", "text": "text", "url": "url" }
}
```

`action` must be inside the manifest `scope`. The POST lands on the Worker
directly, so no service worker is needed. Redirect after handling so a refresh
does not resubmit. The Access cookie rides along on a same-origin navigation;
tolerate an empty payload rather than erroring, in case a session expired
mid-share.

This is expected to be the most-used route in the app. Treat it as a first-class
path, not an add-on.

### 3.5 API

```
GET    /cookbook/api/recipes                 list + filters (tag, q, unrated, stale)
GET    /cookbook/api/recipes/:id
POST   /cookbook/api/recipes
PATCH  /cookbook/api/recipes/:id
DELETE /cookbook/api/recipes/:id
POST   /cookbook/api/recipes/:id/cooked      stamps last_cooked_at
POST   /cookbook/api/import                  { url } | { text } -> draft, never saves
POST   /cookbook/api/recipes/:id/to-list     calls LIST_APP.addItems
POST   /cookbook/share                       share target handler
```

Validate on the server, not only in the client. Trim strings, cap lengths, reject
an empty title, clamp `rating` to 1–5, reject a `qty` that is not finite.

### 3.6 UI

Preact, no router, one screen plus a detail view. Reuse `@micro/ui/styles.css`
tokens — concrete/ink palette, uppercase tracked eyebrow labels, 2px radii,
520px max width, mobile-first. No new runtime dependencies beyond a small
markdown renderer.

- **Catalog**: cards with title, cook time, rating, ingredient count, and a
  relative last-cooked badge (`cooked 2w ago`, `never cooked`).
- **Detail**: distraction-free reading mode. Ingredients with `original` as
  subtitle. Rendered markdown steps. "Cooked today" and "Add to list" as the two
  prominent actions — these are what you press with wet hands, so make them big.
- **Form**: dynamic ingredient rows, markdown textarea with a preview toggle,
  tags, source URL, rating, notes.
- **Sort by staleness** as a first-class option. "What haven't we made in a
  while" is the actual daily question and `last_cooked_at` is what answers it.

---

## 4. Phase 2 — Shopping list

Ship the ad-hoc half first. It is useful the day it lands and needs nothing from
the cookbook.

### 4.1 Schema (`apps/list/migrations/`)

```sql
items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  qty REAL,
  unit TEXT,
  aisle TEXT,                      -- see §6.2
  checked_at TEXT,                 -- null = outstanding
  source_kind TEXT,                -- 'manual' | 'recipe'
  source_id INTEGER,
  source_title TEXT,               -- denormalised on purpose: survives recipe deletion
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  added_by TEXT
)
```

`source_title` is denormalised deliberately. The list must not depend on the
cookbook's database, and "from Rindergulasch" is still useful after the recipe is
edited or deleted.

### 4.2 Aggregation rules — deliberately conservative

**Sum two lines only when the normalised name and the unit match exactly.**
`2 onions` + `3 onions` = `5 onions`. Otherwise keep both lines.

**Never reconcile across units.** Do not attempt `200 g flour` + `2 cups flour`.
That is the unit-normalisation problem again, and getting it wrong in a shop is
worse than reading two lines.

Normalise names for comparison only — lowercase, trim, strip a trailing plural
`s`, collapse whitespace. Store the display name as given.

Because every line keeps its source, unmerged duplicates read as informative
rather than broken. Provenance in the aisle beats a merged total.

### 4.3 Views and interaction

- **By aisle** (default): Produce, Dairy & Eggs, Meat & Seafood, Bakery, Pantry,
  Spices, Frozen, Beverages, Household, Other.
- **By recipe**: which lines came from which meal.
- **Shopping mode**: tap to check, strikethrough, checked items sink to the
  bottom. Large tap targets — this is used one-handed while holding a basket.
- **Quick add**: single text input, always visible, no modal. Parse a leading
  quantity if present (`2 milk`), otherwise treat the whole string as a name.
- **Copy as text**: clipboard export grouped by aisle, for WhatsApp.
- **Clear checked**: one action, with confirmation.

### 4.4 Service entrypoint

```ts
export class ShoppingList extends WorkerEntrypoint<Env> {
  async addItems(items, source) { /* insert, aggregate per §4.2, classify per §6.2 */ }
}
export default { fetch: app.fetch }
```

Aggregation and aisle classification happen here, inside the list app, so the
cookbook cannot write a malformed row and the list owns its own invariants.

---

## 5. Phase 3 — Meal plan (do not build yet)

Only after both apps are in daily use. This is the feature most likely to be
aspirational — one enthusiastic week, then abandoned. Sketch only:

- `meal_plan(date, slot, recipe_id)` in the cookbook database — a plan is dated
  references to recipes, so it belongs with them
- Week grid, weekday dinners by default, lunch and dinner at weekends
- "Add week to list" fans out through the same `addItems` call
- Optional Sunday-evening ntfy nudge via a cron trigger

Ask before starting this.

---

## 6. AI usage

Bind Workers AI (`"ai": { "binding": "AI" }`) in the cookbook app only. **Put
every model ID in a `var`, not inline** — Workers AI retires model names
periodically and you want to swap without a code change.

Use `response_format` with `json_schema`, not `json_object` — schemaless mode has
noticeably worse field adherence. Validate the response with Zod regardless;
none of these enforce a schema as strictly as the declared shape implies. On a
validation failure, retry once, then fall back to the manual paste form.

**Check which models currently support JSON Mode before choosing.** That subset
changes, and it constrains the choice more than quality does.

Suggested starting points, to be confirmed against the current catalog:

| Job | Model | Why |
|---|---|---|
| Recipe extraction from markdown | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Needs world knowledge; fp8 keeps a 70B affordable |
| Density and aisle resolution | same call as above | One call per recipe, not three |
| Bulk re-classification (if ever needed) | `@cf/meta/llama-3.1-8b-instruct-fast` | Closed-set choice; fewest Neurons |

The Neuron pool is shared across models and large models drain it fast. **One
structured call per import** — parse, convert, and classify together, so the model
sees the whole recipe as context when deciding whether "cups" means flour or
stock.

### 6.2 The cache is the real cost control

```sql
-- in the cookbook database
ingredient_facts(
  name_normalised TEXT PRIMARY KEY,
  aisle TEXT,
  grams_per_cup REAL,             -- null = not a dry volume ingredient
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Aisle and density are properties of the *ingredient*, not the recipe. Flour is
flour. Look up here first; only ask a model about names that miss. After a few
dozen recipes most imports will call no model at all. This is
provider-independent, so a later switch of model or provider costs nothing.

The list app needs aisles too. Rather than sharing this table across databases,
have `addItems` accept an optional `aisle` per item from the cookbook, and let the
list app keep its own small cache for manually-added items.

---

## 7. Privacy — this repo is published publicly

- No emails, addresses, real domain, or `cloudflareaccess.com` team name in any
  committed file. `vars` are plaintext.
- Secrets via `wrangler secret put`. Personal data via a gitignored
  `seed.local.sql`, following the pattern the gas app already uses.
- `created_by` and `added_by` hold Access emails **in the database**, which is
  fine. They must not appear in config, fixtures, or committed seed files.
- Before finishing, report anything found in a committed file that identifies the
  owner. Do not silently change unrelated files.

---

## 8. Acceptance criteria

**Phase 1**
- A recipe URL from a JSON-LD site imports with title, ingredients, steps and
  time, calling no model
- A recipe URL from a site without JSON-LD imports via `toMarkdown` plus a model
- A US recipe with `2 cups flour` and `350°F` stores `240 g` (or the rounded
  density-derived weight) and `175 °C`, with both originals visible in the UI
- Sharing a URL from Chrome on Android opens the prefilled form
- "Cooked today" updates the badge; catalog can sort by staleness
- Every ingredient row has a non-empty `original`

**Phase 2**
- Ad-hoc items can be added, checked, and cleared with no cookbook involvement
- "Add to list" from a recipe creates lines stamped with the recipe title
- Adding the same recipe twice sums matching name+unit lines and leaves
  mismatched units as separate lines
- Copy-as-text produces something readable in a messaging app
- Both apps install as separate home-screen icons from the same origin

**Both**
- `pnpm typegen && pnpm check` clean
- Each app deploys independently; a schema change in one does not require
  redeploying the other
- Non-navigation asset misses return 404, not HTML

---

## 9. Questions to raise rather than guess

1. Recipe images: keep the imported source URL, or upload to R2? R2 adds a
   binding and an upload path; source URLs rot. Ask before building uploads.
2. Servings scaling: adjust quantities by target servings, or not? Not specified
   above; it interacts with rounding.
3. German-language recipe sites use `EL`/`TL` for tbsp/tsp. Confirm these are in
   the deterministic table before relying on the model for them.
