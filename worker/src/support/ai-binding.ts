/** Optional until an `ai` binding is added. Wrangler cannot simulate Workers AI locally. */
export {};

declare global {
  interface Env {
    AI?: Ai;
  }
}
