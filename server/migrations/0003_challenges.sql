-- Clack Off: challenge links. A challenge is a set of 30s / 60s words (by seed) that friends race on
-- for 24 hours, each against the creator's ghost. Runs keep their keystrokes so they can be replayed.
CREATE TABLE challenges (
  id          TEXT PRIMARY KEY,                  -- short link code, e.g. "k7q2mx"
  creator_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board       TEXT NOT NULL,                     -- time30 | time60
  seed        INTEGER NOT NULL,
  taunt       INTEGER NOT NULL DEFAULT 0,        -- index into the page's preset taunts
  created     INTEGER NOT NULL,
  closes      INTEGER NOT NULL,                  -- no new runs after this
  rematch_of  TEXT,
  removed     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX challenges_creator ON challenges (creator_id);

CREATE TABLE challenge_runs (
  id            INTEGER PRIMARY KEY,
  challenge_id  TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dev           TEXT NOT NULL,
  wpm           INTEGER NOT NULL,
  acc           INTEGER NOT NULL,
  keys          TEXT NOT NULL,
  gaps          TEXT NOT NULL,                   -- JSON array
  created       INTEGER NOT NULL
);
CREATE UNIQUE INDEX challenge_runs_once ON challenge_runs (challenge_id, user_id);
CREATE INDEX challenge_runs_user ON challenge_runs (user_id);
