// Clack API: usernames without accounts, verified leaderboards, and cross-device sync.
//
// A player is identified by a recovery code ("clack-XXXXX-XXXXX-XXXXX-XXXXX") that the server
// generates once and the page keeps in localStorage; requests send it as a Bearer token.
// Only its SHA-256 hash is stored, so a database leak doesn't reveal anyone's code.
import { scoreRun, utcDay } from "./engine.js";
import { nameProblem } from "./names.js";
import { applyDeltas, mergeSets } from "./merge.js";

const DAY = 864e5;
const RENAME_DAYS = 60;          // a name can be changed once every 60 days
const RELEASE_DAYS = 180;        // names unused for 6 months can be claimed by someone else
const BOARDS = ["daily", "time30", "time60"];
const MAX_BODY = 200_000;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : (allowed[0] || "*"),
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Admin-Key",
      "Access-Control-Max-Age": "86400", "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let res;
    try { res = await route(req, env); }
    catch (e) {
      if (e instanceof HttpError) res = json({ error: e.message }, e.status);
      else { console.error(e); res = json({ error: "something went wrong on our side" }, 500); }
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};

async function route(req, env) {
  const url = new URL(req.url), p = url.pathname.replace(/\/+$/, ""), m = req.method;
  if (p === "/api/health") return json({ ok: true });
  if (p === "/api/name" && m === "GET") return checkName(env, url.searchParams.get("n"));
  if (p === "/api/register" && m === "POST") return register(req, env);
  if (p === "/api/me" && m === "GET") return me(await auth(req, env));
  if (p === "/api/me" && m === "PATCH") return rename(req, env, await auth(req, env));
  if (p === "/api/me" && m === "DELETE") return removeMe(env, await auth(req, env));
  if (p === "/api/scores" && m === "POST") return submit(req, env, await auth(req, env));
  if (p === "/api/board" && m === "GET") return board(env, url, await auth(req, env, false));
  if (p === "/api/sync" && m === "POST") return sync(req, env, await auth(req, env));
  if (p.startsWith("/api/admin/")) return admin(req, env, p.slice(11));
  fail(404, "not found");
}

/* ---------- helpers ---------- */
async function body(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) fail(413, "request too large");
  try { return JSON.parse(text || "{}"); } catch { fail(400, "bad request"); }
}
async function sha256(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 32 symbols, no 0/O or 1/I lookalikes
function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(20));
  const s = [...b].map(x => CODE_ALPHABET[x & 31]).join("");  // 20 symbols = 100 bits
  return { raw: s, pretty: "clack-" + s.match(/.{5}/g).join("-") };
}
/** Accepts the code with or without the "clack-" prefix, dashes, spaces or lower case. */
export function normalizeCode(c) {
  const s = String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^CLACK/, "");
  return s.length === 20 && [...s].every(ch => CODE_ALPHABET.includes(ch)) ? s : null;
}
async function auth(req, env, required = true) {
  const h = req.headers.get("Authorization") || "", code = normalizeCode(h.replace(/^Bearer\s+/i, ""));
  if (!code) { if (required) fail(401, "unknown recovery code"); return null; }
  const u = await env.DB.prepare("SELECT * FROM users WHERE code_hash = ?").bind(await sha256(code)).first();
  if (!u) { if (required) fail(401, "unknown recovery code"); return null; }
  const now = Date.now();
  if (now - u.last_seen > 3600e3) await env.DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(now, u.id).run();
  return u;
}
async function limit(env, key, max) {
  const hour = Math.floor(Date.now() / 3600e3);
  const r = await env.DB.prepare("INSERT INTO rate (k, hour, n) VALUES (?1, ?2, 1) ON CONFLICT (k, hour) DO UPDATE SET n = n + 1 RETURNING n")
    .bind(key, hour).first();
  if (r.n > max) fail(429, "too many requests — try again in a bit");
}
const ip = req => req.headers.get("CF-Connecting-IP") || "local";

/** Frees a name whose owner hasn't been seen for RELEASE_DAYS. Returns true if the name is free now. */
async function nameFree(env, name, exceptId = 0) {
  const u = await env.DB.prepare("SELECT id, last_seen FROM users WHERE name = ?").bind(name).first();
  if (!u || u.id === exceptId) return true;
  if (Date.now() - u.last_seen < RELEASE_DAYS * DAY) return false;
  await env.DB.prepare("UPDATE users SET name = NULL WHERE id = ?").bind(u.id).run();
  return true;
}
const renameIn = u => (u.renamed ? Math.max(0, Math.ceil((u.renamed + RENAME_DAYS * DAY - Date.now()) / DAY)) : 0);
const publicMe = u => ({ name: u.name, renameIn: renameIn(u), created: u.created });

