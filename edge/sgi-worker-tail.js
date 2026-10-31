// Wrapper used by the live `sgi` Worker and starswarm-sgi Pages _worker.js.
// The real bundle prepends `const F = {path: [contentType, base64]}` built from `git ls-files` (excluding worker/).
// Deploy metadata today: main_module worker.js, compatibility_date 2024-11-01, bindings: [] (no KV, no cron).
// This tail is the previous static wrapper plus GET /api/swarm-feed. See edge/README.md.
import agentThreats from '../data/agent-threats.json';
import { handleSwarmFeed } from './swarm-feed.js';

const F = {};
;
const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readBundled() {
  try {
    const entry = F['/data/agent-threats.json'];
    if (entry) {
      const text = new TextDecoder().decode(b64ToBytes(entry[1]));
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.entries)) return parsed;
    }
  } catch { /* fall through to the imported copy */ }
  return agentThreats;
}

function cacheBinding() {
  try {
    if (typeof caches !== 'undefined' && caches && caches.default) return caches.default;
  } catch { /* workers.dev cache is a no-op; tests may omit it */ }
  return null;
}

const PRETTY = { '/privacy.html': '/privacy', '/terms.html': '/terms' };
export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', ...SEC } });
    }
    const u = new URL(request.url);
    if (request.method === 'GET' && (u.pathname === '/api/swarm-feed' || u.pathname === '/api/swarm-feed/')) {
      return handleSwarmFeed(request, { bundled: readBundled(), cache: cacheBinding() });
    }
    let path = u.pathname;
    if (path === '' || path === '/') path = '/index.html';
    if (path.endsWith('/') && path !== '/') path = path + 'index.html';
    if (PRETTY[path]) {
      const dest = new URL(PRETTY[path], u.origin);
      dest.search = u.search;
      return Response.redirect(dest.toString(), 308);
    }
    let entry = F[path] || F[path.replace(/\/$/, '')];
    if (!entry && !path.includes('.')) {
      entry = F[path + '.html'] || F[path + '/index.html'];
    }
    if (!entry) {
      const nf = F['/404.html'];
      if (nf) {
        const [ct, b64] = nf;
        const headers = { 'Content-Type': ct, 'Cache-Control': 'public, max-age=60', ...SEC };
        if (request.method === 'HEAD') return new Response(null, { status: 404, headers });
        return new Response(b64ToBytes(b64), { status: 404, headers });
      }
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SEC } });
    }
    const [ct, b64] = entry;
    const headers = { 'Content-Type': ct, 'Cache-Control': path.match(/\.(woff2|jpg|jpeg|png|webp)$/) ? 'public, max-age=86400' : 'public, max-age=300', ...SEC };
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
    return new Response(b64ToBytes(b64), { status: 200, headers });
  },
};
