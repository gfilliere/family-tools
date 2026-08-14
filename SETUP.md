# Setup, start to finish

Roughly 40 minutes. Do the accounts first, then the deploy — the deploy needs
IDs that only exist once the accounts do.

---

## 1. Cloudflare account and domain

1. Sign up at <https://dash.cloudflare.com/sign-up>. Free plan is enough for
   everything here.
2. Get a domain onto the account. Either:
   - **Register one through Cloudflare** (Domain Registrar → Register Domain).
     They sell at cost, roughly €10/year for a `.com`. Simplest option.
   - **Or move an existing domain**: Add a site → enter the domain → pick Free →
     Cloudflare shows two nameservers → set those at your current registrar.
     Propagation is usually under an hour.
3. Once the zone is active, go to **DNS → Records** and add:

   | Type  | Name   | Target          | Proxy   |
   |-------|--------|-----------------|---------|
   | AAAA  | `home` | `100::`         | Proxied |

   `100::` is the IPv6 discard prefix. Nothing is behind it — the record exists
   only so the hostname resolves and gets an orange cloud. The Worker route
   intercepts the request before anything tries to reach that address.

4. Note your **Account ID**: dashboard sidebar, or Workers & Pages → right
   column. You need it for GitHub Actions.

---

## 2. Cloudflare Access — the two-user gate

This is what makes the apps private. Do it *before* your first deploy, so the
apps are never briefly public.

1. In the dashboard, open **Zero Trust** (left sidebar). First time in, it asks
   you to pick a team name — this becomes `yourteam.cloudflareaccess.com`, the
   login domain. Choose the **Free** plan; it covers 50 users.
2. **Settings → Authentication → Login methods**. Add at least one:
   - *One-time PIN* works immediately with no configuration — Access emails a
     code. Good enough for two people.
   - *Google* is nicer day to day if you both use Gmail. Add it if you want the
     one-tap login.
3. **Access → Applications → Add an application → Self-hosted**.
   - Application name: `home`
   - Session Duration: **1 month**. The default is 24 hours, which means
     re-authenticating constantly on an installed phone app.
   - Public hostname: subdomain `home`, domain `example.com`, path blank
     (blank path = the whole hostname, every app at once).
4. On the policy step:
   - Policy name: `us`
   - Action: **Allow**
   - Rule: Include → **Emails** → add your address and your wife's.
5. Save. Everything under `home.example.com` now requires a login.

**Check it works before deploying anything**: open `https://home.example.com`
in a private window. You should get the Access login screen, not an error.

---

## 3. Tankerkönig account (for the gas app)

Tankerkönig is a licensed redistributor of the Bundeskartellamt's MTS-K fuel
price data. Free, CC BY 4.0.

1. Go to <https://creativecommons.tankerkoenig.de/#register>.
2. Enter first name, last name, email. They now collect names as well as email
   because the regulator asked them to.
3. The API key arrives by email. It looks like a UUID.
4. **Find your station IDs.** In a browser, with your key substituted and your
   own coordinates (right-click your house in Google Maps to copy them):

   ```
   https://creativecommons.tankerkoenig.de/json/list.php?lat=LATITUDE&lng=LONGITUDE&rad=3&sort=dist&type=e10&apikey=YOUR_KEY
   ```

   Pick the two or three you actually use and copy each `id` field.

5. **Create your local seed file:**
   Copy `apps/gas/seed.example.sql` to `apps/gas/seed.local.sql` and replace the
   example UUIDs and station labels with your real station IDs and friendly names.
   `seed.local.sql` is gitignored so your personal location data remains private.

Terms worth honouring: attribute tankerkoenig.de (the app footer already does),
don't poll more than once per 5 minutes, keep the key server-side. This scaffold
keeps the key in a Worker secret, so it never reaches the browser.

---

## 4. Local setup

```bash
corepack enable                # gets you the pinned pnpm
pnpm install
npx wrangler login             # opens a browser, authorises the CLI
```

Then replace `example.com` with your real domain. Two files:

```bash
grep -rl 'home.example.com' apps/ | xargs sed -i '' 's/example\.com/YOURDOMAIN.com/g'
```

