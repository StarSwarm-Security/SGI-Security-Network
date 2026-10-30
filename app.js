import { runSwarm, SPECIALISTS } from './js/analyzers.js';
import { REF_DATA, SCENARIOS, CS_DATA } from './js/study.js';
import { mountHive, NODES, THREATS } from './js/hive.js';
import { loadThreatIndex, matchAgentIocs } from './js/threat-index.js';
import { mountSwarmPass } from './js/swarm-pass.js';
import { mountBounty } from './js/bounty.js';
import { mountRedeem } from './js/redeem.js';
import { mountSpotlight } from './js/spotlight.js';
import { mountCastle, WINGS } from './js/castle.js';
import { scanPaste, samplePaste } from './js/paste-guard.js';
import { scanAgent, sampleAgent } from './js/agent-guard.js';
import { scanConfig, sampleConfig, toolListFingerprint } from './js/agent-audit.js';

const $ = id => document.getElementById(id);
const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
const panels = Object.fromEntries([...document.querySelectorAll('[role="tabpanel"]')].map(el => [el.id.replace('tab-', ''), el]));
const moreBtn = $('more-btn');
const moreMenu = $('more-menu');

function setMoreOpen(open) {
  if (!moreBtn || !moreMenu) return;
  moreMenu.hidden = !open;
  moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function syncTabChrome(activeId) {
  tabs.forEach(t => {
    const on = t.dataset.tab === activeId;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (moreBtn) moreBtn.classList.toggle('open-section', activeId && activeId !== 'home');
}

let hiveCtl = null, threatData = null, swarmCtl = null, bountyCtl = null, redeemCtl = null, castleCtl = null;
const wingOverlay = () => $('wing-overlay');
const wingBody = () => $('wing-body');
const mainEl = () => document.querySelector('main');
const WING_TITLE = Object.fromEntries(WINGS.map(w => [w.id, `${w.name} · ${w.sub}`]));
WING_TITLE.home = 'Home';

function parkPanel(el) {
  if (el && el.parentElement === wingBody()) mainEl().appendChild(el);
}

function ensureCastle() {
  if (!castleCtl && $('castle-root')) {
    castleCtl = mountCastle($('castle-root'), { onWing: (wid) => openWing(wid) });
  }
  return castleCtl;
}

function openWing(id) {
  ensureCastle();
  if (panels.home) panels.home.hidden = false;
  // return any panel already in overlay
  [...wingBody().children].forEach(parkPanel);
  const panel = panels[id];
  if (!panel) return;
  wingBody().appendChild(panel);
  panel.hidden = false;
  for (const [k, el] of Object.entries(panels)) {
    if (k !== id && k !== 'home') el.hidden = true;
  }
  // keep home visible under overlay as castle backdrop
  if (panels.home) panels.home.hidden = false;
  wingOverlay().hidden = false;
  document.body.classList.add('wing-open');
  $('wing-title').textContent = WING_TITLE[id] || id;
  syncTabChrome(id);
  setMoreOpen(false);
  history.replaceState(null, '', '#' + id);
  if (castleCtl) castleCtl.highlight(id);
  bootPanel(id);
}

function closeWing() {
  [...wingBody().children].forEach(parkPanel);
  wingOverlay().hidden = true;
  document.body.classList.remove('wing-open');
  if (castleCtl) castleCtl.highlight(null);
  show('home');
}


function bootPanel(id) {
  if (id === 'hive' && !hiveCtl) {
    hiveCtl = mountHive($('hive-svg'), { onNode: n => {
      const d = $('hive-detail'); d.hidden = false;
      const p = n.p || {};
      d.innerHTML = `<button class="x" id="hive-x">×</button><h3>${n.label || n.id}</h3><p class="fine">${p.type || n.kind || ''}</p><p>${p.what || n.sub || ''}</p>` +
        (p.watches ? `<h4 style="margin-top:8px;font-family:Sora,sans-serif;font-size:12px;color:var(--cyan)">Watches</h4><p>${p.watches}</p>` : '') +
        (p.ccna ? `<h4 style="margin-top:8px;font-family:Sora,sans-serif;font-size:12px;color:var(--cyan)">CCNA</h4><p>${p.ccna}</p>` : '') +
        (p.defense ? `<h4 style="margin-top:8px;font-family:Sora,sans-serif;font-size:12px;color:var(--cyan)">Defense</h4><p>${p.defense}</p>` : '') +
        `<p class="fine" style="margin-top:10px;color:var(--r)">Simulated training map. Not a live SOC.</p>`;
      d.querySelector('#hive-x').onclick = () => { d.hidden = true; };
    }});
  }
  if (id === 'threats' && !threatData) initThreats();
  if (id === 'swarm') {
    if (!swarmCtl) swarmCtl = mountSwarmPass($('swarm-root'));
    else swarmCtl.refresh();
  }
  if (id === 'bounty') {
    if (!bountyCtl) bountyCtl = mountBounty($('bounty-root'));
    else bountyCtl.refresh();
  }
  if (id === 'redeem') {
    if (!redeemCtl) redeemCtl = mountRedeem($('redeem-root'));
    else redeemCtl.refresh();
  }
  if (id === 'shield') paintShield();
  if (id === 'analyze') setAnalyzeMode(analyzeMode);
}

function show(id) {
  if (id !== 'home' && panels[id]) {
    openWing(id);
    return;
  }
  // home / castle
  [...wingBody().children].forEach(parkPanel);
  wingOverlay().hidden = true;
  document.body.classList.remove('wing-open');
  for (const [k, el] of Object.entries(panels)) el.hidden = k !== 'home';
  syncTabChrome('home');
  setMoreOpen(false);
  history.replaceState(null, '', '#');
  ensureCastle();
  if (castleCtl) castleCtl.highlight(null);
}


tabs.forEach(t => t.addEventListener('click', () => { setMoreOpen(false); show(t.dataset.tab); }));
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.go)));

