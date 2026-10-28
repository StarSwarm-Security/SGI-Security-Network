-- StarSwarm SGI API skeleton.
-- No email, IP, payment-instrument, or wallet columns.
-- price_cents is a catalog placeholder, not a charge.
--
-- Plans (not live RevenueCat / App Store / Play ids):
--   free     permanent row, no expiry, no product id. Remains after the trial.
--   trial    sgi.trial.3d, $0, 3 days, Pro limits. Starts on first anonymous
--            device session (POST /v1/auth/device), then falls back to free.
--   monthly  sgi.monthly.999, $9.99 / month (999 cents), Pro limits.
--   yearly   sgi.yearly.special_3999, $39.99 / year (3999 cents), Pro limits.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('anonymous', 'apple', 'google')),
  provider_subject TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- SQLite treats NULL provider_subject values as distinct, so many anonymous users are allowed.
CREATE UNIQUE INDEX users_provider_subject ON users (auth_provider, provider_subject);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX devices_user_idx ON devices (user_id);

CREATE TABLE device_sessions (
  token_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  tier TEXT NOT NULL CHECK (tier IN ('free', 'trial', 'monthly', 'yearly')),
  product_id TEXT,
  price_cents INTEGER,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'revoked', 'grace')),
  source TEXT NOT NULL CHECK (source IN ('default', 'trial', 'revenuecat', 'promo')),
  expires_at TEXT,
  revenuecat_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX entitlements_user_idx ON entitlements (user_id, status);

CREATE TABLE revenuecat_events (
  id TEXT PRIMARY KEY,
  app_user_id TEXT,
  event_type TEXT NOT NULL,
  product_id TEXT,
  applied INTEGER NOT NULL CHECK (applied IN (0, 1)),
  reason TEXT,
  received_at TEXT NOT NULL
);

CREATE TABLE analyze_cache (
  content_hash TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE analyze_usage (
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (device_id, window_start)
);

CREATE TABLE swarm_pass_snapshots (
  device_id TEXT PRIMARY KEY REFERENCES devices (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  client_credits INTEGER NOT NULL CHECK (client_credits >= 0 AND client_credits <= 1000000),
  bonus_credits INTEGER NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0 AND bonus_credits <= 1000000),
  badges_json TEXT NOT NULL,
  days_json TEXT NOT NULL,
  tour_done INTEGER NOT NULL CHECK (tour_done IN (0, 1)),
  last_check_in TEXT,
  client_updated_at TEXT,
  server_updated_at TEXT NOT NULL
);

CREATE TABLE redeem_codes (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('promo', 'sc_grant', 'tier_trial')),
  sc_amount INTEGER CHECK (sc_amount IS NULL OR (sc_amount > 0 AND sc_amount <= 1000000)),
  tier TEXT CHECK (tier IS NULL OR tier IN ('monthly', 'yearly')),
  tier_days INTEGER CHECK (tier_days IS NULL OR (tier_days >= 1 AND tier_days <= 30)),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  expires_at TEXT,
  created_at TEXT NOT NULL,
  note TEXT,
  CHECK (
    (kind = 'tier_trial' AND tier IN ('monthly', 'yearly') AND tier_days IS NOT NULL)
    OR (kind = 'sc_grant' AND sc_amount IS NOT NULL)
    OR (kind = 'promo')
  )
);

CREATE TABLE redeem_redemptions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL REFERENCES redeem_codes (code),
  device_id TEXT NOT NULL REFERENCES devices (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  redeemed_at TEXT NOT NULL,
  grant_applied INTEGER NOT NULL CHECK (grant_applied IN (0, 1)),
  UNIQUE (code, device_id)
);

CREATE INDEX redeem_redemptions_code_idx ON redeem_redemptions (code);
