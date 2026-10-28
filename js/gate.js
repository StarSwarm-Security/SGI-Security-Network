/**
 * Black-abyss gate. The shell stays unmounted to sight and pointer until
 * GET /v1/me accepts a bearer session token or a credentialed session cookie.
 *
 * Google Identity Services renders first when a public client id is available.
 * Apple stays hidden. Anonymous entry is POST /v1/auth/device when providers
 * still offer it (or when the providers call cannot be read).
 */
import { bootSgi, bootSpotlight } from '../app.js';
import {
  api,
  readSession,
  writeSession,
  clearSession,
  isFresh,
  sessionFromBody,
  resolveClientId,
  anonymousOffered,
} from './auth-client.js';

const html = document.documentElement;
const gate = document.getElementById('abyss-gate');
const statusEl = document.getElementById('abyss-status');
const googleSlot = document.getElementById('abyss-google');
const googleFallback = document.getElementById('abyss-google-fallback');
const googleNote = document.getElementById('abyss-google-note');
const deviceBtn = document.getElementById('abyss-device');
const orEl = document.getElementById('abyss-or');

let opened = false;
let busy = false;
let stopDust = () => {};

function setStatus(text) {
  if (statusEl) statusEl.textContent = text || '';
}

function setState(state) {
  if (gate) gate.dataset.state = state;
}

function explainFailure(res) {
  if (!res || res.status === 0) return 'The network could not be reached. The keep stays shut.';
  const err = res.data && res.data.error;
  if (err === 'not_configured') return 'Google sign-in is not lit on the network yet. Continue with this device.';
  if (err === 'device_exists') return 'This device already has a seal, and the old one is not on this browser.';
  if (res.status === 401 || res.status === 403) return 'The network refused this session.';
  return 'The gate did not open.';
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

async function confirmMe(token) {
  const timed = withTimeout(12000);
  try {
    return await api('/v1/me', { token: token || undefined, signal: timed.signal });
  } finally {
    timed.done();
  }
}

async function acceptAuth(res, provider) {
  if (res.status === 501 || (res.data && res.data.error === 'not_configured')) {
    return { ok: false, message: explainFailure(res) };
  }
  if (!res.ok && res.status !== 204) return { ok: false, message: explainFailure(res) };

  const parsed = sessionFromBody(res.data, provider);
  if (parsed) {
    writeSession(parsed);
    const check = await confirmMe(parsed.sessionToken);
    if (!check.ok) {
      clearSession();
      const refused = check.status === 401 || check.status === 403;
      return {
        ok: false,
        message: refused ? 'The network did not accept that session.' : explainFailure(check),
      };
    }
    return { ok: true };
  }

  const cookieCheck = await confirmMe('');
  if (cookieCheck.ok) {
    const exp = cookieCheck.data && cookieCheck.data.expiresAt;
    writeSession({
      via: 'cookie',
      provider,
      sessionToken: '',
      expiresAt: typeof exp === 'string' ? exp : '',
    });
    return { ok: true };
  }
  return { ok: false, message: 'The network did not return a session.' };
}

function unlock() {
  if (opened) return;
  opened = true;
  setState('open');
  try { bootSgi(); } catch (err) { console.error(err); }
  html.classList.remove('sgi-locked', 'sgi-restoring');
  html.classList.add('sgi-open');
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  if (gate) {
    gate.setAttribute('aria-hidden', 'true');
    gate.style.pointerEvents = 'none';
  }
  stopDust();
  const main = document.querySelector('main');
  if (main) {
    if (!main.hasAttribute('tabindex')) main.tabIndex = -1;
    main.focus({ preventScroll: true });
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finish = () => {
    try { bootSpotlight(); } catch (err) { console.error(err); }
    gate?.remove();
    html.classList.remove('sgi-open');
  };
  if (reduce) finish();
  else window.setTimeout(finish, 980);
}

async function signInWithDevice() {
  if (busy || opened || !deviceBtn || deviceBtn.hidden) return;
  busy = true;
  deviceBtn.disabled = true;
  setStatus('Asking the gate…');
  const timed = withTimeout(12000);
  let res = await api('/v1/auth/device', { method: 'POST', body: {}, signal: timed.signal });
  if (res.status === 409 || (res.data && res.data.error === 'device_exists')) {
    clearSession();
    res = await api('/v1/auth/device', { method: 'POST', body: {}, signal: timed.signal });
  }
  timed.done();
  const result = await acceptAuth(res, 'device');
  busy = false;
  if (!opened) deviceBtn.disabled = false;
  if (result.ok) unlock();
  else setStatus(result.message);
}

async function signInWithGoogleCredential(credential) {
  if (busy || opened) return;
  if (!credential) {
    setStatus('Google did not return a credential.');
    return;
  }
  busy = true;
  setStatus('Checking the Google seal…');
  const timed = withTimeout(12000);
  const res = await api('/v1/auth/google', {
    method: 'POST',
    signal: timed.signal,
    body: { idToken: credential, credential, provider: 'google' },
  });
  timed.done();
  const result = await acceptAuth(res, 'google');
  busy = false;
  if (result.ok) unlock();
  else setStatus(result.message);
}

function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gis'));
    document.head.appendChild(script);
  });
}

