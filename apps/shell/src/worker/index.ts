import { Hono } from "hono";
import { userEmail } from "@family-tools/ui";

const app = new Hono<{ Bindings: Env }>();

/** Who Cloudflare Access says you are. Used by the launcher to greet you. */
app.get("/api/me", (c) => c.json({ email: userEmail(c.req.raw) }));

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
