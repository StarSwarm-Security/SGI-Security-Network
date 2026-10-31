// Browser live swarm-alert panel. Falls back GitHub → bundled incidents.
import {
  GITHUB_SOURCES,
  buildEnvelope,
  gatherSources,
  queryOsvPackage,
  safeHttpsUrl,
  sanitizeText,
} from '../edge/swarm-feed.js';

export {
  queryOsvPackage as lookupOsvPackage,
  safeHttpsUrl,
  sanitizeText,
};

export const REFRESH_MS = 5 * 60 * 1000;
export const SNAPSHOT_KEY = 'sgi.swarm-feed.v1';
export const SNAPSHOT_MAX = 200 * 1024;

export const CATEGORY_LABELS = {
  'malware-pkg': 'npm worm/malware',
  'mcp-skill': 'MCP/skill',
  'prompt-injection': 'prompt injection',
  campaign: 'AI campaign',
};

const CATS = [
  ['all', 'All'],
  ['malware-pkg', 'Malware pkgs'],
  ['mcp-skill', 'MCP & skills'],
  ['prompt-injection', 'Prompt injection'],
  ['campaign', 'Campaigns'],
];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export function defangIoc(value) {
  const text = String(value || '');
  if (!text || text.includes('[.]')) return text;
  return text.replace(/\./g, '[.]');
}

export function statusLabel(status) {
  if (status === 'live') return 'Live';
  if (status === 'cached' || status === 'stale') return 'Cached';
  return 'Offline: bundled feed';
}

export function formatWhen(iso, now = Date.now()) {
  const parsed = Date.parse(iso || '');
  if (!Number.isFinite(parsed)) return 'unknown time';
  const sec = Math.max(0, Math.round((now - parsed) / 1000));
  let relative = 'just now';
  if (sec >= 45 && sec < 3600) relative = Math.round(sec / 60) + 'm ago';
  else if (sec >= 3600 && sec < 86400) relative = Math.round(sec / 3600) + 'h ago';
  else if (sec >= 86400) relative = Math.round(sec / 86400) + 'd ago';
  const absolute = new Date(parsed).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  return relative + ' · ' + absolute;
}

export function formatStamp(fetchedAt, nextAt, now = Date.now()) {
  const when = new Date(fetchedAt || now);
  const hh = String(when.getHours()).padStart(2, '0');
  const mm = String(when.getMinutes()).padStart(2, '0');
  const secs = Math.max(0, Math.ceil(((nextAt || now) - now) / 1000));
  return `Last updated ${hh}:${mm} · next refresh in ${secs}s`;
}

/** 'pause' while the document or the panel is hidden; 'now' when the interval elapsed. */
export function refreshPlan(hidden, active, now, nextAt) {
  if (hidden || !active) return 'pause';
  if (now >= nextAt) return 'now';
  return 'wait';
}

export function filterAlerts(alerts, { category = 'all', severity = 'all', q = '' } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  return (alerts || []).filter((alert) => {
    if (!alert) return false;
    if (category && category !== 'all' && alert.category !== category) return false;
    if (severity && severity !== 'all' && alert.severity !== severity) return false;
    if (!needle) return true;
    const hay = [
      alert.title, alert.detail, alert.check, alert.sourceName,
      alert.category, alert.severity, alert.id, ...(alert.iocs || []),
    ].join(' ').toLowerCase();
    return hay.includes(needle);
  });
}

export function agentItemsFromAlerts(alerts) {
  return (alerts || []).filter((alert) => (
    alert && alert.category === 'malware-pkg' && Array.isArray(alert.iocs) && alert.iocs.length
  )).map((alert) => ({
    type: 'agent',
    title: alert.title,
    key: alert.id,
    blurb: alert.detail || '',
    detail: alert.detail || '',
    fix: alert.check || '',
    source: alert.url || alert.source || '',
    meta: alert.published || '',
    iocs: alert.iocs,
  }));
}

export function encodeSnapshot(envelope, maxBytes = SNAPSHOT_MAX) {
  if (!envelope || !Array.isArray(envelope.alerts)) return '';
  let alerts = envelope.alerts.slice();
  let raw = JSON.stringify({ ...envelope, alerts });
  while (raw.length > maxBytes && alerts.length) {
    alerts = alerts.slice(0, -1);
    raw = JSON.stringify({ ...envelope, alerts });
  }
  if (!alerts.length || raw.length > maxBytes) return '';
  return raw;
}

