# 🏡 Family Micro-Apps (`family-tools`)

> **Private, single-domain micro-application suite and boilerplate for Cloudflare Workers.**  
> Host multiple isolated web apps under one custom domain, protected by a single Cloudflare Access authentication gate — running 100% on Cloudflare's free edge tier.

---

## 🌟 Why This Architecture?

Building small web apps for personal or family use usually comes with friction: managing multiple domains, setting up custom authentication flows for every project, or paying for server hosting.

This repository provides a **single-origin monorepo framework** designed to host any number of micro-applications behind a unified login gate:

* **🔐 One Origin, One Auth Gate**: All sub-apps inherit authentication from **Cloudflare Access** (OTP or Google OAuth). Users log in once on `home.yourdomain.com` and gain access to every app.
* **🚀 Path-Based Worker Isolation**: Sub-apps live on distinct paths (`/gas/`, `/chores/`, etc.) powered by independent Cloudflare Workers with their own D1 databases, cron triggers, and frontend assets.
* **📱 Installable PWAs**: Each sub-app specifies its own PWA scope, allowing individual micro-apps to be installed to phone home screens as standalone apps sharing one domain.
* **💸 €0 / Month Infrastructure**: Fits well within Cloudflare’s free tier (100k Worker requests/day, 5GB D1 storage, 50 Cloudflare Access seats). The only cost is your domain name (~€10/year).

---

## 📐 Architecture & Routing

Sub-apps are routed using Cloudflare Worker route precedence rules. Specific subpaths (e.g. `home.domain.com/gas/*`) route directly to dedicated Workers, while unassigned paths fall back to the root `shell` launcher app.

```
home.yourdomain.com/gas/*  ──► Worker "gas"   (Hono + Preact + D1 + Cron)
home.yourdomain.com/*      ──► Worker "shell" (Launcher Hub)
                     ▲
                     │
           Cloudflare Access (Auth Gate: Allowed Emails)
```

---

## 📦 What's Inside?

```
.
├── apps/
│   ├── shell/           # Root launcher hub & dashboard (at /)
│   └── gas/             # Real-time fuel price tracker (at /gas/)
│       ├── src/client/  # Preact frontend (built with Vite)
│       ├── src/worker/  # Hono backend API + scheduled cron poller
│       ├── migrations/  # D1 SQLite database migrations
│       ├── seed.example.sql # Template for local station seeding
│       └── wrangler.jsonc
├── packages/
│   └── ui/              # Shared design tokens (@family-tools/ui) & auth helpers
└── SETUP.md             # Complete step-by-step setup guide
```

### Included Micro-Apps:
1. **`shell`** (`/`): Personalized home launcher featuring time-of-day greetings, user identity display, and quick navigation cards to all family apps.
2. **`gas`** (`/gas/`): Real-world example app monitoring E10 fuel prices via Tankerkönig API. Demonstrates Cloudflare D1 database storage, 7-day price history sparklines, background cron polling, and `ntfy.sh` push notifications when prices drop below a target threshold.

---

## 🛠️ Tech Stack

| Component | Tool / Library | Description |
|---|---|---|
| **Runtime** | `workerd` | V8 isolate environment with `nodejs_compat` |
| **Server** | [Hono](https://hono.dev/) | Edge-first web framework matching subpath routes |
| **Client** | [Preact](https://preactjs.com/) + [Vite](https://vitejs.dev/) | Ultra-lightweight reactive UI bundles |
| **Data** | [Cloudflare D1](https://developers.cloudflare.com/d1/) | Serverless SQLite database at the edge |
| **Monorepo** | `pnpm` (v10) | Fast workspace package management |
| **Types & Quality** | TypeScript 7 + [`oxlint`](https://oxc.rs/) | Strict typing with ultra-fast Rust-based linting |
| **Deployment** | GitHub Actions | Automated per-app change detection & deployment |

---

## 🔒 Privacy & Data Isolation

Personal data (such as fuel station IDs/locations, emails, or personal photos) is strictly separated from committed configuration files:
* **D1 Seeding for Location Data**: Personal location identifiers (such as Tankerkönig station UUIDs) live in your D1 SQLite database via `seed.local.sql`, which is gitignored and never committed.
* **Worker Secrets for Credentials**: API keys and tokens (such as `TANKERKOENIG_KEY`) are managed as server-side Worker secrets (`wrangler secret put`).
* **Safe Configuration**: `wrangler.jsonc` files contain only non-sensitive runtime parameters (`THRESHOLD_EUR`) and public route names.

---

## ⚡ Quick Start

### 1. Prerequisites
- Node.js `>=24` & `pnpm >=10` (`corepack enable`)
- A Cloudflare account and domain
- Wrangler CLI logged in (`npx wrangler login`)

### 2. Local Setup
```bash
# Clone the repository
git clone https://github.com/your-username/family-tools.git
cd family-tools

# Install dependencies & generate wrangler types
pnpm install
pnpm typegen

# Start local dev server (shell)
pnpm dev

# Or develop a specific micro-app
pnpm --filter gas dev
```

### 3. Type Checking & Linting
```bash
pnpm check
```

For complete step-by-step instructions on setting up your Cloudflare account, Access policy, D1 database, API secrets, and GitHub Actions deployments, see **[SETUP.md](./SETUP.md)**.

---

## 💡 How to Add a New Micro-App

Adding a new app takes just a few minutes:

1. **Copy template**: `cp -r apps/gas apps/newthing`
2. **Update configuration**:
   - Update `package.json` name to `newthing`.
   - Update `wrangler.jsonc` (`name: "newthing"`, `pattern: "home.domain.com/newthing/*"`).
   - Update `vite.config.ts` (`base: "/newthing/"`, `outDir: "dist/client/newthing"`).
3. **Register app**: Add `{ path: "/newthing/", name: "New App", ... }` to `APPS` in `apps/shell/src/client/main.tsx`.
4. **Deploy**: Add `newthing` filter to `.github/workflows/deploy.yml` and run `pnpm typegen`.

---

## 🛡️ Critical Operational Rules

* 🔒 **`workers_dev: false` MUST BE PRESERVED**: `wrangler.jsonc` files must keep `workers_dev: false`. Setting this to `true` creates an unauthenticated `*.workers.dev` URL that completely bypasses Cloudflare Access!
* 🔗 **Vite Base & OutDir Alignment**: `vite.config.ts` `base` and `build.outDir` MUST match the Worker's subpath (e.g. `base: "/gas/"` and `outDir: "dist/client/gas"`).
* ⚙️ **Run `pnpm typegen` after binding changes**: Updates `worker-configuration.d.ts` from `wrangler.jsonc` definitions.
* 🛢️ **Unseeded Database Safety**: Worker APIs and cron handlers handle unseeded database tables gracefully. If no enabled stations exist in D1, `/api/prices` returns an empty array with a clear message and the cron polling task remains a safe no-op.

---

## 📄 License & Attribution

- **License**: MIT
- **Fuel Data**: Provided by Markttransparenzstelle für Kraftstoffe via [tankerkoenig.de](https://creativecommons.tankerkoenig.de/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
