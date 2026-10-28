/**
 * Public frontend config for the abyss gate.
 *
 * GOOGLE_CLIENT_SECRET, Apple private keys, and any other credential must never
 * be committed. A Google Identity Services client id is a public identifier,
 * not a secret — still leave `googleClientId` empty until one is issued.
 *
 * Resolution order in js/auth-client.js:
 *   1. GET /v1/auth/providers → googleClientId | google_client_id | clientId | google.clientId
 *   2. window.SGI_GOOGLE_CLIENT_ID (optional inline override; leave unset)
 *   3. googleClientId below
 */
export const AUTH_CONFIG = {
  apiBase: 'https://sgi-api.starswarm.workers.dev',
  /** @type {string} Placeholder. Empty on purpose. */
  googleClientId: '',
};
