/** Shared bits every micro app uses. Keep this small on purpose. */

/**
 * The email Cloudflare Access verified for this request.
 * Access overwrites this header on every request, so a client cannot forge it.
 * If a Worker is reachable outside the Access-protected hostname this is not
 * trustworthy — which is why every wrangler.jsonc here sets workers_dev:false.
 */
export function userEmail(req: Request): string | null {
  return req.headers.get("cf-access-authenticated-user-email");
}

/** German fuel prices are quoted to a tenth of a cent: 1.719 */
export function splitPrice(price: number): { main: string; tenth: string } {
  const s = price.toFixed(3);
  return { main: s.slice(0, 4), tenth: s.slice(4) };
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