/* ---------- names ---------- */
async function checkName(env, name) {
  const why = nameProblem(name);
  if (why) return json({ available: false, reason: why });
  const u = await env.DB.prepare("SELECT last_seen FROM users WHERE name = ?").bind(name.trim()).first();
  const free = !u || Date.now() - u.last_seen >= RELEASE_DAYS * DAY;
  return json({ available: free, reason: free ? null : "that name is taken" });
}
async function register(req, env) {
  await limit(env, "reg:" + ip(req), +env.REG_PER_HOUR || 6);
  const { name } = await body(req), why = nameProblem(name);
  if (why) fail(400, why);
  const clean = name.trim();
  if (!(await nameFree(env, clean))) fail(409, "that name is taken");
  const code = newCode(), now = Date.now();
  try {
    await env.DB.prepare("INSERT INTO users (name, code_hash, created, last_seen) VALUES (?, ?, ?, ?)")
      .bind(clean, await sha256(code.raw), now, now).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) fail(409, "that name is taken");
    throw e;
  }
  await env.DB.prepare("DELETE FROM rate WHERE hour < ?").bind(Math.floor(now / 3600e3) - 48).run();   // tidy old counters
  return json({ name: clean, code: code.pretty, renameIn: 0 }, 201);
}
function me(u) { return json(publicMe(u)); }
async function rename(req, env, u) {
  const { name } = await body(req), why = nameProblem(name);
  if (why) fail(400, why);
  const clean = name.trim();
  if (u.name && clean === u.name) return json(publicMe(u));
  // the first pick after a released name is free; otherwise once every RENAME_DAYS
  if (u.name && renameIn(u) > 0) fail(403, `you can change your name again in ${renameIn(u)} days`);
  if (!(await nameFree(env, clean, u.id))) fail(409, "that name is taken");
  const now = Date.now(), stamp = u.name ? now : u.renamed;
  try { await env.DB.prepare("UPDATE users SET name = ?, renamed = ? WHERE id = ?").bind(clean, stamp, u.id).run(); }
  catch (e) { if (String(e).includes("UNIQUE")) fail(409, "that name is taken"); throw e; }
  return json(publicMe({ ...u, name: clean, renamed: stamp }));
}
async function removeMe(env, u) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM scores WHERE user_id = ?").bind(u.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(u.id),
  ]);
  return json({ deleted: true });
}

