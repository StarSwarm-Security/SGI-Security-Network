// Live swarm-alert feed. Pure functions plus one request handler.
// No secrets, no KV, no cron. Callers inject fetch, clock, and cache.

export const FRESH_MS = 300_000;
export const SWR_MS = 900_000;
export const MAX_ALERTS = 100;
export const MAX_BODY_BYTES = 150 * 1024;
export const UPSTREAM_TIMEOUT_MS = 4000;
export const USER_AGENT = 'StarSwarm-SGI-SwarmFeed/1.0 (+https://starswarm-sgi.pages.dev)';

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'unknown'];
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 };
const CATEGORY_RANK = { 'prompt-injection': 4, 'mcp-skill': 3, 'malware-pkg': 2, campaign: 1 };

const PROMPT_RE = /prompt[\s-]?injection|improper neutralization of (special elements used in )?an? llm|cwe-1427|\bjailbreak\b/i;
const MCP_RE = /\b(mcp|model context protocol|modelcontextprotocol|skill\.md|clawhub|openclaw|cursor|claude code)\b/i;
const GHSA_RE = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;
const CVE_RE = /CVE-\d{4}-\d{4,7}/i;

const CHECKS = {
  'malware-pkg': 'Do not install this package. If it is already present, remove it and rotate tokens it could have read. Confirm on the source page before you act.',
  'mcp-skill': 'Remove the MCP server or skill. Rotate credentials it could have reached. Confirm on the source page before you act.',
  'prompt-injection': 'Do not let an agent follow instructions from this content. Read it yourself. Confirm on the source page before you act.',
  campaign: 'Treat this as a campaign note. Confirm on the source page before you act.',
};

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export const GITHUB_SOURCES = [
  {
    name: 'GitHub Advisory DB npm malware',
    url: 'https://api.github.com/advisories?ecosystem=npm&type=malware&per_page=50',
    kind: 'github-malware',
  },
  {
    name: 'GitHub Advisory DB pip malware',
    url: 'https://api.github.com/advisories?ecosystem=pip&type=malware&per_page=20',
    kind: 'github-malware',
  },
  {
    name: 'GitHub Advisory DB prompt injection',
    url: 'https://api.github.com/advisories?cwes=1427&per_page=30',
    kind: 'github-cwe',
  },
  {
    name: 'GitHub Advisory DB MCP SDK',
    url: 'https://api.github.com/advisories?affects=@modelcontextprotocol/sdk&per_page=20',
    kind: 'github-mcp',
  },
];

export const SOCKET_SOURCE = {
  name: 'Socket.dev blog',
  url: 'https://socket.dev/api/blog/feed.atom',
  kind: 'socket-atom',
};

/** At most four GitHub calls, plus the Socket Atom feed. OSV is on demand only. */
export const FEED_SOURCES = [...GITHUB_SOURCES, SOCKET_SOURCE];

const memory = { memo: null };

export function resetSwarmFeedState() {
  memory.memo = null;
}

function slotOf(deps) {
  return (deps && deps.state) || memory;
}

function clock(now) {
  if (typeof now === 'function') return now();
  if (typeof now === 'number' && Number.isFinite(now)) return now;
  return Date.now();
}

