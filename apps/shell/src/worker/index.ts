import { Hono } from "hono";
import { userEmail } from "@family-tools/ui";

const app = new Hono<{ Bindings: Env }>();

/** Resolves caller email, falling back to DEV_EMAIL in dev mode. */
function resolveCallerEmail(req: Request, devEmail?: string): string | null {
  const headerEmail = userEmail(req);
  if (headerEmail) return headerEmail.trim().toLowerCase();

  // Dev-only fallback: Cloudflare Access header is absent locally in development.
  if (devEmail && devEmail.trim()) {
    return devEmail.trim().toLowerCase();
  }

  return null;
}

/** Who Cloudflare Access says you are. Used by the launcher to greet you. */
app.get("/api/me", async (c) => {
  const devEmail = (c.env as unknown as Record<string, unknown>).DEV_EMAIL as string | undefined;
  const email = resolveCallerEmail(c.req.raw, devEmail);
  if (!email) {
    return c.json({ email: null, displayName: "there", isAdmin: false });
  }

  // Friendly fallback from email local-part: e.g. "alex" -> "Alex", "john.doe" -> "John"
  const user = email.split("@")[0] ?? email;
  const firstPart = user.split(".")[0] ?? user;
  const defaultDisplayName = firstPart ? firstPart.charAt(0).toUpperCase() + firstPart.slice(1) : user;

  try {
    const row = await c.env.CORE.prepare(
      "SELECT display_name, is_admin FROM users WHERE email = ?1",
    ).bind(email).first<{ display_name: string; is_admin: number }>();

    if (row) {
      return c.json({
        email,
        displayName: row.display_name || defaultDisplayName,
        isAdmin: row.is_admin === 1,
      });
    }
  } catch {
    // Database table not yet initialized or query failure — degrade gracefully
  }

  return c.json({
    email,
    displayName: defaultDisplayName,
    isAdmin: false,
  });
});

app.get("*", async (c) => {
  if (!c.req.header("accept")?.includes("text/html")) {
    return c.text(`No asset at ${new URL(c.req.url).pathname}`, 404);
  }
  return c.env.ASSETS.fetch(new Request(new URL("/", c.req.url)));
});

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