if (moreBtn && moreMenu) {
  moreBtn.addEventListener('click', e => {
    e.stopPropagation();
    setMoreOpen(moreMenu.hidden);
  });
  document.addEventListener('click', e => {
    if (!moreMenu.hidden && !e.target.closest('.more-wrap')) setMoreOpen(false);
  });
}

/* Analyze */
const SAMPLE = `Router# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     203.0.113.2     YES NVRAM  up                    up
GigabitEthernet0/1     10.10.10.1      YES NVRAM  up                    up
Vlan1                  192.168.1.1     YES NVRAM  up                    up
Router# show running-config | include enable|line vty|password|username
enable password cisco
username admin privilege 15 password 0 admin
line vty 0 4
 login
 transport input telnet
`;
$('sample-paste').onclick = () => { $('paste').value = SAMPLE; };
$('run-analyze').onclick = () => {
  const text = $('paste').value.trim();
  const out = $('analyze-out');
  if (!text) { out.innerHTML = '<p class="fine">Paste something first.</p>'; return; }
  const res = runSwarm(text, { deviceType: $('device').value });
  const findings = (res.reports || []).flatMap(r => (r.findings || []).map(f => ({ ...f, specialist: r.name })));
  const summary = res.summary || {};
  let html = `<p class="lede"><b>${findings.length}</b> findings · ${SPECIALISTS.length} specialists offline` +
    (summary.headline ? ` · ${summary.headline}` : '') + `</p>`;
  if (!findings.length) html += '<div class="find ok"><span class="sev">clear</span><strong> No rule hits on this paste.</strong><p class="fine">Try the sample or a fuller show run.</p></div>';
  for (const f of findings.slice(0, 40)) {
    const sev = (f.severity || f.level || f.sev || 'info').toString().toLowerCase();
    html += `<div class="find ${sev}"><span class="sev">${sev}</span> <strong>${f.title || f.name || f.id || 'Finding'}</strong>` +
      `<p class="fine">${f.specialist || ''} · ${f.confidence != null ? 'confidence ' + f.confidence : ''}</p>` +
      `<p>${f.detail || f.why || f.message || f.summary || ''}</p>` +
      (f.fix || f.remediation ? `<p><b>Fix:</b> ${f.fix || f.remediation}</p>` : '') + `</div>`;
  }
  out.innerHTML = html;
};