export function safeHttpsUrl(value) {
  const raw = String(value || '').trim();
  if (!/^https:\/\//i.test(raw)) return '';
  if (/[\s<>"'`]/.test(raw)) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function defangUrls(value) {
  return String(value || '').replace(/https?:\/\/[^\s<>"']+/gi, (url) => {
    const bare = url.replace(/[),.;]+$/g, '');
    const tail = url.slice(bare.length);
    return bare.replace(/^http/i, 'hxxp').replace(/\./g, '[.]') + tail;
  });
}

export function sanitizeText(value, max = 480) {
  let text = String(value ?? '');
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  text = text.replace(/<[^>]*>/g, '');
  text = defangUrls(text);
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > max) text = text.slice(0, Math.max(0, max - 1)) + '…';
  return text;
}

export function isPackageName(value) {
  const text = String(value || '').trim();
  if (text.length < 2 || text.length > 214) return false;
  return /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(text);
}

export function cleanIoc(value) {
  let text = String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/<[^>]*>/g, '').trim();
  if (!text || text.length > 300) return '';
  if (/^https?:\/\//i.test(text) || /^javascript:/i.test(text)) return defangUrls(text.replace(/^javascript:/i, 'hxxp:'));
  return text;
}

export function mapSeverity(raw, title = '') {
  const value = String(raw || '').toLowerCase().trim();
  if (value === 'moderate') return 'medium';
  if (SEVERITIES.includes(value) && value !== 'unknown') return value;
  if (value === 'unknown') return 'unknown';
  const blob = String(title || '').toLowerCase();
  if (/\bcritical\b/.test(blob)) return 'critical';
  if (/\bhigh\b/.test(blob)) return 'high';
  if (/\b(medium|moderate)\b/.test(blob)) return 'medium';
  if (/\blow\b/.test(blob)) return 'low';
  return 'unknown';
}

export function toIso(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text + 'T00:00:00.000Z';
  if (/^\d{4}-\d{2}$/.test(text)) return text + '-01T00:00:00.000Z';
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toISOString();
}

function packageNames(raw) {
  const found = [];
  const vulns = Array.isArray(raw && raw.vulnerabilities) ? raw.vulnerabilities : [];
  for (const vuln of vulns) {
    const name = vuln && vuln.package && vuln.package.name;
    const clean = cleanIoc(name);
    if (clean && isPackageName(clean)) found.push(clean);
  }
  return [...new Set(found)];
}

function cweBlob(raw) {
  const cwes = Array.isArray(raw && raw.cwes) ? raw.cwes : [];
  return cwes.map((item) => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return `${item.cwe_id || ''} ${item.name || ''}`;
  }).join(' ');
}

export function categorizeAdvisory(raw, hint) {
  const packages = packageNames(raw).join(' ');
  const blob = [raw && raw.summary, raw && raw.description, cweBlob(raw), packages, hint].filter(Boolean).join(' ');
  if (/CWE-1427/i.test(cweBlob(raw)) || PROMPT_RE.test(blob)) return 'prompt-injection';
  if (hint === 'github-mcp' || MCP_RE.test(blob) || /modelcontextprotocol|\bmcp\b/i.test(packages)) return 'mcp-skill';
  if (hint === 'github-malware' || (raw && raw.type === 'malware')) return 'malware-pkg';
  if (/\b(campaign|espionage|intrusion)\b/i.test(blob)) return 'campaign';
  return 'malware-pkg';
}

export function inferBundledCategory(entry) {
  const record = entry || {};
  const name = `${record.name || ''} ${record.blurb || ''}`;
  const blob = `${record.id || ''} ${name} ${record.detail || ''}`;
  if (/threat report|espionage|impersonat|\bpsa\b|rogue agent swarm/i.test(name)) return 'campaign';
  if (/\bnpm\b|\bworm\b/i.test(name)) return 'malware-pkg';
  if (/prompt injection|\binjection\b|\bmorse\b/i.test(blob)) return 'prompt-injection';
  if (/\bmcp\b|skill\.md|\bskills?\b/i.test(blob)) return 'mcp-skill';
  if (/\bnpm\b|\bworm\b|\bpackage\b/i.test(blob)) return 'malware-pkg';
  return 'campaign';
}

function makeAlert(fields) {
  const category = CATEGORY_RANK[fields.category] ? fields.category : 'campaign';
  const url = safeHttpsUrl(fields.url);
  const iocs = [];
  for (const ioc of fields.iocs || []) {
    const clean = cleanIoc(ioc);
    if (clean && !iocs.includes(clean)) iocs.push(clean);
    if (iocs.length >= 12) break;
  }
  return {
    id: sanitizeText(fields.id, 80),
    title: sanitizeText(fields.title, 180),
    category,
    severity: mapSeverity(fields.severity, fields.title),
    published: toIso(fields.published),
    source: url,
    sourceName: sanitizeText(fields.sourceName, 80),
    url,
    iocs,
    detail: sanitizeText(fields.detail, 480),
    check: sanitizeText(fields.check || CHECKS[category], 320),
    fromBundled: Boolean(fields.fromBundled),
  };
}

