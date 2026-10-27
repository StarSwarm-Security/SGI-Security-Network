import { runSwarm, SPECIALISTS } from './js/analyzers.js';
import { REF_DATA, SCENARIOS, CS_DATA } from './js/study.js';
import { mountHive, NODES, THREATS } from './js/hive.js';
import { loadWarMap, drawWarMap } from './js/liq.js';
import { loadThreatIndex } from './js/threat-index.js';
import { mountQHM } from './js/qhm/panel.js';
import { mountSwarmPass } from './js/swarm-pass.js';
import { mountBounty } from './js/bounty.js';
import { mountRedeem } from './js/redeem.js';
import { mountSpotlight } from './js/spotlight.js';
import { mountCastle, WINGS } from './js/castle.js';
import { scanPaste, samplePaste } from './js/paste-guard.js';

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

let qhmCtl = null, hiveCtl = null, threatData = null, liqSym = 'BTC', liqReady = false, swarmCtl = null, bountyCtl = null, redeemCtl = null, castleCtl = null;
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
  if (id === 'qhm') {
    if (!qhmCtl) qhmCtl = mountQHM($('qhm-root'));
    refreshLiq();
  }
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
  if (id === 'liq') refreshLiq();
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
  if (id === 'analyze') {
    const wantPg = (location.hash || '').includes('pasteguard') || analyzeMode === 'pasteguard';
    setAnalyzeMode(wantPg ? 'pasteguard' : 'cisco');
  }
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

/* Analyze modes: Cisco | Paste Guard */
let analyzeMode = 'cisco';
function setAnalyzeMode(mode) {
  analyzeMode = mode;
  document.querySelectorAll('#analyze-modes [data-mode]').forEach(c => c.classList.toggle('on', c.dataset.mode === mode));
  const cisco = $('cisco-desk');
  const pg = $('pg-desk');
  if (cisco) cisco.hidden = mode !== 'cisco';
  if (pg) pg.hidden = mode !== 'pasteguard';
}
document.querySelectorAll('#analyze-modes [data-mode]').forEach(c => {
  c.onclick = () => setAnalyzeMode(c.dataset.mode);
});

function paintPg(res) {
  const out = $('pg-out');
  if (!out) return;
  const v = res.verdict;
  const label = v === 'dangerous' ? 'Dangerous' : v === 'suspicious' ? 'Suspicious' : 'Safe';
  let html = `<div class="pg-verdict ${v}"><span class="pg-pill">${label}</span><p>${res.note}</p></div>`;
  if (!res.hits.length && v === 'safe') {
    html += `<div class="find ok"><span class="sev">clear</span><strong> No Paste Guard rule hits.</strong><p class="fine">Still treat unexpected links with care.</p></div>`;
  }
  for (const h of res.hits) {
    html += `<div class="find ${h.sev === 'dangerous' ? 'high' : ''}"><span class="sev">${h.sev}</span> <strong>${h.title}</strong>` +
      `<p class="fine">${h.id}</p><p>${h.why}</p>` +
      (h.fix ? `<p><b>Do:</b> ${h.fix}</p>` : '') + `</div>`;
  }
  out.innerHTML = html;
}

$('run-pg').onclick = () => paintPg(scanPaste($('pg-paste').value));
['pg-sample-safe','pg-sample-sus','pg-sample-bad'].forEach(id => {
  const el = $(id); if (!el) return;
  el.onclick = () => {
    $('pg-paste').value = samplePaste(el.dataset.pg);
    paintPg(scanPaste($('pg-paste').value));
  };
});

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
  if (tiFilter.q) { const q = tiFilter.q.toLowerCase(); items = items.filter(i => (i.title + i.blurb + i.detail + i.key).toLowerCase().includes(q)); }
  const letters = [...new Set(threatData.items.map(i => i.letter))].sort();
  $('ti-az').innerHTML = `<button class="${!tiFilter.letter ? 'on' : ''}" data-l="">All</button>` + letters.map(l => `<button class="${tiFilter.letter === l ? 'on' : ''}" data-l="${l}">${l}</button>`).join('');
  $('ti-az').onclick = e => { const b = e.target.closest('button'); if (!b) return; tiFilter.letter = b.dataset.l || null; paintThreats(); };
  $('ti-list').innerHTML = items.slice(0, 200).map((i, idx) =>
    `<button class="ti-item" data-idx="${threatData.items.indexOf(i)}"><span class="tag ${i.type}">${i.type}</span><span><b>${i.title}</b><br><span class="fine">${i.blurb}</span></span></button>`
  ).join('') || '<p class="fine">No matches.</p>';
}
async function initThreats() {
  threatData = await loadThreatIndex();
  $('ti-meta').textContent = `Threats ${threatData.meta.threats || '?'} · Bots ${threatData.meta.bots || '?'} · Wallets ${threatData.meta.scams || '?'} · IP via Analyze`;
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
  $('ti-body').innerHTML = `<h3>${i.title}</h3><p class="fine">${i.type} · ${i.meta || ''}</p><p style="margin-top:8px">${i.detail}</p>` +
    (i.fix ? `<p style="margin-top:8px"><b>Fix:</b> ${i.fix}</p>` : '') +
    (i.source ? `<p class="fine" style="margin-top:8px"><a href="${i.source}" target="_blank" rel="noopener" style="color:#9fd4ff">Source</a></p>` : '');
};
$('ti-close').onclick = () => { $('ti-drawer').hidden = true; };

