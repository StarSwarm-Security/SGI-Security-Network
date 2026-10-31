# sgi edge tail

The live `sgi` Worker and the starswarm-sgi Pages `_worker.js` are a generated single script that is not in this repo. The publisher inlines static files into `const F = { path: [contentType, base64] }` and appends a static-serving wrapper.

Append **`edge/sgi-worker-tail.js` instead of the old wrapper.**

- Bundle the tail so its imports resolve: `./swarm-feed.js` and `../data/agent-threats.json`. A plain concatenate leaves those `import` lines unloaded.
- The tail ships a placeholder `const F = {}` so it can run in tests. If the publisher already emits `const F`, delete that placeholder line and keep the generated map.
- `GET /api/swarm-feed` is handled before the static lookup. Every other request keeps the old wrapper's behavior.
- `edge/*.js` may also be inlined into `F` as static files. That is harmless: there are no secrets, tokens, or personal data in this folder. Excluding `edge/` from `F` is fine if you would rather not publish the handler source twice.
- Cache is `Cache-Control` plus `caches.default` when it exists, and an in-isolate memo. Do not add KV, cron, or any other binding for this feed.
- Do not deploy this from a pull request. The site owner runs the publish script.
