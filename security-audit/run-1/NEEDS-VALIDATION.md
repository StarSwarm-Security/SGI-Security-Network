# Needs validation

These leads are not confirmed vulnerabilities. They have no severity. Do not send guesses or exploit traffic to production.

## Redeem failures distinguish code state, and a correct guess can grant credit or a promo tier

Fingerprint: `worker.redeem.code-state-oracle`.

### Boundary

An anonymous caller can mint a bearer at `POST /v1/auth/device` and then call `POST /v1/redeem/codes`. Failed claims return different statuses. A successful claim of the right kind writes bonus credits or a promo entitlement for that session's user.

### Trace

1. **Entrypoint.** `worker/src/index.ts` line 49. `POST /v1/auth/device` is public and has no attempt counter.
2. **Propagation.** `worker/src/auth/session.ts` line 160. An omitted `deviceId` becomes a new UUID and a new anonymous user and bearer. `device_exists` is only the unique-conflict path.
3. **Propagation.** `worker/src/index.ts` line 93. `requireSession` accepts any unexpired bearer. The analyze daily cap does not apply.
4. **Propagation.** `worker/src/redeem/handler.ts` line 50. The claim `UPDATE` changes a row only when the code is unexpired, still under `max_uses`, and this device has no redemption.
5. **Sink.** `worker/src/redeem/handler.ts` line 115. A miss is `404 code_unknown`, `409 code_expired`, `409 code_exhausted`, or `409 code_unavailable`. A live `sc_grant` adds `bonus_credits` (line 73). A live `tier_trial` inserts a promo monthly or yearly entitlement (line 85). Kind `promo` records a redemption and does not add credits or a tier.

### Evidence checked

- The four failure returns are in `worker/src/redeem/handler.ts` at lines 115–118.
- The request grammar is `^[A-Z0-9-]{4,64}$` (line 6). That is not the stored distribution.
- `worker/migrations/0001_init.sql` creates `redeem_codes` and does not insert rows (line 95).
- `worker/wrangler.jsonc` binds D1 and defines no routes and no rate-limit binding (line 55).
- `worker/test/api.test.ts` line 310 shows a second session receiving HTTP 409 for a used one-use code. Line 340 shows a fixture `tier_trial` becoming tier `yearly` with source `promo`.

### Blockers

- Code length, charset, kind, `max_uses`, expiry, and whether any live `sc_grant` or `tier_trial` row exists are only in D1. This run did not query it.
- A Cloudflare zone or WAF limit in front of `sgi-api` would not appear in this repository. That fact decides whether searching the stored space is bounded.

### Resolution plan

**Local.** On local D1 only (`remote: false`), create one anonymous bearer and insert fixture rows: an expired code, a code with `use_count >= max_uses`, a live `sc_grant`, and a live `tier_trial`. POST each, plus one absent code, to `/v1/redeem/codes`. Expect `404 code_unknown`, `409 code_expired`, `409 code_exhausted`, HTTP 200 with bonus credits for `sc_grant`, and HTTP 200 plus an entitlements row with source `promo` for `tier_trial`. Repeat misses on that bearer and repeat `POST /v1/auth/device`. Confirm the app still returns those bodies and does not answer 429. Do not send those requests to the deployed worker.

**Deployment, read-only.** Inspect `sgi-api` D1 `redeem_codes` for length, charset, kind, `max_uses`, `use_count`, and `expires_at`. Inspect the zone for a limit on `POST /v1/redeem/codes` and `POST /v1/auth/device`. Do not submit guessed codes to production. Long high-entropy rows, or an edge limit that blocks searching that space, leave the differentiated errors without a practical break. Short or patterned live `sc_grant` or `tier_trial` rows with no such limit make the source path exploitable.

A uniform error for every miss, plus an attempt cap, is the source change if the owner decides the oracle matters. That change is not applied in this audit.
