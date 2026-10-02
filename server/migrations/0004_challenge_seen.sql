-- When each player last looked at a clack off's standings, so "new results" means runs by other
-- people since then, the same on every device. Empty until the first look: counts from your own run.
ALTER TABLE challenge_runs ADD COLUMN seen INTEGER;