export function renderAlertHtml(alert, now = Date.now()) {
  const label = CATEGORY_LABELS[alert.category] || alert.category || 'alert';
  const sev = alert.severity || 'unknown';
  const sevClass = sev === 'critical' ? 'critical' : (sev === 'high' ? 'high' : '');
  const href = safeHttpsUrl(alert.url || alert.source);
  const link = href ? `<a href="${esc(href)}" target="_blank" rel="noopener">Source</a>` : '';
  return `<article class="ti-item find ${sevClass}">` +
    `<button type="button" class="sf-open" data-sf-open="${esc(alert.id)}">` +
    `<span class="sev">${esc(sev)}</span>` +
    `<span class="sf-copy"><span class="tag agent">${esc(label)}</span>` +
    `<b>${esc(alert.title)}</b>` +
    `<span class="fine">${esc(formatWhen(alert.published, now))} · ${esc(alert.sourceName || '')}</span></span>` +
    `</button>${link}</article>`;
}

function storageGet(storage) {
  try {
    return (storage || localStorage).getItem(SNAPSHOT_KEY);
  } catch {
    return null;
  }
}

function storageSet(storage, raw) {
  try {
    (storage || localStorage).setItem(SNAPSHOT_KEY, raw);
  } catch { /* private mode */ }
}

export function readSnapshot(storage) {
  const raw = storageGet(storage);
  if (!raw || raw.length > SNAPSHOT_MAX) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.alerts) || !data.alerts.length) return null;
    return data;
  } catch {
    return null;
  }
}

function saveSnapshot(envelope, storage) {
  if (!envelope || envelope.status === 'bundled') return;
  const raw = encodeSnapshot(envelope);
  if (raw) storageSet(storage, raw);
}

async function loadBundledFile(fetchImpl) {
  try {
    const url = new URL('../data/agent-threats.json', import.meta.url);
    const res = await fetchImpl(url);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function bundledEnvelope(bundled, now) {
  return buildEnvelope({
    parts: GITHUB_SOURCES.map((source) => ({ source, ok: false, error: 'unavailable', alerts: [] })),
    bundledFeed: bundled,
    now,
    status: 'bundled',
  });
}

export async function loadSwarmFeed(deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch.bind(globalThis);
  const now = typeof deps.now === 'function' ? deps.now() : (typeof deps.now === 'number' ? deps.now : Date.now());
  const bundled = deps.bundled || await loadBundledFile(fetchImpl);
  try {
    const res = await fetchImpl('/api/swarm-feed', { headers: { Accept: 'application/json' } });
    if (res && res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.alerts) && data.alerts.length) return data;
    }
  } catch { /* try GitHub, which sends Access-Control-Allow-Origin: * */ }
  try {
    const parts = await gatherSources(GITHUB_SOURCES, fetchImpl);
    if (parts.some((part) => part.ok && part.alerts.length)) {
      return buildEnvelope({ parts, bundledFeed: bundled, now, status: 'live' });
    }
  } catch { /* bundled file is the last resort */ }
  return bundledEnvelope(bundled, now);
}