async function mountGoogle(clientId) {
  if (!googleSlot || !googleFallback) return;
  try {
    await loadGis();
    if (opened || !window.google?.accounts?.id) throw new Error('gis');
    const hostWidth = googleFallback.parentElement ? googleFallback.parentElement.clientWidth : 320;
    const width = Math.max(240, Math.min(360, Math.floor(hostWidth - 4)));
    googleSlot.hidden = false;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (resp) => { signInWithGoogleCredential(resp && resp.credential); },
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
    });
    window.google.accounts.id.renderButton(googleSlot, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'signin_with',
      logo_alignment: 'left',
      width,
    });
    googleFallback.hidden = true;
    if (googleNote) googleNote.hidden = true;
  } catch {
    googleSlot.hidden = true;
    googleFallback.hidden = false;
    googleFallback.disabled = true;
    if (googleNote) {
      googleNote.hidden = false;
      googleNote.textContent = 'Google Sign-In could not be loaded. Continue with this device.';
    }
  }
}

function applyProviders(providers) {
  const clientId = resolveClientId(providers);
  const anon = anonymousOffered(providers);
  if (deviceBtn) deviceBtn.hidden = !anon;
  if (orEl) orEl.hidden = !anon;
  const fine = gate && gate.querySelector('.abyss-fine');
  if (fine) fine.hidden = !anon;

  if (clientId) {
    mountGoogle(clientId);
    return;
  }

  if (googleFallback) {
    googleFallback.hidden = false;
    googleFallback.disabled = true;
  }
  if (googleNote) {
    googleNote.hidden = false;
    const googleOn = providers && (providers.google === true || (providers.google && providers.google.enabled === true));
    googleNote.textContent = googleOn
      ? 'Google is enabled, but no public client id was published. Continue with this device.'
      : 'Google Sign-In lights when a public client id is published. No secret is kept in this page.';
  }
  if (!anon && !clientId) setStatus('No seal is open on the network right now.');
}

function focusEntry() {
  if (deviceBtn && !deviceBtn.hidden && !deviceBtn.disabled) deviceBtn.focus();
  else if (googleFallback && !googleFallback.hidden && !googleFallback.disabled) googleFallback.focus();
}

async function restoreOrShow() {
  const existing = readSession();
  if (existing && isFresh(existing)) {
    html.classList.add('sgi-restoring');
    setState('restoring');
    const check = await confirmMe(existing.sessionToken || '');
    if (check.ok) {
      unlock();
      return;
    }
    if (check.status === 401 || check.status === 403) clearSession();
    html.classList.remove('sgi-restoring');
    setStatus(check.status === 0
      ? 'The seal could not be read. The keep stays shut.'
      : 'That session has gone cold.');
  } else if (existing) {
    clearSession();
  } else {
    confirmMe('').then((check) => {
      if (check.ok && !opened) unlock();
    });
  }

  setState(opened ? 'open' : 'locked');
  if (opened) return;
  const listed = await api('/v1/auth/providers');
  applyProviders(listed.ok ? listed.data : null);
  if (!opened) focusEntry();
}

function bind() {
  deviceBtn?.addEventListener('click', () => { signInWithDevice(); });
  gate?.addEventListener('keydown', (event) => {
    if (opened) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== 'Tab' || !gate) return;
    const nodes = [...gate.querySelectorAll('button, a[href], iframe')].filter((el) => {
      if (el.hidden || el.disabled) return false;
      return el.getClientRects().length > 0;
    });
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function mountDust() {
  const canvas = document.getElementById('abyss-dust');
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  const motes = Array.from({ length: 42 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.3 + 0.25,
    s: Math.random() * 0.00022 + 0.00006,
    a: Math.random() * 0.28 + 0.04,
    drift: (Math.random() - 0.5) * 0.00015,
  }));
  let raf = 0;
  let running = true;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  };
  const frame = () => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const width = canvas.width;
    const height = canvas.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.clearRect(0, 0, width, height);
    for (const mote of motes) {
      mote.y -= mote.s;
      mote.x += mote.drift;
      if (mote.y < -0.03) {
        mote.y = 1.02;
        mote.x = Math.random();
      }
      const dx = (mote.x - 0.5) / 0.34;
      const dy = (mote.y - 0.46) / 0.42;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) continue;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 236, 214, ${mote.a * (1 - dist)})`;
      ctx.arc(mote.x * width, mote.y * height, mote.r * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
  stopDust = () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}

bind();
mountDust();
restoreOrShow();
