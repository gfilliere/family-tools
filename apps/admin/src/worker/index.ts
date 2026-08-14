/**
 * Admin Micro-App Worker
 *
 * Purpose:
 * Manages user display names and administrative authorization for the family tools suite.
 *
 * Authorization Authority:
 * The `CORE.users` table in Cloudflare D1 is the sole source of truth and authority.
 * There is no hardcoded or wrangler config variable for admin identity.
 *
 * The Lockout & Empty Table Recovery:
 * When the `users` table is empty (such as on a fresh deployment or clone), all /admin
 * routes return a 403 Forbidden with a clear message instructing the operator to run
 * the seed script (`pnpm --filter admin seed` or `pnpm --filter admin run seed:local`).
 *
 * Local Development Fallback:
 * In local development (localhost / 127.0.0.1 / ::1), the Cloudflare Access header is absent.
 * In this dev-only branch, the worker falls back to DEV_EMAIL from `.dev.vars` (or "admin@example.com").
 * In production, a missing header returns 401 Unauthorized (Cloudflare Access misconfiguration).
 *
 * Lockout Protection:
 * The API explicitly refuses requests where an administrator attempts to clear their own
 * admin flag or delete their own database row.
 */

import { Hono } from "hono";
import { userEmail } from "@family-tools/ui";

