import { Hono } from "hono";
import { userEmail } from "@family-tools/ui";

const app = new Hono<{ Bindings: Env }>();

/** Who Cloudflare Access says you are. Used by the launcher to greet you. */
app.get("/api/me", (c) => c.json({ email: userEmail(c.req.raw) }));

app.get("*", async (c) => {
  if (!c.req.header("accept")?.includes("text/html")) {
    return c.text(`No asset at ${new URL(c.req.url).pathname}`, 404);
  }
  return c.env.ASSETS.fetch(new Request(new URL("/", c.req.url)));
});

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
