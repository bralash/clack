-- Players. There are no accounts: a device proves who it is with a recovery code,
-- and only a SHA-256 hash of that code is stored.
CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  name        TEXT UNIQUE COLLATE NOCASE,      -- NULL once a long-inactive name is released
  code_hash   TEXT UNIQUE NOT NULL,
  created     INTEGER NOT NULL,
  renamed     INTEGER,                         -- last name change (NULL = never changed)
  last_seen   INTEGER NOT NULL,
  banned      INTEGER NOT NULL DEFAULT 0,
  blob        TEXT,                            -- synced stats, clacks and store items (JSON)
  blob_ver    INTEGER NOT NULL DEFAULT 0
);

-- One row per verified run. board: daily | time30 | time60. dev: k (keyboard) | t (touch).
-- day: the daily number for the daily board; the UTC day number for time boards.
CREATE TABLE scores (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board     TEXT NOT NULL,
  dev       TEXT NOT NULL,
  day       INTEGER NOT NULL,
  wpm       INTEGER NOT NULL,
  acc       INTEGER NOT NULL,
  created   INTEGER NOT NULL,
  removed   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX scores_board ON scores (board, dev, day, wpm DESC);
CREATE INDEX scores_user ON scores (user_id);
CREATE UNIQUE INDEX scores_daily_once ON scores (user_id, day) WHERE board = 'daily';

-- Hourly request counters for rate limiting (k is e.g. "reg:<ip>" or "score:<user id>").
CREATE TABLE rate (
  k     TEXT NOT NULL,
  hour  INTEGER NOT NULL,
  n     INTEGER NOT NULL,
  PRIMARY KEY (k, hour)
);