/* Analyze modes: Cisco | Paste Guard | Agent Guard | Config Auditor */
const ANALYZE_MODES = ['cisco', 'pasteguard', 'agentguard', 'configaudit'];
let analyzeMode = 'cisco';
function setAnalyzeMode(mode) {
  analyzeMode = ANALYZE_MODES.includes(mode) ? mode : 'cisco';
  document.querySelectorAll('#analyze-modes [data-mode]').forEach(c => c.classList.toggle('on', c.dataset.mode === analyzeMode));
  const desks = { cisco: 'cisco-desk', pasteguard: 'pg-desk', agentguard: 'ag-desk', configaudit: 'ca-desk' };
  for (const [name, id] of Object.entries(desks)) {
    const el = $(id);
    if (el) el.hidden = analyzeMode !== name;
  }
}
document.querySelectorAll('#analyze-modes [data-mode]').forEach(c => {
  c.onclick = () => setAnalyzeMode(c.dataset.mode);
});

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function paintScan(out, res, kind) {
  if (!out || !res) return;
  const v = res.verdict;
  const label = v === 'dangerous' ? 'Dangerous' : v === 'suspicious' ? 'Suspicious' : 'Safe';
  let html = `<div class="pg-verdict ${esc(v)}"><span class="pg-pill">${label}</span><p>${esc(res.note)}</p></div>`;
  if (!res.hits.length && v === 'safe') {
    html += `<div class="find ok"><span class="sev">clear</span><strong> No ${esc(kind)} rule hits.</strong><p class="fine">Still treat unexpected content with care.</p></div>`;
  }
  for (const h of res.hits) {
    html += `<div class="find ${h.sev === 'dangerous' ? 'high' : ''}"><span class="sev">${esc(h.sev)}</span> <strong>${esc(h.title)}</strong>` +
      `<p class="fine">${esc(h.id)}</p><p>${esc(h.why)}</p>` +
      (h.fix ? `<p><b>Do:</b> ${esc(h.fix)}</p>` : '') + `</div>`;
  }
  for (const d of res.decoded || []) {
    html += `<div class="find"><span class="sev">decoded</span> <strong>${esc(d.kind)} preview</strong><pre>${esc(d.preview)}</pre></div>`;
  }
  if (res.cleaned && res.invisibleCount) {
    const cleaned = res.cleaned.length > 4000 ? `${res.cleaned.slice(0, 4000)}…` : res.cleaned;
    html += `<div class="find"><span class="sev">cleaned</span> <strong>Invisible characters made visible</strong><pre>${esc(cleaned)}</pre></div>`;
  }
  out.innerHTML = html;
}

function paintPg(res) {
  paintScan($('pg-out'), res, 'Paste Guard');
}

$('run-pg').onclick = () => paintPg(scanPaste($('pg-paste').value));
['pg-sample-safe','pg-sample-sus','pg-sample-bad'].forEach(id => {
  const el = $(id); if (!el) return;
  el.onclick = () => {
    $('pg-paste').value = samplePaste(el.dataset.pg);
    paintPg(scanPaste($('pg-paste').value));
  };
});

function runAgentGuard() {
  paintScan($('ag-out'), scanAgent($('ag-paste').value), 'Agent Guard');
}
$('run-ag').onclick = () => runAgentGuard();
['ag-sample-safe', 'ag-sample-bad'].forEach(id => {
  const el = $(id); if (!el) return;
  el.onclick = () => {
    $('ag-paste').value = sampleAgent(el.dataset.ag);
    runAgentGuard();
  };
});

function runConfigAudit() {
  paintScan($('ca-out'), scanConfig($('ca-paste').value, { type: $('ca-type').value }), 'Config Auditor');
}
$('run-ca').onclick = () => runConfigAudit();
['ca-sample-claude', 'ca-sample-npm'].forEach(id => {
  const el = $(id); if (!el) return;
  el.onclick = () => {
    $('ca-paste').value = sampleConfig(el.dataset.ca);
    if ($('ca-type')) $('ca-type').value = 'auto';
    runConfigAudit();
  };
});