export function normalizeGithubAdvisory(raw, hint) {
  if (!raw || typeof raw !== 'object') return null;
  const ghsa = String(raw.ghsa_id || '').trim();
  const cve = String(raw.cve_id || '').trim();
  const id = ghsa || cve;
  if (!id) return null;
  const title = raw.summary || raw.description || id;
  const category = categorizeAdvisory(raw, hint);
  return makeAlert({
    id,
    title,
    category,
    severity: raw.severity,
    published: raw.published_at || raw.published || raw.updated_at,
    url: raw.html_url,
    sourceName: 'GitHub Advisory DB',
    iocs: packageNames(raw),
    detail: raw.description || raw.summary || '',
    check: CHECKS[category],
  });
}

export function normalizeGithubPayload(payload, hint) {
  const list = Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.advisories) ? payload.advisories : []);
  return list.map((item) => normalizeGithubAdvisory(item, hint)).filter(Boolean);
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function textOf(block, tag) {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

export function parseAtomEntries(xml) {
  const entries = [];
  const re = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = re.exec(String(xml || '')))) {
    const block = match[1];
    const href = block.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i);
    const linkText = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
    entries.push({
      title: textOf(block, 'title'),
      updated: textOf(block, 'updated') || textOf(block, 'published'),
      link: href ? decodeXml(href[1]) : (linkText ? decodeXml(linkText[1]).trim() : ''),
      summary: textOf(block, 'summary') || textOf(block, 'content'),
    });
  }
  return entries;
}

export function socketRelevant(title, summary) {
  const blob = `${title || ''} ${summary || ''}`;
  if (/\b(agents?|mcp|npm|worms?|claude|cursor|skills?|prompts?|llm|openai|anthropic|malware)\b/i.test(blob)) return true;
  return /\bAI\b/.test(blob);
}

export function categorizeSocket(title, summary) {
  const blob = `${title || ''} ${summary || ''}`;
  if (PROMPT_RE.test(blob)) return 'prompt-injection';
  if (MCP_RE.test(blob)) return 'mcp-skill';
  return 'campaign';
}