/* ---------- scores ---------- */
async function submit(req, env, u) {
  await limit(env, "score:" + u.id, 40);
  const b = await body(req);
  if (!BOARDS.includes(b.board)) fail(400, "unknown leaderboard");
  const dev = b.dev === "t" ? "t" : "k", today = utcDay();
  let day;
  if (b.board === "daily") {
    day = b.day;                                     // the page uses local dates, so allow ±1 day
    if (!Number.isInteger(day) || Math.abs(day - today) > 1) fail(400, "that daily isn't open any more");
  } else day = today;
  const r = scoreRun({ board: b.board, day, seed: b.seed, keys: b.keys, gaps: b.gaps, dev });
  if (r.error) fail(422, r.error);
  if (b.board === "daily") {
    const prev = await env.DB.prepare("SELECT id FROM scores WHERE user_id = ? AND board = 'daily' AND day = ?").bind(u.id, day).first();
    if (prev) return json({ ...(await rankOf(env, b.board, dev, day, day, u.id)), duplicate: true });
  }
  await env.DB.prepare("INSERT INTO scores (user_id, board, dev, day, wpm, acc, created) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(u.id, b.board, dev, day, r.wpm, r.acc, Date.now()).run();
  const [lo, hi] = b.board === "daily" ? [day, day] : [today, today];
  return json({ wpm: r.wpm, acc: r.acc, ...(await rankOf(env, b.board, dev, lo, hi, u.id)) }, 201);
}

// Best run per player in a range, ranked by wpm, then accuracy, then who got there first.
const RANKED = `
  WITH best AS (
    SELECT s.id, s.user_id, s.wpm, s.acc, s.created,
      ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.wpm DESC, s.acc DESC, s.created ASC) AS rn
    FROM scores s JOIN users u ON u.id = s.user_id
    WHERE s.board = ?1 AND s.dev = ?2 AND s.day BETWEEN ?3 AND ?4 AND s.removed = 0 AND u.banned = 0 AND u.name IS NOT NULL
  ), ranked AS (
    SELECT id, user_id, wpm, acc, created,
      RANK() OVER (ORDER BY wpm DESC, acc DESC) AS rank,
      ROW_NUMBER() OVER (ORDER BY wpm DESC, acc DESC, created ASC) AS pos
    FROM best WHERE rn = 1
  )`;
async function rankOf(env, boardId, dev, lo, hi, userId) {
  const r = await env.DB.prepare(`${RANKED} SELECT rank, (SELECT COUNT(*) FROM ranked) AS total FROM ranked WHERE user_id = ?5`)
    .bind(boardId, dev, lo, hi, userId).first();
  return { rank: r ? r.rank : null, total: r ? r.total : 0 };
}
async function board(env, url, u) {
  const q = url.searchParams, b = q.get("b"), dev = q.get("dev") === "t" ? "t" : "k";
  if (!BOARDS.includes(b)) fail(400, "unknown leaderboard");
  const today = utcDay();
  let lo, hi;
  if (b === "daily") { const d = parseInt(q.get("day"), 10); if (!Number.isInteger(d)) fail(400, "which daily?"); lo = hi = d; }
  else {
    const range = q.get("range");
    if (range === "today") lo = hi = today;
    else if (range === "week") { lo = today - 6; hi = today; }
    else { lo = 0; hi = 1e9; }
  }
  const [top, mine, count] = await env.DB.batch([
    env.DB.prepare(`${RANKED} SELECT r.id, r.rank, r.wpm, r.acc, r.created, u.name FROM ranked r JOIN users u ON u.id = r.user_id ORDER BY r.pos LIMIT 50`)
      .bind(b, dev, lo, hi),
    env.DB.prepare(`${RANKED} SELECT r.rank, r.wpm, r.acc, r.created FROM ranked r WHERE r.user_id = ?5`).bind(b, dev, lo, hi, u ? u.id : -1),
    env.DB.prepare(`${RANKED} SELECT COUNT(*) AS n FROM ranked`).bind(b, dev, lo, hi),
  ]);
  return json({
    rows: top.results.map(r => ({ id: r.id, rank: r.rank, name: r.name, wpm: r.wpm, acc: r.acc, at: r.created, me: !!(u && r.name === u.name) })),
    me: u && mine.results[0] ? { ...mine.results[0], name: u.name } : null,
    total: count.results[0].n,
  });
}

/* ---------- sync ---------- */
async function sync(req, env, u) {
  await limit(env, "sync:" + u.id, 240);
  const b = await body(req);
  for (let attempt = 0; attempt < 4; attempt++) {            // optimistic write: retry if another device synced meanwhile
    const row = await env.DB.prepare("SELECT blob, blob_ver FROM users WHERE id = ?").bind(u.id).first();
    let blob = {}; try { blob = JSON.parse(row.blob || "{}") || {}; } catch { blob = {}; }
    applyDeltas(blob, b.delta);
    mergeSets(blob, b.sets);
    const res = await env.DB.prepare("UPDATE users SET blob = ?, blob_ver = blob_ver + 1 WHERE id = ? AND blob_ver = ?")
      .bind(JSON.stringify(blob), u.id, row.blob_ver).run();
    if (res.meta.changes) return json({ blob });
  }
  fail(409, "sync conflict — try again");
}

/* ---------- admin (admin.html) ---------- */
// Every admin request carries the X-Admin-Key header. Wrong keys are counted per IP and locked out
// after ADMIN_TRIES an hour, so the key can't be guessed. Every change is written to admin_log.
const ADMIN_TRIES = 10;
const FAST = { k: 150, t: 110 };                 // runs at or above these wpm are flagged for a look
async function adminAuth(req, env) {
  const hour = Math.floor(Date.now() / 3600e3), key = "adminfail:" + ip(req);
  const tries = await env.DB.prepare("SELECT n FROM rate WHERE k = ? AND hour = ?").bind(key, hour).first();
  if (tries && tries.n >= (+env.ADMIN_TRIES || ADMIN_TRIES)) fail(429, "too many wrong keys — try again in an hour");
  const given = (req.headers.get("X-Admin-Key") || "").trim(), real = (env.ADMIN_KEY || "").trim();
  // compare hashes so the check takes the same time whatever the key
  if (!real || (await sha256(given)) !== (await sha256(real))) {
    await limit(env, key, 1e9);                  // just counts the failure
    fail(403, "wrong admin key");
  }
}
async function logAction(env, req, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_log (at, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)")
    .bind(Date.now(), action, target == null ? null : String(target), detail == null ? null : JSON.stringify(detail), ip(req)).run();
}
/** The account an action is about: by id (preferred) or by name. */
async function findUser(env, b) {
  const u = b.id != null
    ? await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(+b.id).first()
    : await env.DB.prepare("SELECT * FROM users WHERE name = ?").bind(String(b.name ?? b.from ?? "")).first();
  if (!u) fail(404, "no such account");
  return u;
}
const who = u => u.name || `#${u.id}`;

async function admin(req, env, action) {
  await adminAuth(req, env);
  if (req.method === "GET") {
    const q = new URL(req.url).searchParams;
    if (action === "overview") return adminOverview(env);
    if (action === "players") return adminPlayers(env, q);
    if (action === "player") return adminPlayer(env, q);
    if (action === "runs") return adminRuns(env, q);
    if (action === "log") {
      const r = await env.DB.prepare("SELECT * FROM admin_log ORDER BY at DESC LIMIT 200").all();
      return json({ rows: r.results });
    }
    fail(404, "unknown admin view");
  }
  if (req.method !== "POST") fail(405, "method not allowed");
  const b = await body(req);
  if (action === "remove-score" || action === "restore-score") {
    const off = action === "remove-score" ? 1 : 0;
    const run = await env.DB.prepare("SELECT s.id, s.board, s.dev, s.wpm, u.name FROM scores s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?").bind(+b.id).first();
    if (!run) fail(404, "no such run");
    await env.DB.prepare("UPDATE scores SET removed = ? WHERE id = ?").bind(off, run.id).run();
    await logAction(env, req, action, `run #${run.id}`, { player: run.name, board: run.board, dev: run.dev, wpm: run.wpm });
    return json({ ok: true, removed: off });
  }
  if (action === "ban") {
    const u = await findUser(env, b), on = b.ban === false ? 0 : 1;
    await env.DB.prepare("UPDATE users SET banned = ? WHERE id = ?").bind(on, u.id).run();
    await logAction(env, req, on ? "ban" : "unban", who(u));
    return json({ ok: true, banned: on });
  }
  if (action === "set-name") {
    // Give an account any name, including a reserved one (e.g. the owner's own handle). The account
    // keeps its scores, stats and recovery code, and this doesn't count toward the 60-day rename limit.
    const to = String(b.to || "").trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(to)) fail(400, "use 3–16 letters, numbers or _");
    const u = await findUser(env, b);
    if (!(await nameFree(env, to, u.id))) fail(409, "that name is taken");
    await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(to, u.id).run();
    await logAction(env, req, "set-name", who(u), { to });
    return json({ ok: true, name: to });
  }
  if (action === "release-name") {
    const u = await findUser(env, b);
    await env.DB.prepare("UPDATE users SET name = NULL WHERE id = ?").bind(u.id).run();
    await logAction(env, req, "release-name", who(u));
    return json({ ok: true });
  }
  if (action === "delete-user") {
    const u = await findUser(env, b);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM scores WHERE user_id = ?").bind(u.id),
      env.DB.prepare("DELETE FROM users WHERE id = ?").bind(u.id),
    ]);
    await logAction(env, req, "delete-user", who(u));
    return json({ ok: true });
  }
  fail(404, "unknown admin action");
}