const FP_KEY = 'sgi.mcp.fingerprint.v1';
function readFingerprints() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FP_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
function writeFingerprints(store) {
  try { localStorage.setItem(FP_KEY, JSON.stringify(store)); } catch { /* private mode */ }
}
function paintFingerprint(mode) {
  const out = $('ca-fp-out');
  if (!out) return;
  const name = ($('ca-server').value || '').trim();
  if (!name) {
    out.innerHTML = '<p class="fine">Name the MCP server first. The hash is stored under that name.</p>';
    return;
  }
  const fp = toolListFingerprint($('ca-tools').value);
  if (!fp.ok) {
    out.innerHTML = `<p class="fine">${esc(fp.error)}</p>`;
    return;
  }
  const store = readFingerprints();
  const prev = store[name];
  if (!prev || mode === 'replace') {
    store[name] = { hash: fp.hash, count: fp.count, at: new Date().toISOString() };
    writeFingerprints(store);
    out.innerHTML = `<div class="pg-verdict safe"><span class="pg-pill">Safe</span><p>Baseline stored for ${esc(name)} · ${fp.count} tool${fp.count === 1 ? '' : 's'} · hash ${esc(fp.hash)}. Only the hash is saved in this browser.</p></div>`;
    return;
  }
  if (prev.hash === fp.hash) {
    out.innerHTML = `<div class="pg-verdict safe"><span class="pg-pill">Safe</span><p>Tool list for ${esc(name)} matches the baseline from ${esc(prev.at)} · ${fp.count} tools · hash ${esc(fp.hash)}.</p></div>`;
    return;
  }
  out.innerHTML = `<div class="pg-verdict dangerous"><span class="pg-pill">Dangerous</span><p>Tool list for ${esc(name)} changed since ${esc(prev.at)}. Names or descriptions differ. A poisoned MCP server can rewrite tool text after you trusted it.</p><p><b>Do:</b> Do not call the tools. Compare the descriptions yourself. The old baseline stays until you replace it.</p><button type="button" class="chip" id="ca-fp-replace">Replace baseline</button></div>`;
}
$('run-ca-fp').onclick = () => paintFingerprint();
$('ca-fp-out').onclick = (e) => {
  if (e.target && e.target.id === 'ca-fp-replace') paintFingerprint('replace');
};

/* Study drawer (merged into Analyze) */
const studyBody = $('study-body');
function renderStudy(kind) {
  document.querySelectorAll('#study-tabs .chip').forEach(c => c.classList.toggle('on', c.dataset.study === kind));
  if (kind === 'ref') {
    studyBody.innerHTML = REF_DATA.map(b => `<div class="find"><strong>${b.title}</strong><p class="fine">${b.sub || ''}</p><div style="margin-top:6px;font-size:12.5px;color:#cdd3f0;line-height:1.45">${b.body || ''}</div>${b.cmd ? `<pre style="margin-top:8px;font-size:11.5px;white-space:pre-wrap;color:#9fd4ff">${b.cmd}</pre>` : ''}</div>`).join('');
  } else if (kind === 'lists') {
    studyBody.innerHTML = SCENARIOS.map(s => `<div class="find"><strong>${s.title || s.name}</strong><p class="fine">${s.desc || ''}</p><ol style="margin:6px 0 0 18px;font-size:12.5px;color:#cdd3f0">${(s.steps || []).map(x => `<li><b>${x.title || ''}</b> ${x.desc || ''}${x.cmd ? `<pre style="margin-top:4px;font-size:11px;color:#9fd4ff">${x.cmd}</pre>` : ''}</li>`).join('')}</ol></div>`).join('');
  } else {
    studyBody.innerHTML = CS_DATA.map(c => `<div class="find"><strong>${(c.name || '').replace(/\\n/g,' ')}</strong><p class="fine">${c.count || ''}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;font-size:12px">${(c.items || []).map(i => `<div><span class="mute">${i.k}</span> <b>${i.v}</b></div>`).join('')}</div></div>`).join('');
  }
}
$('study-open').onclick = () => { $('study-drawer').hidden = false; renderStudy('ref'); };
$('study-close').onclick = () => { $('study-drawer').hidden = true; };
document.querySelectorAll('#study-tabs .chip').forEach(c => c.onclick = () => renderStudy(c.dataset.study));

