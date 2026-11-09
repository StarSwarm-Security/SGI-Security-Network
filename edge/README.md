# sgi edge tail

The live `sgi` Worker and the starswarm-sgi Pages `_worker.js` are a generated single script that is not in this repo. The publisher inlines static files into `const F = { path: [contentType, base64] }` and appends a static-serving wrapper.

Append **`edge/sgi-worker-tail.js` instead of the old wrapper.**

- Bundle the tail so its imports resolve: `./swarm-feed.js` and `../data/agent-threats.json`. A plain concatenate leaves those `import` lines unloaded.
- The tail ships a placeholder `const F = {}` so it can run in tests. If the publisher already emits `const F`, delete that placeholder line and keep the generated map.
- `GET /api/swarm-feed` is handled before the static lookup. Every other request keeps the old wrapper's behavior.
- `edge/*.js` may also be inlined into `F` as static files. That is harmless: there are no secrets, tokens, or personal data in this folder. Excluding `edge/` from `F` is fine if you would rather not publish the handler source twice.
- Cache is `Cache-Control` plus `caches.default` when it exists, an in-isolate memo for the merged feed, and a separate in-isolate LRU of about 100 OSV lookups kept for 10 minutes. Do not add KV or cron.
- `?package=` must be an npm package name (lowercase, URL-safe, optional `@scope/name`, at most 214 characters). Anything else is `400` and does not call OSV.
- Rate limiting is optional. If `env.FEED_LIMITER` or `env.FEED_PACKAGE_LIMITER` is missing, or `CF-Connecting-IP` is missing, the feed does not throttle and does not throw. The external `sgi` Worker deploy script (bindings are empty today) can add:

```jsonc
"ratelimits": [
  {
    "name": "FEED_LIMITER",
    "namespace_id": "841011",
    "simple": { "limit": 60, "period": 60 }
  },
  {
    "name": "FEED_PACKAGE_LIMITER",
    "namespace_id": "841012",
    "simple": { "limit": 10, "period": 60 }
  }
]
```

`FEED_LIMITER` is 60 requests a minute for `/api/swarm-feed`. `FEED_PACKAGE_LIMITER` is an extra 10 a minute when `?package=` is set. Both are keyed by `CF-Connecting-IP`. `namespace_id` must be unique in the account and must not reuse the sgi-api ids `841001`–`841004`. A hit returns `429` with `Retry-After: 60`. The address is not stored.

- Do not deploy this from a pull request. The site owner runs the publish script.
