-- Dedicated observability database only. Never run against the API's application DB.
CREATE TABLE IF NOT EXISTS obs_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO obs_state (key,value) VALUES ('cron_slot','0') ON CONFLICT(key) DO NOTHING;
INSERT INTO obs_state (key,value) VALUES ('collection_started_at','') ON CONFLICT(key) DO NOTHING;
CREATE TABLE IF NOT EXISTS obs_probes (
  route TEXT PRIMARY KEY,
  next_due INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  history TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS obs_due ON obs_probes(next_due);
CREATE TABLE IF NOT EXISTS obs_snapshot (
  id INTEGER PRIMARY KEY CHECK(id=1),
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
