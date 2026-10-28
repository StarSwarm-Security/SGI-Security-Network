import { AUTH_CONFIG } from './auth-config.js';

/** Keep in sync with the inline restore check in index.html. */
export const SESSION_KEY = 'sgi.session.v1';

export function apiBase() {
  const override = typeof window !== 'undefined' ? window.SGI_API_BASE : '';
  return String(override || AUTH_CONFIG.apiBase || '').replace(/\/$/, '');
}

export async function api(path, { method = 'GET', body, token, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
      mode: 'cors',
      signal,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: null, error };
  }
}

export function usableClientId(id) {
  const value = String(id || '').trim();
  if (!value) return '';
  if (/placeholder|your_google|changeme|xxx+|todo|example|not.?a.?secret/i.test(value)) return '';
  if (value.length < 12) return '';
  return value;
}

export function clientIdFromProviders(providers) {
  const record = providers && typeof providers === 'object' ? providers : {};
  const google = record.google && typeof record.google === 'object' ? record.google : null;
  const candidates = [
    record.googleClientId,
    record.google_client_id,
    record.gisClientId,
    record.clientId,
    record.client_id,
    google && (google.clientId || google.client_id || google.gisClientId),
  ];
  for (const candidate of candidates) {
    const id = usableClientId(candidate);
    if (id) return id;
  }
  return '';
}

export function resolveClientId(providers) {
  const fromApi = clientIdFromProviders(providers);
  if (fromApi) return fromApi;
  const fromWindow = usableClientId(typeof window !== 'undefined' ? window.SGI_GOOGLE_CLIENT_ID : '');
  if (fromWindow) return fromWindow;
  return usableClientId(AUTH_CONFIG.googleClientId);
}

/** Device / anonymous entry. A failed providers lookup keeps the fallback available. */
export function anonymousOffered(providers) {
  if (!providers || typeof providers !== 'object') return true;
  return providers.anonymous !== false;
}

export function sessionFromBody(data, provider) {
  if (!data || typeof data !== 'object') return null;
  const token = data.sessionToken || data.token || data.accessToken || data.access_token;
  if (!token || typeof token !== 'string') return null;
  const expiresAt = data.expiresAt || data.expires_at || '';
  return {
    sessionToken: token,
    tokenType: data.tokenType || data.token_type || 'bearer',
    expiresAt: typeof expiresAt === 'string' ? expiresAt : '',
    deviceId: data.deviceId || data.device_id || '',
    userId: data.userId || data.user_id || '',
    provider: provider || data.provider || 'device',
    via: 'bearer',
  };
}

export function isFresh(session, now = Date.now()) {
  if (!session || typeof session !== 'object') return false;
  const hasSeal = session.via === 'cookie' || (typeof session.sessionToken === 'string' && session.sessionToken.length > 0);
  if (!hasSeal) return false;
  if (!session.expiresAt) return true;
  const expires = Date.parse(session.expiresAt);
  if (!Number.isFinite(expires)) return true;
  return expires > now;
}

export function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored && (stored.sessionToken || stored.via === 'cookie')) return stored;
    }
  } catch { /* private mode or blocked storage */ }
  try {
    const match = document.cookie.match(/(?:^|; )sgi_session=([^;]*)/);
    if (!match) return null;
    const stored = JSON.parse(decodeURIComponent(match[1]));
    if (stored && (stored.sessionToken || stored.via === 'cookie')) return stored;
  } catch { /* malformed cookie */ }
  return null;
}

export function writeSession(session) {
  const stored = {
    sessionToken: session.sessionToken || '',
    tokenType: session.tokenType || 'bearer',
    expiresAt: session.expiresAt || '',
    deviceId: session.deviceId || '',
    userId: session.userId || '',
    provider: session.provider || 'device',
    via: session.via || (session.sessionToken ? 'bearer' : 'cookie'),
  };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(stored)); } catch { /* ignore */ }
  try {
    let maxAge = 60 * 60 * 24 * 30;
    const expires = Date.parse(stored.expiresAt);
    if (Number.isFinite(expires)) maxAge = Math.max(60, Math.floor((expires - Date.now()) / 1000));
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    const payload = encodeURIComponent(JSON.stringify({
      sessionToken: stored.sessionToken,
      expiresAt: stored.expiresAt,
      deviceId: stored.deviceId,
      provider: stored.provider,
      via: stored.via,
    }));
    document.cookie = `sgi_session=${payload}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  } catch { /* ignore */ }
  return stored;
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  document.cookie = 'sgi_session=; Path=/; Max-Age=0; SameSite=Lax';
}