/* Threat Index */
let tiFilter = { type: 'all', letter: null, q: '' };
function paintThreats() {
  if (!threatData) return;
  let items = threatData.items;
  if (tiFilter.type !== 'all') items = items.filter(i => i.type === tiFilter.type);
  if (tiFilter.letter) items = items.filter(i => i.letter === tiFilter.letter);
  if (tiFilter.q) {
    const q = tiFilter.q.toLowerCase();
    items = items.filter(i => (i.title + i.blurb + i.detail + i.key + (i.iocs || []).join(' ')).toLowerCase().includes(q));
  }
  const letters = [...new Set(threatData.items.map(i => i.letter))].sort();
  $('ti-az').innerHTML = `<button class="${!tiFilter.letter ? 'on' : ''}" data-l="">All</button>` + letters.map(l => `<button class="${tiFilter.letter === l ? 'on' : ''}" data-l="${l}">${l}</button>`).join('');
  $('ti-az').onclick = e => { const b = e.target.closest('button'); if (!b) return; tiFilter.letter = b.dataset.l || null; paintThreats(); };
  const iocBox = $('ti-ioc');
  if (iocBox) iocBox.hidden = tiFilter.type !== 'agent';
  $('ti-list').innerHTML = items.slice(0, 200).map((i) =>
    `<button class="ti-item" data-idx="${threatData.items.indexOf(i)}"><span class="tag ${esc(i.type)}">${esc(i.type)}</span><span><b>${esc(i.title)}</b><br><span class="fine">${esc(i.blurb)}</span></span></button>`
  ).join('') || '<p class="fine">No matches.</p>';
}
async function initThreats() {
  threatData = await loadThreatIndex();
  $('ti-meta').textContent = `Threats ${threatData.meta.threats || '?'} · Agents ${threatData.meta.agents || '?'} · Bots ${threatData.meta.bots || '?'} · Wallets ${threatData.meta.scams || '?'} · IP via Analyze`;
  paintThreats();
}
document.querySelectorAll('#ti-types .chip').forEach(c => c.onclick = () => {
  document.querySelectorAll('#ti-types .chip').forEach(x => x.classList.toggle('on', x === c));
  tiFilter.type = c.dataset.type; paintThreats();
});
$('ti-q').oninput = () => { tiFilter.q = $('ti-q').value; paintThreats(); };
$('ti-list').onclick = e => {
  const b = e.target.closest('.ti-item'); if (!b || !threatData) return;
  const i = threatData.items[+b.dataset.idx]; if (!i) return;
  $('ti-drawer').hidden = false;
  const step = i.type === 'agent' ? 'Check this' : 'Fix';
  const source = /^https?:\/\//i.test(i.source || '') ? i.source : '';
  const iocLine = i.type === 'agent' && i.iocs && i.iocs.length
    ? `<p style="margin-top:8px"><b>IOCs (defanged):</b> ${i.iocs.map(esc).join(' · ')}</p>`
    : '';
  $('ti-body').innerHTML = `<h3>${esc(i.title)}</h3><p class="fine">${esc(i.type)} · ${esc(i.meta || '')}</p><p style="margin-top:8px">${esc(i.detail)}</p>` +
    iocLine +
    (i.fix ? `<p style="margin-top:8px"><b>${step}:</b> ${esc(i.fix)}</p>` : '') +
    (source ? `<p class="fine" style="margin-top:8px"><a href="${esc(source)}" target="_blank" rel="noopener" style="color:#9fd4ff">Source</a></p>` : '');
};
function paintIocLookup() {
  const out = $('ti-ioc-out');
  if (!out) return;
  if (!threatData) {
    out.innerHTML = '<p class="fine">Threat index is still loading.</p>';
    return;
  }
  const query = ($('ti-ioc-q').value || '').trim();
  if (normalizeQueryTooShort(query)) {
    out.innerHTML = '<p class="fine">Paste a package name or domain (at least 4 characters).</p>';
    return;
  }
  const hits = matchAgentIocs(threatData.items, query);
  if (!hits.length) {
    out.innerHTML = '<div class="find ok"><span class="sev">clear</span><strong> Not on the agent IOC list.</strong><p class="fine">Absence is not a guarantee. Domains in the list are stored defanged, with [.]</p></div>';
    return;
  }
  out.innerHTML = hits.map((hit) =>
    `<div class="find high"><span class="sev">match</span> <strong>${esc(hit.title)}</strong>` +
    `<p class="fine">${esc((hit.iocs || []).join(' · '))}</p>` +
    (hit.fix ? `<p><b>Check this:</b> ${esc(hit.fix)}</p>` : '') +
    `</div>`
  ).join('');
}
function normalizeQueryTooShort(query) {
  return String(query || '').trim().length < 4;
}
$('ti-ioc-go').onclick = () => paintIocLookup();
$('ti-ioc-q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    paintIocLookup();
  }
});
$('ti-close').onclick = () => { $('ti-drawer').hidden = true; };