(drop the `''` after `-i` if you're not on macOS)

### Create the databases

```bash
# 1. Gas database
cd apps/gas
npx wrangler d1 create gas
# Copy the database_id printed into apps/gas/wrangler.jsonc over REPLACE_ME

# 2. Core database (shared identity & user directory)
cd ../admin
npx wrangler d1 create core
# Copy the database_id printed into BOTH apps/admin/wrangler.jsonc and apps/shell/wrangler.jsonc over REPLACE_ME
```

### Apply database migrations and seed data

Apply migrations and seed initial data to Cloudflare's remote D1 databases:

```bash
# Apply migrations
pnpm --filter gas migrate
pnpm --filter admin migrate

# Seed gas stations and admin identity from gitignored seed.local.sql files
pnpm --filter gas seed

cp apps/admin/seed.example.sql apps/admin/seed.local.sql
# Edit apps/admin/seed.local.sql with your real Cloudflare Access email and display name
pnpm --filter admin seed
```

For local offline development with Wrangler, apply migrations and seed locally:

```bash
pnpm --filter admin run migrate:local
pnpm --filter admin run seed:local
```

### Fill in config and secrets

1. In `apps/gas/wrangler.jsonc`, set `THRESHOLD_EUR` to the price threshold you'd act on (e.g., `1.699`) and optionally `NTFY_TOPIC`.
2. The Tankerkönig API key is a secret, not a var — it must never land in git:

```bash
npx wrangler secret put TANKERKOENIG_KEY
```

### First deploy, by hand

```bash
cd ../..
pnpm typegen        # generates worker-configuration.d.ts from your bindings
pnpm --filter shell run deploy
pnpm --filter gas run deploy
pnpm --filter admin run deploy
```

Visit `https://home.example.com`. Access should challenge you, then the
launcher appears. Admins will see the "User Directory" tile to manage display names.

---

## 5. GitHub Actions

1. Push the repo to GitHub (private).
2. Create a scoped API token: dashboard → **My Profile → API Tokens → Create
   Token → Edit Cloudflare Workers** template.
   - Under **Account Resources**, pick your account.
   - Under **Zone Resources**, pick your zone.
   - **Crucial Step for D1**: Click **+ Add more** under Permissions and add:
     - `Account` → **`D1`** → **`Edit`** (required for `wrangler d1 migrations apply` during CI).
   - Copy the token — it's shown once.
3. In the GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**. Add two:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. **Settings → Environments → New environment → `production`.** The workflow
   references it; adding a required reviewer here gives you a manual gate if you
   ever want one.

Push to `main` and only the apps whose folders changed will deploy.

---

## 6. Put it on both phones

On Android, in Chrome:

1. Open `https://home.example.com/gas/`, sign in through Access.
2. Menu → **Add to Home screen** → Install.

Because each app declares its own `scope`, they install as separate icons even
though they share one origin. Your wife does the same on her phone with her own
email — the Access policy already lists her.

---

## 7. Publishing this repo

If you publish or fork this repository publicly on GitHub:

- **Safe to commit**: `database_id`, custom route hostnames (e.g. `home.example.com` — hostnames appear in public Certificate Transparency logs anyway), and non-sensitive configuration (`THRESHOLD_EUR`).
- **Do NOT commit**: Real station IDs or coordinates (they reveal your neighborhood), personal email addresses, API keys, or private location data.
- **GitHub Security**: Enable **Secret Scanning** and **Push Protection** in your GitHub repository settings (**Settings → Code security and analysis**) to automatically prevent accidental commits of secret tokens.

---

## Adding the next app

```bash
cp -r apps/gas apps/newthing
```

Then: rename in `package.json` and `wrangler.jsonc`, change the route pattern
and the Vite `base`/`outDir` to `/newthing/`, drop the D1 and cron blocks if
unused, add a line to `APPS` in `apps/shell/src/client/main.tsx`, and add a
`newthing` filter to `.github/workflows/deploy.yml`.

No new Access application, no new DNS record, no new certificate. That's the
whole point of the single-origin layout.