export function mountSwarmFeed(root, options = {}) {
  if (!root) return null;
  const refreshMs = options.refreshMs || REFRESH_MS;
  const storage = options.storage;
  let alerts = [];
  let envelope = null;
  let category = 'all';
  let severity = 'all';
  let active = true;
  let disposed = false;
  let nextAt = Date.now() + refreshMs;
  let timer = 0;
  let stampTimer = 0;

  root.innerHTML = `
    <div class="row-head">
      <strong class="sf-title">Live swarm alerts</strong>
      <span class="sev sf-pill" data-sf="status"></span>
    </div>
    <p class="fine" data-sf="stamp"></p>
    <div class="type-filters" data-sf="cats">
      ${CATS.map(([id, label], i) => `<button type="button" class="chip${i === 0 ? ' on' : ''}" data-cat="${id}" title="${label}">${label}</button>`).join('')}
    </div>
    <label class="lbl" for="sf-sev">Severity
      <select id="sf-sev">
        <option value="all">All severities</option>
        <option value="critical">critical</option>
        <option value="high">high</option>
        <option value="medium">medium</option>
        <option value="low">low</option>
        <option value="unknown">unknown</option>
      </select>
    </label>
    <div class="ti-list" data-sf="list"></div>`;

  const statusEl = root.querySelector('[data-sf="status"]');
  const stampEl = root.querySelector('[data-sf="stamp"]');
  const listEl = root.querySelector('[data-sf="list"]');
  const sevEl = root.querySelector('#sf-sev');

  function queryText() {
    if (options.getQuery) return options.getQuery() || '';
    return '';
  }

  function renderStamp() {
    if (!stampEl) return;
    stampEl.textContent = envelope
      ? formatStamp(envelope.fetchedAt, nextAt, Date.now())
      : 'Last updated — · next refresh in —';
  }

  function render() {
    const now = Date.now();
    const shown = filterAlerts(alerts, { category, severity, q: queryText() });
    if (statusEl) statusEl.textContent = envelope ? statusLabel(envelope.status) : '';
    renderStamp();
    if (!listEl) return;
    if (!envelope) {
      listEl.innerHTML = '<p class="fine">Loading live swarm alerts…</p>';
      return;
    }
    listEl.innerHTML = shown.length
      ? shown.map((alert) => renderAlertHtml(alert, now)).join('')
      : '<p class="fine">No alerts match these filters.</p>';
  }

  function clearTimers() {
    clearTimeout(timer);
    clearInterval(stampTimer);
    timer = 0;
    stampTimer = 0;
  }

  function hiddenNow() {
    return typeof document !== 'undefined' && document.hidden;
  }

  function arm() {
    clearTimers();
    const plan = refreshPlan(hiddenNow() || root.hidden, active, Date.now(), nextAt);
    if (plan === 'pause') return;
    stampTimer = setInterval(renderStamp, 1000);
    const delay = plan === 'now' ? 0 : Math.max(0, nextAt - Date.now());
    timer = setTimeout(() => { refresh(); }, delay);
  }

  async function refresh() {
    if (disposed) return;
    let data;
    try {
      data = await loadSwarmFeed(options);
    } catch {
      data = null;
    }
    if (disposed) return;
    if (data && Array.isArray(data.alerts)) {
      envelope = data;
      alerts = data.alerts;
      saveSnapshot(data, storage);
      if (options.onAlerts) options.onAlerts(alerts);
    }
    nextAt = Date.now() + refreshMs;
    render();
    arm();
  }

  root.addEventListener('click', (event) => {
    const cat = event.target.closest('[data-cat]');
    if (cat && root.contains(cat)) {
      category = cat.getAttribute('data-cat') || 'all';
      root.querySelectorAll('[data-cat]').forEach((el) => el.classList.toggle('on', el === cat));
      render();
      return;
    }
    if (event.target.closest('a')) return;
    const open = event.target.closest('[data-sf-open]');
    if (!open || !options.onOpen) return;
    const id = open.getAttribute('data-sf-open');
    const alert = alerts.find((item) => item.id === id);
    if (alert) options.onOpen(alert);
  });
  if (sevEl) {
    sevEl.addEventListener('change', () => {
      severity = sevEl.value || 'all';
      render();
    });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      const plan = refreshPlan(document.hidden || root.hidden, active, Date.now(), nextAt);
      if (plan === 'pause') {
        clearTimers();
        return;
      }
      if (plan === 'now') refresh();
      else arm();
    });
  }

  const snap = readSnapshot(storage);
  if (snap) {
    envelope = { ...snap, status: snap.status === 'bundled' ? 'bundled' : 'cached' };
    alerts = snap.alerts;
    if (options.onAlerts) options.onAlerts(alerts);
  }
  render();
  refresh();

  return {
    setQuery() { render(); },
    setActive(on) {
      active = Boolean(on);
      if (!active) clearTimers();
      else {
        const plan = refreshPlan(hiddenNow() || root.hidden, true, Date.now(), nextAt);
        if (plan === 'now') refresh();
        else arm();
      }
    },
    refresh,
  };
}