/* Liquidation */
async function refreshLiq() {
  const data = await loadWarMap(liqSym);
  const badge = $('liq-badge');
  badge.textContent = data.liveLiq ? 'Live clusters' : 'SAMPLE';
  badge.className = 'badge ' + (data.liveLiq ? 'live' : 'sample');
  $('liq-note').textContent = data.note;
  $('liq-stats').innerHTML =
    `<div><span>${liqSym} mark</span><b>${data.price != null ? '$' + data.price.toLocaleString(undefined,{maximumFractionDigits:0}) : '–'}</b></div>` +
    `<div><span>24h</span><b class="${(data.chg||0)>=0?'up':'down'}">${data.chg==null?'–':(data.chg>=0?'+':'')+data.chg.toFixed(2)+'%'}</b></div>` +
    `<div><span>Levels</span><b>${data.clusters.length}</b></div>` +
    `<div><span>Price feed</span><b>${data.livePrice?'CoinGecko':'n/a'}</b></div>`;
  drawWarMap($('liq-canvas'), data);
}
document.querySelectorAll('[data-sym]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-sym]').forEach(x => x.classList.toggle('on', x === b));
  liqSym = b.dataset.sym; refreshLiq();
});
addEventListener('resize', () => { if (!$('tab-qhm').hidden) refreshLiq(); });

/* Honest Shield (VPN + Protect) */
function paintShield() {
  if (!$('vpn-cards') || $('vpn-cards').dataset.ready) return;
  $('vpn-cards').innerHTML = [
    { name: 'Proton VPN Free', note: 'Unlimited data, no ads, 1 device, no-logs. Swiss. Free forever tier funded by paid users.', aff: 'Affiliate: Proton Partners (signup at proton.me/partners). Free tier itself has no ads.', url: 'https://protonvpn.com/free-vpn', cta: 'Get free Proton VPN' },
    { name: 'Windscribe Free', note: '10 GB/month after email confirm (2 GB without). Built-in R.O.B.E.R.T. ad/tracker blocker. Honest marketing.', aff: 'Affiliate: Windscribe direct (~25% recurring on Pro). Free tier stays free.', url: 'https://windscribe.com/', cta: 'Get Windscribe Free' },
    { name: 'Cloudflare WARP / 1.1.1.1', note: 'Free consumer VPN-like tunnel from Cloudflare. No classic affiliate program. Good zero-cost option.', aff: 'No affiliate program we found. Link only.', url: 'https://one.one.one.one/', cta: 'Get 1.1.1.1' },
  ].map(v => `<article class="cardx"><h3>${v.name}</h3><p>${v.note}</p><p class="fine">${v.aff}</p><a href="${v.url}" target="_blank" rel="noopener">${v.cta}</a></article>`).join('');
  $('protect-cards').innerHTML = [
    { name: 'VirusTotal', note: 'Paste a URL or upload a file for multi-engine scans. Free web UI. API keys are rate-limited.', aff: 'No consumer affiliate. Embed: link out or VT widget if you apply for API access.', url: 'https://www.virustotal.com/gui/home/url', cta: 'Check a URL' },
    { name: 'Malwarebytes Free', note: 'On-demand malware / adware scanner. Free tier is real; Premium is the upsell.', aff: 'Affiliate via Impact (Malwarebytes partners). Wire your Impact ID before monetizing.', url: 'https://www.malwarebytes.com/mwb-download', cta: 'Download free' },
    { name: 'URLhaus + Defender tips', note: 'URLhaus: free malware URL database lookups. Windows Defender: keep Real-time protection on, run Offline scan after a scare.', aff: 'URLhaus is free (abuse.ch). Defender is built into Windows. No affiliate.', url: 'https://urlhaus.abuse.ch/', cta: 'Open URLhaus' },
  ].map(v => `<article class="cardx"><h3>${v.name}</h3><p>${v.note}</p><p class="fine">${v.aff}</p><a href="${v.url}" target="_blank" rel="noopener">${v.cta}</a></article>`).join('');
  $('vpn-cards').dataset.ready = '1';
}
paintShield();


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

mountSpotlight();

$('wing-back').onclick = () => closeWing();
$('wing-close').onclick = () => closeWing();
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!moreMenu?.hidden) { setMoreOpen(false); return; }
  if (!wingOverlay().hidden) closeWing();
});

window.addEventListener('sgi:goto', e => { if (e.detail && panels[e.detail]) show(e.detail); });

let start = (location.hash || '').replace(/^#/, '');
if (start === 'vpn' || start === 'protect') start = 'shield';
if (start === 'pasteguard' || start === 'paste-guard') {
  analyzeMode = 'pasteguard';
  start = 'analyze';
}
show(panels[start] ? start : 'home');