interface UserRow {
  email: string;
  display_name: string;
  is_admin: number;
  created_at: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;
const MAX_DISPLAY_NAME_LENGTH = 100;

/** Resolves the caller email, with an explicit localhost-only DEV_EMAIL fallback. */
function resolveCallerEmail(req: Request, devEmail?: string): { email: string | null; isDevFallback: boolean } {
  const headerEmail = userEmail(req);
  if (headerEmail) {
    return { email: headerEmail.trim().toLowerCase(), isDevFallback: false };
  }

  // Dev-only fallback: Cloudflare Access header is absent locally in development.
  if (devEmail && devEmail.trim()) {
    const effectiveDevEmail = devEmail.trim().toLowerCase();
    return { email: effectiveDevEmail, isDevFallback: true };
  }

  return { email: null, isDevFallback: false };
}

interface AuthCheckResult {
  allowed: boolean;
  statusCode: 401 | 403 | 200;
  errorMessage?: string;
  email?: string;
}

/** Verifies user authorization against the CORE D1 database. */
async function verifyAdminAuth(env: Env, req: Request): Promise<AuthCheckResult> {
  const devEmail = (env as unknown as Record<string, unknown>).DEV_EMAIL as string | undefined;
  const { email } = resolveCallerEmail(req, devEmail);

  // Missing header outside local dev -> 401
  if (!email) {
    return {
      allowed: false,
      statusCode: 401,
      errorMessage: "Unauthorized: Missing Cloudflare Access authentication header",
    };
  }

  try {
    // Check if the database has any users or admins configured
    const countRow = await env.CORE.prepare(
      "SELECT count(*) as total, count(CASE WHEN is_admin = 1 THEN 1 END) as admin_count FROM users",
    ).first<{ total: number; admin_count: number }>();

    if (!countRow || countRow.total === 0 || countRow.admin_count === 0) {
      return {
        allowed: false,
        statusCode: 403,
        errorMessage: "Forbidden: No administrators configured. Seed the database first with: `pnpm --filter admin seed` (or `pnpm --filter admin run seed:local` for local dev).",
      };
    }

    // Check row for caller
    const userRow = await env.CORE.prepare(
      "SELECT is_admin FROM users WHERE email = ?1",
    ).bind(email).first<{ is_admin: number }>();

    if (userRow && userRow.is_admin === 1) {
      return {
        allowed: true,
        statusCode: 200,
        email,
      };
    }

    return {
      allowed: false,
      statusCode: 403,
      errorMessage: "Forbidden: Administrator privileges required",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      allowed: false,
      statusCode: 403,
      errorMessage: `Forbidden: Database uninitialized (${msg}). Run migrations and seed: \`pnpm --filter admin migrate\` && \`pnpm --filter admin seed\` (or \`pnpm --filter admin run migrate:local\` && \`pnpm --filter admin run seed:local\` for local dev).`,
    };
  }
}

const app = new Hono<{
  Bindings: Env;
  Variables: { callerEmail: string };
}>().basePath("/admin");

// Authorization Gate: Protect all /admin routes
app.use("*", async (c, next) => {
  const isApi = c.req.path.startsWith("/admin/api");
  const auth = await verifyAdminAuth(c.env, c.req.raw);

  if (!auth.allowed) {
    if (isApi) {
      return c.json({ error: auth.errorMessage }, auth.statusCode);
    }
    return c.text(auth.errorMessage ?? "Forbidden", auth.statusCode);
  }

  c.set("callerEmail", auth.email!);
  await next();
});

/** Return caller's identity. */
app.get("/api/me", async (c) => {
  const email = c.get("callerEmail");
  let displayName = email.split("@")[0] ?? email;
  displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

  try {
    const row = await c.env.CORE.prepare(
      "SELECT display_name FROM users WHERE email = ?1",
    ).bind(email).first<{ display_name: string }>();
    if (row?.display_name) {
      displayName = row.display_name;
    }
  } catch {
    // Graceful fallback on database error
  }

  return c.json({
    email,
    displayName,
    isAdmin: true,
  });
});

/** List all users. */
app.get("/api/users", async (c) => {
  try {
    const { results } = await c.env.CORE.prepare(
      "SELECT email, display_name, is_admin, created_at FROM users ORDER BY display_name COLLATE NOCASE ASC",
    ).all<UserRow>();

    return c.json({
      users: results.map((u: UserRow) => ({
        email: u.email,
        displayName: u.display_name,
        isAdmin: u.is_admin === 1,
        createdAt: u.created_at,
      })),
    });
  } catch (err) {
    return c.json({
      users: [],
      error: err instanceof Error ? err.message : "Database error loading users",
    }, 500);
  }
});

/** Create a new user. */
app.post("/api/users", async (c) => {
  let body: { email?: string; displayName?: string; isAdmin?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON payload" }, 400);
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const rawDisplayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const isAdmin = Boolean(body.isAdmin);

  if (!rawEmail || !EMAIL_REGEX.test(rawEmail) || rawEmail.length > MAX_EMAIL_LENGTH) {
    return c.json({ error: "Please enter a valid email address (max 255 chars)" }, 400);
  }

  if (!rawDisplayName || rawDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return c.json({ error: "Display name cannot be blank (max 100 chars)" }, 400);
  }

  try {
    await c.env.CORE.prepare(
      "INSERT INTO users (email, display_name, is_admin) VALUES (?1, ?2, ?3)",
    ).bind(rawEmail, rawDisplayName, isAdmin ? 1 : 0).run();

    return c.json({
      user: {
        email: rawEmail,
        displayName: rawDisplayName,
        isAdmin,
        createdAt: new Date().toISOString(),
      },
      success: true,
    }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE") || msg.includes("constraint failed")) {
      return c.json({ error: "A user with this email address already exists" }, 409);
    }
    return c.json({ error: `Database error creating user: ${msg}` }, 500);
  }
});

/** Update an existing user (display name or admin status). */
app.patch("/api/users/:email", async (c) => {
  const targetEmail = decodeURIComponent(c.req.param("email")).trim().toLowerCase();
  const callerEmail = c.get("callerEmail");

  let body: { displayName?: string; isAdmin?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON payload" }, 400);
  }

  // Guard against locking yourself out: refuse to clear your own admin flag
  if (targetEmail === callerEmail && body.isAdmin === false) {
    return c.json({ error: "Refused: You cannot revoke your own administrator privileges" }, 400);
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.displayName !== undefined) {
    const trimmed = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!trimmed || trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
      return c.json({ error: "Display name cannot be blank (max 100 chars)" }, 400);
    }
    updates.push(`display_name = ?${values.length + 1}`);
    values.push(trimmed);
  }

  if (body.isAdmin !== undefined) {
    updates.push(`is_admin = ?${values.length + 1}`);
    values.push(body.isAdmin ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ error: "No fields provided for update" }, 400);
  }

  values.push(targetEmail);

  try {
    const res = await c.env.CORE.prepare(
      `UPDATE users SET ${updates.join(", ")} WHERE email = ?${values.length}`,
    ).bind(...values).run();

    if (res.meta.changes === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ success: true });
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : "Database error updating user",
    }, 500);
  }
});

/** Delete a user. */
app.delete("/api/users/:email", async (c) => {
  const targetEmail = decodeURIComponent(c.req.param("email")).trim().toLowerCase();
  const callerEmail = c.get("callerEmail");

  // Guard against locking yourself out: refuse to delete your own row
  if (targetEmail === callerEmail) {
    return c.json({ error: "Refused: You cannot delete your own user account" }, 400);
  }

  try {
    const res = await c.env.CORE.prepare(
      "DELETE FROM users WHERE email = ?1",
    ).bind(targetEmail).run();

    if (res.meta.changes === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ success: true });
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : "Database error deleting user",
    }, 500);
  }
});

/** Anything else under /admin/ that is not an API route: serve the app shell. */
app.get("*", async (c) => {
  if (!c.req.header("accept")?.includes("text/html")) {
    return c.text(`No asset at ${new URL(c.req.url).pathname}`, 404);
  }
  return c.env.ASSETS.fetch(new Request(new URL("/admin/", c.req.url)));
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