async function adminOverview(env) {
  const now = Date.now(), dayStart = (utcDay(now) - 1) * DAY + Date.UTC(2026, 8, 30), week = now - 7 * DAY, today = utcDay(now);
  const one = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const [players, runs, byBoard, byDev, perDay, daily, top] = await env.DB.batch([
    one(`SELECT COUNT(*) AS total,
           SUM(created >= ?1) AS newToday, SUM(created >= ?2) AS newWeek,
           SUM(last_seen >= ?1) AS activeToday, SUM(last_seen >= ?2) AS activeWeek,
           SUM(name IS NULL) AS nameless, SUM(banned) AS banned FROM users`, dayStart, week),
    one(`SELECT COUNT(*) AS total, SUM(created >= ?1) AS today, SUM(created >= ?2) AS week,
           SUM(removed) AS removed FROM scores`, dayStart, week),
    one(`SELECT board, COUNT(*) AS n FROM scores WHERE created >= ? AND removed = 0 GROUP BY board`, week),
    one(`SELECT dev, COUNT(*) AS n FROM scores WHERE created >= ? AND removed = 0 GROUP BY dev`, week),
    one(`SELECT CAST((created - ?1) / 86400000 AS INTEGER) + 1 AS day, COUNT(*) AS n, COUNT(DISTINCT user_id) AS players
           FROM scores WHERE created >= ?2 AND removed = 0 GROUP BY day ORDER BY day`, Date.UTC(2026, 8, 30), now - 14 * DAY),
    one(`SELECT day, COUNT(*) AS n FROM scores WHERE board = 'daily' AND removed = 0 AND day >= ? GROUP BY day ORDER BY day`, today - 13),
    one(`SELECT s.id, s.board, s.dev, s.wpm, s.acc, u.name FROM scores s JOIN users u ON u.id = s.user_id
           WHERE s.created >= ? AND s.removed = 0 ORDER BY s.wpm DESC LIMIT 8`, dayStart),
  ]);
  return json({
    today, players: players.results[0], runs: runs.results[0],
    byBoard: byBoard.results, byDev: byDev.results, perDay: perDay.results, daily: daily.results, top: top.results,
  });
}
async function adminPlayers(env, q) {
  const term = (q.get("q") || "").trim(), off = Math.max(0, parseInt(q.get("offset"), 10) || 0);
  const r = await env.DB.prepare(`
    SELECT u.id, u.name, u.created, u.last_seen, u.banned, u.renamed,
      (SELECT COUNT(*) FROM scores s WHERE s.user_id = u.id) AS runs,
      (SELECT MAX(wpm) FROM scores s WHERE s.user_id = u.id AND s.board = 'time60' AND s.removed = 0) AS best60,
      (SELECT MAX(wpm) FROM scores s WHERE s.user_id = u.id AND s.removed = 0) AS best
    FROM users u WHERE (?1 = '' OR u.name LIKE '%' || ?1 || '%' OR CAST(u.id AS TEXT) = ?1)
    ORDER BY u.last_seen DESC LIMIT 50 OFFSET ?2`).bind(term, off).all();
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users u WHERE (?1 = '' OR u.name LIKE '%' || ?1 || '%' OR CAST(u.id AS TEXT) = ?1)`).bind(term).first();
  return json({ rows: r.results, total: total.n });
}
async function adminPlayer(env, q) {
  const u = await findUser(env, { id: q.get("id") });
  const runs = await env.DB.prepare("SELECT id, board, dev, day, wpm, acc, created, removed FROM scores WHERE user_id = ? ORDER BY created DESC LIMIT 60").bind(u.id).all();
  let blob = {}; try { blob = JSON.parse(u.blob || "{}") || {}; } catch { blob = {}; }
  const synced = {
    clacks: blob.clacks || 0, history: (blob.history || []).length, badges: Object.keys(blob.badges || {}).length,
    ships: Object.keys((blob.owned || {}).ship || {}).length, trails: Object.keys((blob.owned || {}).trail || {}).length,
    lessons: Object.values((blob.school || {}).stars || {}).filter(Boolean).length, dailies: Object.keys(blob.daily || {}).length,
  };
  return json({
    user: { id: u.id, name: u.name, created: u.created, last_seen: u.last_seen, renamed: u.renamed, banned: u.banned, renameIn: renameIn(u) },
    runs: runs.results, synced,
  });
}
async function adminRuns(env, q) {
  const board = q.get("board") || "", dev = q.get("dev") || "", flagged = q.get("flagged") === "1", removed = q.get("removed") === "1";
  const r = await env.DB.prepare(`
    SELECT s.id, s.board, s.dev, s.day, s.wpm, s.acc, s.created, s.removed, s.user_id, u.name
    FROM scores s LEFT JOIN users u ON u.id = s.user_id
    WHERE (?1 = '' OR s.board = ?1) AND (?2 = '' OR s.dev = ?2)
      AND (?3 = 0 OR (s.dev = 'k' AND s.wpm >= ?5) OR (s.dev = 't' AND s.wpm >= ?6))
      AND (?4 = 0 OR s.removed = 1)
    ORDER BY s.created DESC LIMIT 150`).bind(board, dev, flagged ? 1 : 0, removed ? 1 : 0, FAST.k, FAST.t).all();
  return json({ rows: r.results.map(x => ({ ...x, flagged: x.wpm >= FAST[x.dev] })) });
}
