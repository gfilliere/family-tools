/** Shared bits every micro app uses. Keep this small on purpose. */
/**
 * The email Cloudflare Access verified for this request.
 * Access overwrites this header on every request, so a client cannot forge it.
 * If a Worker is reachable outside the Access-protected hostname this is not
 * trustworthy — which is why every wrangler.jsonc here sets workers_dev:false.
 */
export declare function userEmail(req: Request): string | null;
/** German fuel prices are quoted to a tenth of a cent: 1.719 */
export declare function splitPrice(price: number): {
    main: string;
    tenth: string;
};
export declare const json: (data: unknown, status?: number) => Response;
