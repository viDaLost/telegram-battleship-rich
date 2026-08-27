CREATE TABLE IF NOT EXISTS games (
  user_id INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_games_updated_at ON games(updated_at);
