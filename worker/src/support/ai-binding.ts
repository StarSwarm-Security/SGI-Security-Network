/**
 * Bindings that are not declared in wrangler.jsonc.
 * Workers AI has no local simulator. OAuth and webhook secrets stay unset
 * until `wrangler secret put`, and the webhook fails closed without them.
 */
export {};

declare global {
  interface Env {
    AI?: Ai;
    REVENUECAT_WEBHOOK_SECRET?: string;
    APPLE_CLIENT_ID?: string;
    APPLE_TEAM_ID?: string;
    APPLE_KEY_ID?: string;
    APPLE_PRIVATE_KEY?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
  }
}
