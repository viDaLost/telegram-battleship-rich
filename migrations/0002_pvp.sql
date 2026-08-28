CREATE TABLE IF NOT EXISTS pvp_matches (
  code TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pvp_members (
  user_id INTEGER PRIMARY KEY,
  match_code TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pvp_matches_updated_at ON pvp_matches(updated_at);
CREATE INDEX IF NOT EXISTS idx_pvp_members_match_code ON pvp_members(match_code);