/* Honest Shield (VPN + Protect) */
function paintShield() {
  if (!$('vpn-cards') || $('vpn-cards').dataset.ready) return;
  $('vpn-cards').innerHTML = [
    { name: 'Proton VPN Free', note: 'Unlimited data, no ads, 1 device, no-logs. Swiss. Free forever tier funded by paid users.', url: 'https://protonvpn.com/free-vpn', cta: 'Get free Proton VPN' },
    { name: 'Windscribe Free', note: '10 GB/month after email confirm (2 GB without). Built-in R.O.B.E.R.T. ad/tracker blocker. Honest marketing.', url: 'https://windscribe.com/', cta: 'Get Windscribe Free' },
    { name: 'Cloudflare WARP / 1.1.1.1', note: 'Free consumer VPN-like tunnel from Cloudflare. Good zero-cost option.', url: 'https://one.one.one.one/', cta: 'Get 1.1.1.1' },
  ].map(v => `<article class="cardx"><h3>${v.name}</h3><p>${v.note}</p>${v.aff ? `<p class="fine">${v.aff}</p>` : ''}<a href="${v.url}" target="_blank" rel="noopener">${v.cta}</a></article>`).join('');
  $('protect-cards').innerHTML = [
    { name: 'VirusTotal', note: 'Paste a URL or upload a file for multi-engine scans. Free web UI. API keys are rate-limited.', url: 'https://www.virustotal.com/gui/home/url', cta: 'Check a URL' },
    { name: 'Malwarebytes Free', note: 'On-demand malware / adware scanner. Free tier is real; Premium is the upsell.', url: 'https://www.malwarebytes.com/mwb-download', cta: 'Download free' },
    { name: 'URLhaus + Defender tips', note: 'URLhaus: free malware URL database lookups. Windows Defender: keep Real-time protection on, run Offline scan after a scare.', aff: 'URLhaus is free (abuse.ch). Defender is built into Windows.', url: 'https://urlhaus.abuse.ch/', cta: 'Open URLhaus' },
  ].map(v => `<article class="cardx"><h3>${v.name}</h3><p>${v.note}</p>${v.aff ? `<p class="fine">${v.aff}</p>` : ''}<a href="${v.url}" target="_blank" rel="noopener">${v.cta}</a></article>`).join('');
  $('vpn-cards').dataset.ready = '1';
}
/* Pin opaque glass on click */
document.querySelectorAll('.pinable').forEach(p => {
  p.addEventListener('click', e => {
    if (e.target.closest('button,a,input,textarea,select,canvas,svg,.ti-item,.chip,.cta,.x,.drawer')) return;
    p.classList.toggle('pinned');
  });
});
document.querySelectorAll('.chip,.badge').forEach(el => {
  if (!el.title && el.textContent) el.title = el.textContent.trim();
});

$('wing-back').onclick = () => closeWing();
$('wing-close').onclick = () => closeWing();
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!moreMenu?.hidden) { setMoreOpen(false); return; }
  if (!wingOverlay().hidden) closeWing();
});

window.addEventListener('sgi:goto', e => { if (e.detail && panels[e.detail]) show(e.detail); });

let booted = false;
let spotLit = false;

/** Mount the shell. Called only after the abyss gate has an accepted session. */
export function bootSgi() {
  if (booted) return;
  booted = true;
  const shell = document.querySelector('.shell');
  if (shell) {
    shell.removeAttribute('inert');
    shell.removeAttribute('aria-hidden');
  }
  paintShield();
  let start = (location.hash || '').replace(/^#/, '');
  if (start === 'vpn' || start === 'protect') start = 'shield';
  if (start === 'pasteguard' || start === 'paste-guard') {
    analyzeMode = 'pasteguard';
    start = 'analyze';
  }
  if (start === 'agentguard' || start === 'agent-guard') {
    analyzeMode = 'agentguard';
    start = 'analyze';
  }
  if (start === 'configaudit' || start === 'config-auditor' || start === 'auditor') {
    analyzeMode = 'configaudit';
    start = 'analyze';
  }
  show(panels[start] ? start : 'home');
}

/** Dog spotlight stays off until the gate has dissolved. */
export function bootSpotlight() {
  if (spotLit) return;
  spotLit = true;
  mountSpotlight();
}
