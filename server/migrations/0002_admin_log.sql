-- Every admin action, so there's a trail of who changed what (and when).
CREATE TABLE admin_log (
  id      INTEGER PRIMARY KEY,
  at      INTEGER NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT,
  detail  TEXT,
  ip      TEXT
);
CREATE INDEX admin_log_at ON admin_log (at DESC);
CREATE INDEX scores_created ON scores (created DESC);