export function normalizeSocketEntry(entry) {
  if (!entry || !socketRelevant(entry.title, entry.summary)) return null;
  const title = entry.title || 'Socket report';
  const category = categorizeSocket(entry.title, entry.summary);
  const link = safeHttpsUrl(entry.link);
  const id = 'socket-' + (link || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return makeAlert({
    id,
    title,
    category,
    severity: mapSeverity('', title),
    published: entry.updated,
    url: link,
    sourceName: 'Socket.dev',
    iocs: [],
    detail: entry.summary || title,
    check: CHECKS[category],
  });
}

export function normalizeOsvVuln(vuln) {
  if (!vuln || typeof vuln !== 'object') return null;
  const id = String(vuln.id || '').trim();
  const summary = String(vuln.summary || vuln.details || '');
  if (!id.startsWith('MAL-') && !/malware/i.test(summary)) return null;
  const names = [];
  for (const affected of vuln.affected || []) {
    const name = affected && affected.package && affected.package.name;
    const clean = cleanIoc(name);
    if (clean && isPackageName(clean) && !names.includes(clean)) names.push(clean);
  }
  return makeAlert({
    id: id || names[0] || '',
    title: summary || id,
    category: 'malware-pkg',
    severity: (vuln.database_specific && vuln.database_specific.severity) || 'unknown',
    published: vuln.published || vuln.modified,
    url: id ? `https://osv.dev/vulnerability/${encodeURIComponent(id)}` : '',
    sourceName: 'OSV.dev',
    iocs: names,
    detail: vuln.details || summary,
    check: CHECKS['malware-pkg'],
  });
}

export function alertsFromBundled(feed) {
  const entries = feed && Array.isArray(feed.entries) ? feed.entries : [];
  return entries.map((entry) => {
    const category = inferBundledCategory(entry);
    return makeAlert({
      id: entry.id || entry.name,
      title: entry.name || entry.title || 'Agent incident',
      category,
      severity: 'unknown',
      published: entry.date,
      url: entry.source,
      sourceName: 'Bundled agent incidents',
      iocs: Array.isArray(entry.iocs) ? entry.iocs : [],
      detail: entry.detail || entry.blurb || '',
      check: entry.check || CHECKS[category],
      fromBundled: true,
    });
  }).filter((alert) => alert.id);
}

function byDateDesc(a, b) {
  const delta = Date.parse(b.published || 0) - Date.parse(a.published || 0);
  if (delta) return delta;
  return String(a.title).localeCompare(String(b.title));
}

function keysOf(alert) {
  const keys = new Set();
  if (alert.id) keys.add('id:' + String(alert.id).toLowerCase());
  const blob = `${alert.id || ''} ${alert.title || ''} ${alert.detail || ''}`;
  const ghsa = blob.match(GHSA_RE);
  if (ghsa) keys.add('ghsa:' + ghsa[0].toUpperCase());
  const cve = blob.match(CVE_RE);
  if (cve) keys.add('cve:' + cve[0].toUpperCase());
  if (!alert.fromBundled) {
    for (const ioc of alert.iocs || []) {
      if (isPackageName(ioc)) keys.add('pkg:' + ioc.toLowerCase());
    }
  }
  return [...keys];
}

function mergePair(a, b) {
  const severity = SEVERITY_RANK[a.severity] >= SEVERITY_RANK[b.severity] ? a.severity : b.severity;
  const category = (CATEGORY_RANK[a.category] || 0) >= (CATEGORY_RANK[b.category] || 0) ? a.category : b.category;
  const aTime = Date.parse(a.published || 0);
  const bTime = Date.parse(b.published || 0);
  const newer = aTime >= bTime ? a : b;
  const iocs = [];
  for (const ioc of [...(a.iocs || []), ...(b.iocs || [])]) {
    if (ioc && !iocs.includes(ioc)) iocs.push(ioc);
  }
  const detail = (a.detail || '').length >= (b.detail || '').length ? a.detail : b.detail;
  return {
    ...newer,
    severity,
    category,
    published: newer.published,
    iocs,
    detail,
    check: CHECKS[category] || newer.check,
    url: a.url || b.url,
    source: a.url || b.url || a.source || b.source,
    sourceName: newer.sourceName,
    fromBundled: Boolean(a.fromBundled && b.fromBundled),
  };
}

export function dedupeAlerts(alerts) {
  const groups = [];
  const index = new Map();
  for (const alert of alerts || []) {
    if (!alert || !alert.id) continue;
    const keys = keysOf(alert);
    let group = null;
    for (const key of keys) {
      if (index.has(key)) {
        group = index.get(key);
        break;
      }
    }
    if (!group) {
      group = { alert: { ...alert, iocs: [...(alert.iocs || [])] } };
      groups.push(group);
    } else {
      group.alert = mergePair(group.alert, alert);
    }
    const mergedKeys = keysOf(group.alert);
    for (const key of mergedKeys) index.set(key, group);
  }
  return groups.map((group) => group.alert);
}

function stripInternal(alert) {
  return {
    id: alert.id,
    title: alert.title,
    category: alert.category,
    severity: alert.severity,
    published: alert.published,
    source: alert.source,
    sourceName: alert.sourceName,
    url: alert.url,
    iocs: alert.iocs || [],
    detail: alert.detail,
    check: alert.check,
    fromBundled: Boolean(alert.fromBundled),
  };
}

export function capAlerts(alerts, cap = MAX_ALERTS) {
  const bundled = [];
  const live = [];
  for (const alert of alerts || []) {
    if (alert.fromBundled) bundled.push(alert);
    else live.push(alert);
  }
  live.sort(byDateDesc);
  bundled.sort(byDateDesc);
  const room = Math.max(0, cap - bundled.length);
  return [...live.slice(0, room), ...bundled].sort(byDateDesc).map(stripInternal);
}

function updatedStamp(alerts, now) {
  let max = 0;
  for (const alert of alerts) {
    const parsed = Date.parse(alert.published || '');
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return new Date(max || now).toISOString().slice(0, 10);
}

function publicAlert(alert) {
  return {
    id: alert.id,
    title: alert.title,
    category: alert.category,
    severity: alert.severity,
    published: alert.published,
    source: alert.source,
    sourceName: alert.sourceName,
    url: alert.url,
    iocs: alert.iocs || [],
    detail: alert.detail,
    check: alert.check,
  };
}

function fitEnvelope(envelope) {
  let alerts = envelope.alerts.map((alert) => ({ ...alert }));
  const pack = () => JSON.stringify({ ...envelope, alerts: alerts.map(publicAlert) });
  const shrink = () => {
    alerts = alerts.map((alert) => ({
      ...alert,
      detail: String(alert.detail || '').slice(0, 160),
      check: String(alert.check || '').slice(0, 160),
    }));
  };
  if (pack().length > MAX_BODY_BYTES) shrink();
  while (pack().length > MAX_BODY_BYTES && alerts.length > 1) {
    let drop = -1;
    for (let i = alerts.length - 1; i >= 0; i--) {
      if (!alerts[i].fromBundled) {
        drop = i;
        break;
      }
    }
    alerts.splice(drop < 0 ? alerts.length - 1 : drop, 1);
  }
  return { ...envelope, alerts: alerts.map(publicAlert) };
}

export function buildEnvelope({ parts, bundledFeed, now, status }) {
  const bundledAlerts = alertsFromBundled(bundledFeed);
  const live = (parts || []).flatMap((part) => part.alerts || []);
  const capped = capAlerts(dedupeAlerts([...live, ...bundledAlerts]));
  const sources = (parts || []).map((part) => {
    const row = {
      name: part.source.name,
      ok: Boolean(part.ok),
      count: part.ok ? (part.alerts || []).length : 0,
    };
    if (!part.ok) row.error = sanitizeText(part.error || 'failed', 80);
    return row;
  });
  if (bundledAlerts.length) sources.push({ name: 'Bundled agent incidents', ok: true, count: bundledAlerts.length });
  else sources.push({ name: 'Bundled agent incidents', ok: false, count: 0, error: 'missing' });
  const fetchedAt = new Date(now).toISOString();
  return fitEnvelope({
    updated: updatedStamp(capped, now),
    fetchedAt,
    status,
    sources,
    alerts: capped,
  });
}

function errorLabel(err) {
  if (!err) return 'fetch failed';
  const name = err.name || '';
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout';
  const message = String(err.message || 'fetch failed');
  if (/aborted|abort|timeout/i.test(message)) return 'timeout';
  return sanitizeText(message, 80) || 'fetch failed';
}

function upstreamHeaders(kind) {
  const headers = {
    Accept: kind === 'socket-atom'
      ? 'application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1'
      : 'application/vnd.github+json, application/json',
  };
  if (typeof document === 'undefined') headers['User-Agent'] = USER_AGENT;
  return headers;
}

export async function fetchUpstream(url, options = {}) {
  const fetchImpl = options.fetchImpl;
  const timeoutMs = options.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) ctrl.abort();
    else options.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  try {
    const init = {
      method: options.method || 'GET',
      headers: options.headers || upstreamHeaders(options.kind),
      signal: ctrl.signal,
    };
    if (options.body != null) init.body = options.body;
    if (options.cfCache !== false) init.cf = { cacheTtl: 600 };
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch (err) {
      if (init.cf && /cf\b|init|option/i.test(String(err && err.message))) {
        delete init.cf;
        response = await fetchImpl(url, init);
      } else {
        throw err;
      }
    }
    if (!response || !response.ok) {
      return { ok: false, error: 'HTTP ' + ((response && response.status) || 0) };
    }
    const text = await response.text();
    if (text.length > 1_500_000) return { ok: false, error: 'too large' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: errorLabel(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function gatherSources(sources, fetchImpl) {
  return Promise.all((sources || []).map(async (source) => {
    const result = await fetchUpstream(source.url, { fetchImpl, kind: source.kind });
    if (!result.ok) return { source, ok: false, error: result.error, alerts: [] };
    try {
      if (source.kind === 'socket-atom') {
        const alerts = parseAtomEntries(result.text).map(normalizeSocketEntry).filter(Boolean);
        return { source, ok: true, alerts };
      }
      const alerts = normalizeGithubPayload(JSON.parse(result.text), source.kind);
      return { source, ok: true, alerts };
    } catch {
      return { source, ok: false, error: 'parse', alerts: [] };
    }
  }));
}

export async function queryOsvPackage(name, fetchImpl) {
  let pkg = String(name || '').trim();
  pkg = pkg.replace(/\[\.\]/g, '.').replace(/^hxxps?:\/\//i, 'https://');
  if (/^https?:\/\//i.test(pkg)) return [];
  pkg = pkg.replace(/\/.*$/, '');
  if (!isPackageName(pkg)) return [];
  const result = await fetchUpstream('https://api.osv.dev/v1/query', {
    fetchImpl,
    method: 'POST',
    kind: 'osv',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(typeof document === 'undefined' ? { 'User-Agent': USER_AGENT } : {}),
    },
    body: JSON.stringify({ package: { name: pkg, ecosystem: 'npm' } }),
  });
  if (!result.ok) throw new Error(result.error || 'fetch failed');
  const data = JSON.parse(result.text);
  return (data.vulns || []).map(normalizeOsvVuln).filter(Boolean).slice(0, 5);
}

function cacheRequest(request) {
  const url = new URL(request.url);
  url.pathname = '/api/swarm-feed';
  url.search = '';
  url.hash = '';
  return new Request(url.toString(), { method: 'GET' });
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
      ...SEC_HEADERS,
    },
  });
}

async function readCached(request, cache, now, state) {
  const memoEnv = state.memo && state.memo.envelope;
  if (memoEnv && Array.isArray(memoEnv.alerts)) {
    const age = now - Date.parse(memoEnv.fetchedAt || '');
    if (Number.isFinite(age) && age >= 0 && age < FRESH_MS + SWR_MS) return { envelope: memoEnv, age };
  }
  if (!cache || typeof cache.match !== 'function') return null;
  try {
    const hit = await cache.match(cacheRequest(request));
    if (!hit) return null;
    const envelope = await hit.json();
    if (!envelope || !Array.isArray(envelope.alerts)) return null;
    const age = now - Date.parse(envelope.fetchedAt || '');
    if (!Number.isFinite(age) || age < 0 || age >= FRESH_MS + SWR_MS) return null;
    state.memo = { envelope };
    return { envelope, age };
  } catch {
    return null;
  }
}

async function storeCached(request, cache, envelope, state) {
  state.memo = { envelope };
  if (!cache || typeof cache.put !== 'function') return;
  try {
    await cache.put(cacheRequest(request), jsonResponse(envelope));
  } catch {
    /* Cache API is a no-op on workers.dev and optional in tests. */
  }
}

function cloneEnvelope(envelope) {
  return JSON.parse(JSON.stringify(envelope));
}

async function attachOsv(envelope, packageName, fetchImpl) {
  const sources = envelope.sources.slice();
  try {
    const extra = await queryOsvPackage(packageName, fetchImpl);
    sources.push({ name: 'OSV.dev', ok: true, count: extra.length });
    if (!extra.length) return { ...envelope, sources };
    const alerts = capAlerts(dedupeAlerts([...extra, ...envelope.alerts])).map((alert) => {
      const next = { ...alert };
      delete next.fromBundled;
      return next;
    });
    return { ...envelope, sources, alerts };
  } catch (err) {
    sources.push({ name: 'OSV.dev', ok: false, count: 0, error: errorLabel(err) });
    return { ...envelope, sources };
  }
}

export async function handleSwarmFeed(request, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch.bind(globalThis);
  const now = clock(deps.now);
  const cache = deps.cache === undefined ? null : deps.cache;
  const bundledFeed = deps.bundled || null;
  const state = slotOf(deps);
  const packageName = new URL(request.url).searchParams.get('package') || '';
  const hit = await readCached(request, cache, now, state);

  let envelope;
  let store = false;
  if (hit && hit.age < FRESH_MS) {
    envelope = cloneEnvelope(hit.envelope);
    envelope.status = 'cached';
  } else {
    const parts = await gatherSources(FEED_SOURCES, fetchImpl);
    const allFail = parts.every((part) => !part.ok);
    if (allFail) {
      if (hit) {
        envelope = cloneEnvelope(hit.envelope);
        envelope.status = 'stale';
      } else {
        envelope = buildEnvelope({ parts, bundledFeed, now, status: 'bundled' });
      }
    } else {
      envelope = buildEnvelope({ parts, bundledFeed, now, status: 'live' });
      store = true;
    }
  }

  if (store) await storeCached(request, cache, envelope, state);
  if (packageName.trim()) envelope = await attachOsv(envelope, packageName, fetchImpl);
  return jsonResponse(envelope);
}
