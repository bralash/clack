# Clack API

Usernames without accounts, verified leaderboards and cross-device sync for [Clack](../), as a
Cloudflare Worker with a D1 (SQLite) database.

- **Names:** `POST /api/register` returns a recovery code (`clack-XXXXX-XXXXX-XXXXX-XXXXX`). The page sends it
  as `Authorization: Bearer <code>`; only its SHA-256 hash is stored. Names: 3–16 of `A–Z a–z 0–9 _`,
  case-insensitive, filtered for reserved and offensive words, changeable once per 60 days, released after
  180 days unused.
- **Scores:** `POST /api/scores` takes the keystroke log (`keys`, one char per event with `\b` for backspace, and
  `gaps`, ms since the previous key). `src/engine.js` rebuilds the words (the daily's, or a 30s / 60s run's from its
  seed), replays the run with the same rules as the page and computes wpm and accuracy itself. Runs that don't
  finish the daily, overrun the clock, exceed 250 wpm or have machine-regular timing are refused. One daily per
  player per day.
- **Boards:** `GET /api/board?b=daily|time30|time60&dev=k|t&range=today|week|all` (or `&day=N` for the daily):
  the best run per player, top 50, plus your own rank.
- **Sync:** `POST /api/sync` adds counter deltas (key accuracy, activity, clacks, streak freezes held) and merges everything else
  (`src/merge.js`), so devices add up instead of overwriting each other.
- **Clack Off:** `POST /api/challenges {board: time30|time60, seed, dev, keys, gaps, taunt, rematch_of?, skin?}` verifies the
  creator's run and returns a challenge with a 6-character code, open for 24 hours. `GET /api/challenges/<code>`
  (public; personalised when signed in) returns the seed, the creator's keystrokes for the ghost, the standings and
  your win–loss record against the creator. `POST /api/challenges/<code>/runs` races it — one run per player,
  replayed like any other. `GET /api/challenges` lists the ones you made or raced in the last 14 days.
- **Admin** (used by [`admin.html`](../admin.html); every request needs the `X-Admin-Key` header, and wrong keys are
  locked out after 10 an hour per IP):
  - reads: `GET /api/admin/overview`, `/players?q=`, `/player?id=`, `/runs?board=&dev=&flagged=1&removed=1`, `/log`
  - actions (`POST`, each written to the `admin_log` table): `remove-score {id}`, `restore-score {id}`,
    `ban {id, ban}`, `set-name {id | from, to}` (any name, including reserved ones such as the owner's handle,
    without using up the 60-day rename), `release-name {id}`, `delete-user {id}`,
    `remove-challenge {id}` (takes a clack off link down), `grant-clacks {id | from, amount, note?}` (adds to the
    synced balance, never below 0; the gift is kept in the account's `gifts` list and each device shows a 🎁 message
    after its next sync)

## Admin page

Open `admin.html` (live at https://bralash.github.io/clack/admin.html) and paste the admin key. It's kept only for
that browser tab. Served from localhost it talks to the local API; add `?api=<url>` to point it elsewhere.

## Run it locally

```bash
npm install
npm run dev        # copies the word list from ../index.html, creates the local database, serves :8787
npm test           # unit tests, plus API tests when `npm run dev` is running
```

In a second terminal, `npm run site` serves the site on `http://localhost:5173`, where it talks to the local API
automatically. (It has to be served from localhost; opening `index.html` as a file leaves the leaderboard off.)
To start from a clean database, stop `npm run dev`, delete `.wrangler/` and start it again;
`node scripts/seed-local.mjs` then fills it with a few sample players and runs.
For local admin calls and a looser sign-up limit, create `.dev.vars`:

```
ADMIN_KEY=local-admin-key
REG_PER_HOUR=1000
```

## Deploy

1. Create a free Cloudflare account, then `npx wrangler login`.
2. `npx wrangler d1 create clack` and paste the printed `database_id` into `wrangler.toml`.
3. `npx wrangler secret put ADMIN_KEY` (any long random string; keep it to yourself).
4. `npm run deploy` (copies the word list, applies migrations, deploys). It prints the Worker's URL.
5. Put that URL in `API_PROD` in `../index.html` and push the site.

The word list is copied from `index.html` on every `dev` and `deploy`, so the daily words and seeded runs always
match the page. If you change the page's test engine, `seededRng`, `dailyWords` or `wordGen`, mirror it in
`src/engine.js`.
