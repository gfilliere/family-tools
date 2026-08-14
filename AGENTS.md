# Agent Guidelines for `family-tools`

This repository contains private, single-domain micro-applications for personal/family use, hosted on Cloudflare Workers with Cloudflare Access authentication.

---

## 1. System Architecture

```
home.example.com/gas/*  ─→  Worker "gas"    (Hono + Preact + D1 + Cron)
home.example.com/*      ─→  Worker "shell"  (Launcher UI)
                    ▲
              Cloudflare Access (Auth Gate)
```

- **Single Origin & Gate**: A single apex/subdomain (e.g., `home.example.com`) is protected by **Cloudflare Access** (OAuth/OTP). All sub-apps inherit authentication.
- **Path-Based Worker Routing**: Sub-apps reside on subpaths (e.g., `/gas/`). Specific routes take precedence over the root launcher `shell` catch-all (`home.example.com/*`).
- **Isolation**: Each micro-app in `apps/` is an independently deployable Cloudflare Worker with its own frontend static assets (`dist/client`), Hono backend (`src/worker`), and bindings (D1 databases, crons, env vars).
- **Shared Code**: Shared UI components, styling tokens, and auth helpers reside in `packages/ui` (`@family-tools/ui`).

---

## 2. Critical Safety & Structural Rules

1. **`workers_dev: false` MUST BE PRESERVED**:
   Setting `workers_dev: true` in any `wrangler.jsonc` creates an unauthenticated `*.workers.dev` public URL that **completely bypasses Cloudflare Access protection**. Keep `workers_dev: false` strictly enabled.
2. **Vite Path Alignment & Asset Hierarchy**:
   `vite.config.ts` settings `base` and `build.outDir` MUST match the Worker's route path:
   - Example for `/gas/`: `base: "/gas/"` and `build: { outDir: "dist/client/gas", emptyOutDir: true }`.
   - `wrangler.jsonc` `assets.directory` points to `./dist/client` and `not_found_handling: "none"`.
   - This ensures `/gas/assets/x.js` maps straight to `dist/client/gas/assets/x.js` so assets are served directly by the edge without Worker invocation.
   - In dev, `vite` proxies `/gas/api` to `wrangler dev` (port 8787).
3. **Binding Types Generation (`typegen`)**:
   Always run `pnpm typegen` after adding or changing bindings (D1, KV, secrets, vars) in `wrangler.jsonc`. This updates `worker-configuration.d.ts`.
4. **Header Trust**:
   Cloudflare Access injects `cf-access-authenticated-user-email` on every request. Rely on `userEmail(req)` from `@family-tools/ui` to obtain the authenticated user.
5. **Cron Handler Exemption**:
   Worker `scheduled` triggers (crons) run inside `workerd` directly and bypass Access. Do not attempt to read Access headers inside `scheduled` handlers.

---

## 3. Directory Layout

```
.
├── apps/
│   ├── shell/           # Root launcher app at /
│   └── gas/             # Fuel price monitor at /gas/
│       ├── src/client/  # Preact frontend (Vite)
│       ├── src/worker/  # Hono backend routes + scheduled handlers
│       ├── migrations/  # D1 SQLite database migrations
│       └── wrangler.jsonc
├── packages/
│   └── ui/              # Shared design tokens (styles.css) and helpers (@family-tools/ui)
├── .github/workflows/   # Deployment pipeline (per-app change detection)
├── package.json         # Workspace root scripts
├── pnpm-workspace.yaml  # Monorepo configuration
└── SETUP.md             # Initial infrastructure & Cloudflare configuration guide
```

---

## 4. Tech Stack & Tools

| Component | Tool / Library | Notes |
|---|---|---|
| Runtime | `workerd` | V8 isolates, `nodejs_compat` flag |
| Server | Hono | Uses `basePath()` matching app route |
| Client | Preact + Vite | Lightweight UI bundle |
| Data | Cloudflare D1 | Embedded SQLite database |
| Package Manager | `pnpm` (v10) | Workspace with `onlyBuiltDependencies` |
| Types & Linting | TypeScript 7 + `oxlint` | `oxlint` used due to TS 7 API changes |

---

## 5. Developer Workflows & Commands

### Installation & Setup
```bash
pnpm install
pnpm typegen      # Generate worker-configuration.d.ts from wrangler bindings
```

### Development & Verification
```bash
pnpm dev          # Runs shell dev server (or pnpm --filter gas dev)
pnpm check        # Runs `tsc --build` and `oxlint .`
```

### Adding a New Micro-App
1. Copy an existing app directory: `cp -r apps/gas apps/newthing`.
2. Update `package.json` name and `wrangler.jsonc` (`name`, `routes`, `basePath`).
3. Update `vite.config.ts` (`base: "/newthing/"`, `outDir: "dist/client/newthing"`).
4. Register the new app in `apps/shell/src/client/main.tsx` (`APPS` list).
5. Add path filter rule in `.github/workflows/deploy.yml`.
6. Run `pnpm typegen` and `pnpm check`.
