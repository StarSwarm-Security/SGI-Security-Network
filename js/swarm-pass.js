/** Swarm Pass Phase 0 — local badges, streaks, credits. No install-only rewards. */
const KEY = 'sgi.swarmPass.v1';

const BADGES = [
  { id: 'scout', name: 'Scout', need: 0, blurb: 'Opened SGI' },
  { id: 'sentinel', name: 'Sentinel', need: 100, blurb: '100 Swarm Credits' },
  { id: 'swarm-lead', name: 'Swarm Lead', need: 500, blurb: '500 Swarm Credits' },
  { id: 'tour', name: 'Tour Complete', need: 'tour', blurb: 'Finished first-run tour' },
  { id: 'streak7', name: '7-Day Keep', need: 'streak7', blurb: 'Opened on 7 distinct days' },
  { id: 'streak30', name: '30-Day Keep', need: 'streak30', blurb: 'Opened on 30 distinct days' },
];

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return {
    credits: 0,
    badges: [],
    days: [],
    tourDone: false,
    lastCheckIn: null,
    created: Date.now(),
  };
}

function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
}

function ensureScout(s) {
  if (!s.badges.includes('scout')) {
    s.badges.push('scout');
    s.credits += 10; // first open presence, not install-pay
  }
}

function recordOpenDay(s) {
  const t = today();
  if (!s.days.includes(t)) {
    s.days.push(t);
    if (s.days.length > 120) s.days = s.days.slice(-120);
  }
  if (s.days.length >= 7 && !s.badges.includes('streak7')) {
    s.badges.push('streak7');
    s.credits += 25;
  }
  if (s.days.length >= 30 && !s.badges.includes('streak30')) {
    s.badges.push('streak30');
    s.credits += 100;
  }
}

function streakCount(s) {
  // consecutive calendar days ending today or yesterday
  const set = new Set(s.days);
  let n = 0;
  const d = new Date();
  for (let i = 0; i < 120; i++) {
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (set.has(key)) { n++; d.setDate(d.getDate() - 1); }
    else if (i === 0) { d.setDate(d.getDate() - 1); continue; } // allow missing today
    else break;
  }
  return n;
}

export function getPass() {
  const s = load();
  ensureScout(s);
  recordOpenDay(s);
  save(s);
  return s;
}

export function dailyCheckIn() {
  const s = load();
  ensureScout(s);
  recordOpenDay(s);
  const t = today();
  if (s.lastCheckIn === t) {
    save(s);
    return { ok: false, reason: 'already', state: s };
  }
  s.lastCheckIn = t;
  s.credits += 5;
  save(s);
  return { ok: true, gained: 5, state: s };
}

export function completeTour() {
  const s = load();
  ensureScout(s);
  if (s.tourDone) return { ok: false, reason: 'done', state: s };
  s.tourDone = true;
  if (!s.badges.includes('tour')) s.badges.push('tour');
  s.credits += 50;
  save(s);
  return { ok: true, gained: 50, state: s };
}

export function creditBalance() {
  return getPass().credits;
}

export function mountSwarmPass(root) {
  const paint = () => {
    const s = getPass();
    // unlock credit-threshold badges
    for (const b of BADGES) {
      if (typeof b.need === 'number' && b.need > 0 && s.credits >= b.need && !s.badges.includes(b.id)) {
        s.badges.push(b.id);
      }
    }
    save(s);
    const streak = streakCount(s);
    const badgeHtml = BADGES.map(b => {
      const on = s.badges.includes(b.id);
      return `<div class="sp-badge ${on ? 'on' : ''}" title="${b.blurb}"><b>${b.name}</b><span>${on ? 'Earned' : 'Locked'} · ${b.blurb}</span></div>`;
    }).join('');
    root.innerHTML = `
      <div class="row-head">
        <h2>Swarm Pass</h2>
        <span class="badge live" id="sp-credits">${s.credits} SC</span>
      </div>
      <p class="lede">Local badges and Swarm Credits for real use — tour, daily check-in, keep streaks. <b>No credits for install alone</b> or store reviews.</p>
      <div class="sp-stats">
        <div><span>Credits</span><b id="sp-c">${s.credits}</b></div>
        <div><span>Streak</span><b id="sp-s">${streak}d</b></div>
        <div><span>Open days</span><b>${s.days.length}</b></div>
        <div><span>Badges</span><b>${s.badges.length}</b></div>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="cta" id="sp-checkin" type="button">Daily Guard check-in (+5)</button>
        <button class="chip" id="sp-tour" type="button"${s.tourDone ? ' disabled' : ''}>${s.tourDone ? 'Tour done' : 'Finish tour (+50)'}</button>
        <button class="chip" data-go="redeem" type="button">Redeem credits</button>
        <button class="chip" data-go="bounty" type="button">Bounty board</button>
      </div>
      <p class="fine" id="sp-msg"></p>
      <h3 class="sp-sub">Badges</h3>
      <div class="sp-badges">${badgeHtml}</div>
      <div class="sp-legal">
        <h3 class="sp-sub">Reward Terms (Phase 0)</h3>
        <ul class="sp-terms">
          <li>Swarm Credits (SC) are non-cash, non-transferable status points stored only in this browser (localStorage). Not money, not crypto, not a security.</li>
          <li>Earn by finishing the tour, daily Guard check-in (1×/day), and keep-open streaks. <b>Install-only and rating/review actions earn 0 SC.</b></li>
          <li>Gift-card / crypto redeem (XMR, SOL, ETH, BTC) is Coming soon and needs a licensed partner + Terms. May require KYC. No real redemptions on this build.</li>
          <li>Leaderboards show sample handles only. No email, IP, or wallet collected for Pass.</li>
        </ul>
      </div>`;
    const msg = root.querySelector('#sp-msg');
    root.querySelector('#sp-checkin').onclick = () => {
      const r = dailyCheckIn();
      msg.textContent = r.ok ? `+${r.gained} SC · streak logged` : 'Already checked in today. Come back tomorrow.';
      paint();
    };
    const tourBtn = root.querySelector('#sp-tour');
    if (tourBtn && !s.tourDone) {
      tourBtn.onclick = () => {
        completeTour();
        msg.textContent = '+50 SC · Tour Complete badge unlocked';
        paint();
      };
    }
    root.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => {
        const ev = new CustomEvent('sgi:goto', { detail: b.dataset.go });
        window.dispatchEvent(ev);
      };
    });
  };
  paint();
  return { refresh: paint, getPass };
}
