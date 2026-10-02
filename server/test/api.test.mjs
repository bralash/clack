// End-to-end tests against `npm run dev` (http://127.0.0.1:8787). Skipped when it isn't running.
import { test } from "node:test";
import assert from "node:assert/strict";
import { utcDay } from "../src/engine.js";
import { typeWords, timeWords, dailyWords } from "./helpers.mjs";

const API = process.env.CLACK_API || "http://127.0.0.1:8787";
const up = await fetch(API + "/api/health").then(r => r.ok, () => false);
const opts = { skip: up ? false : `API not running at ${API}` };
const tag = Date.now().toString(36).slice(-5);

async function call(path, { method = "GET", code, body, admin } = {}) {
  const headers = { "Content-Type": "application/json", Origin: "http://localhost:5173" };
  if (code) headers.Authorization = "Bearer " + code;
  if (admin) headers["X-Admin-Key"] = admin;
  const r = await fetch(API + path, { method, headers, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null), cors: r.headers.get("Access-Control-Allow-Origin") };
}

test("usernames: claim, uniqueness, recovery code login, rename rules, delete", opts, async () => {
  const name = "tester_" + tag;
  const reg = await call("/api/register", { method: "POST", body: { name } });
  assert.equal(reg.status, 201); assert.match(reg.body.code, /^clack-[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
  assert.equal(reg.cors, "http://localhost:5173");
  assert.equal((await call("/api/register", { method: "POST", body: { name: name.toUpperCase() } })).status, 409, "names are case-insensitive");
  assert.equal((await call("/api/register", { method: "POST", body: { name: "admin" } })).status, 400);
  assert.equal((await call("/api/name?n=" + name)).body.available, false);
  // the code works however it's pasted
  const loose = reg.body.code.toLowerCase().replace(/-/g, " ");
  assert.equal((await call("/api/me", { code: loose })).body.name, name);
  assert.equal((await call("/api/me", { code: "clack-AAAAA-AAAAA-AAAAA-AAAAA" })).status, 401);
  // one change is allowed, then 60 days must pass
  const r1 = await call("/api/me", { method: "PATCH", code: reg.body.code, body: { name: name + "x" } });
  assert.equal(r1.status, 200); assert.equal(r1.body.renameIn, 60);
  const r2 = await call("/api/me", { method: "PATCH", code: reg.body.code, body: { name: name + "y" } });
  assert.equal(r2.status, 403); assert.match(r2.body.error, /60 days/);
  assert.equal((await call("/api/me", { method: "DELETE", code: reg.body.code })).status, 200);
  assert.equal((await call("/api/me", { code: reg.body.code })).status, 401);
});

test("scores: verified runs rank, cheats are refused, the daily counts once", opts, async () => {
  const a = (await call("/api/register", { method: "POST", body: { name: "fast_" + tag } })).body;
  const b = (await call("/api/register", { method: "POST", body: { name: "slow_" + tag } })).body;
  const seed = 1000 + Math.floor(Math.random() * 1e6);
  const fast = typeWords(timeWords(seed), { gapMin: 70, gapMax: 150, maxMs: 60000 });
  const slow = typeWords(timeWords(seed), { gapMin: 160, gapMax: 320, maxMs: 60000 });
  const sa = await call("/api/scores", { method: "POST", code: a.code, body: { board: "time60", seed, dev: "k", ...fast } });
  const sb = await call("/api/scores", { method: "POST", code: b.code, body: { board: "time60", seed, dev: "k", ...slow } });
  assert.equal(sa.status, 201, JSON.stringify(sa.body)); assert.equal(sb.status, 201);
  assert.ok(sa.body.wpm > sb.body.wpm);
  // a forged score: the server ignores the page's numbers and rejects robotic timing
  const robot = typeWords(timeWords(seed), { gapMin: 50, gapMax: 50, maxMs: 60000 });
  const bad = await call("/api/scores", { method: "POST", code: b.code, body: { board: "time60", seed, dev: "k", ...robot, wpm: 240 } });
  assert.equal(bad.status, 422);
  // board: a is ranked above b on today's 60s keyboard board, and phones are separate
  const bd = await call("/api/board?b=time60&dev=k&range=today", { code: a.code });
  const names = bd.body.rows.map(r => r.name);
  assert.ok(names.indexOf("fast_" + tag) < names.indexOf("slow_" + tag));
  assert.equal(bd.body.me.name, "fast_" + tag);
  assert.ok(bd.body.rows.find(r => r.me));
  const phone = await call("/api/board?b=time60&dev=t&range=today");
  assert.ok(!phone.body.rows.some(r => r.name === "fast_" + tag));
  // each list says how many are on the other one, so a phone can see the keyboard runs exist
  assert.equal(phone.body.counts.k, bd.body.total);
  assert.equal(phone.body.counts.t, phone.body.total);
  // daily: one official run per player per day
  const n = utcDay(), run = typeWords(dailyWords(n));
  const d1 = await call("/api/scores", { method: "POST", code: a.code, body: { board: "daily", day: n, dev: "k", ...run } });
  assert.equal(d1.status, 201, JSON.stringify(d1.body));
  const d2 = await call("/api/scores", { method: "POST", code: a.code, body: { board: "daily", day: n, dev: "k", ...run } });
  assert.equal(d2.body.duplicate, true);
  assert.equal((await call("/api/scores", { method: "POST", code: a.code, body: { board: "daily", day: n - 5, dev: "k", ...run } })).status, 400);
  const daily = await call(`/api/board?b=daily&day=${n}&dev=k`);
  assert.equal(daily.body.rows.filter(r => r.name === "fast_" + tag).length, 1);
  // moderation: an admin can pull a score off the board
  const id = bd.body.rows.find(r => r.name === "slow_" + tag).id;
  assert.equal((await call("/api/admin/remove-score", { method: "POST", body: { id }, admin: "wrong" })).status, 403);
  assert.equal((await call("/api/admin/remove-score", { method: "POST", body: { id }, admin: "local-admin-key" })).body.removed, 1);
  const after = await call("/api/board?b=time60&dev=k&range=today");
  assert.ok(!after.body.rows.some(r => r.name === "slow_" + tag));
  for (const u of [a, b]) await call("/api/me", { method: "DELETE", code: u.code });
});

test("admin can give an account a reserved name; players can't take it", opts, async () => {
  const u = (await call("/api/register", { method: "POST", body: { name: "owner_" + tag } })).body;
  assert.equal((await call("/api/me", { method: "PATCH", code: u.code, body: { name: "bra_lash" } })).status, 400);   // reserved
  assert.equal((await call("/api/admin/set-name", { method: "POST", body: { from: "owner_" + tag, to: "bra_lash" }, admin: "wrong" })).status, 403);
  const r = await call("/api/admin/set-name", { method: "POST", body: { from: "owner_" + tag, to: "bra_lash" }, admin: "local-admin-key" });
  assert.equal(r.status, 200); assert.equal(r.body.name, "bra_lash");
  const me = await call("/api/me", { code: u.code });
  assert.equal(me.body.name, "bra_lash"); assert.equal(me.body.renameIn, 0, "doesn't use up the 60-day rename");
  assert.equal((await call("/api/register", { method: "POST", body: { name: "Bra_Lash" } })).status, 400);
  await call("/api/me", { method: "DELETE", code: u.code });
});

test("admin page: overview, players, runs, actions and the log", opts, async () => {
  const K = "local-admin-key", get = p => call("/api/admin/" + p, { admin: K }), post = (p, body) => call("/api/admin/" + p, { method: "POST", body, admin: K });
  assert.equal((await call("/api/admin/overview", { admin: "nope" })).status, 403);
  assert.equal((await call("/api/admin/overview", { admin: "  " + K + "\n" })).status, 200, "stray spaces around the key are ignored");
  const u = (await call("/api/register", { method: "POST", body: { name: "adm_" + tag } })).body;
  const seed = 77 + Math.floor(Math.random() * 1e6), run = typeWords(timeWords(seed), { maxMs: 30000 });
  const sc = await call("/api/scores", { method: "POST", code: u.code, body: { board: "time30", seed, dev: "t", ...run } });
  assert.equal(sc.status, 201);
  const ov = (await get("overview")).body;
  assert.ok(ov.players.total >= 1 && ov.runs.total >= 1); assert.ok(Array.isArray(ov.perDay) && Array.isArray(ov.top));
  const pl = (await get("players?q=adm_" + tag)).body;
  assert.equal(pl.rows.length, 1); const id = pl.rows[0].id; assert.equal(pl.rows[0].runs, 1);
  const pd = (await get("player?id=" + id)).body;
  assert.equal(pd.user.name, "adm_" + tag); assert.equal(pd.runs.length, 1);
  const runs = (await get("runs?dev=t")).body.rows; const mine = runs.find(r => r.user_id === id);
  assert.ok(mine, "the phone run is listed");
  assert.equal((await post("remove-score", { id: mine.id })).body.removed, 1);
  assert.equal((await get("runs?removed=1")).body.rows.some(r => r.id === mine.id), true);
  assert.equal((await post("restore-score", { id: mine.id })).body.removed, 0);
  assert.equal((await post("ban", { id, ban: true })).body.banned, 1);
  assert.equal((await post("ban", { id, ban: false })).body.banned, 0);
  assert.equal((await post("set-name", { id, to: "adm2_" + tag })).body.name, "adm2_" + tag);
  const log = (await get("log")).body.rows.slice(0, 6).map(r => r.action);
  for (const a of ["set-name", "unban", "ban", "restore-score", "remove-score"]) assert.ok(log.includes(a), "logged " + a);
  assert.equal((await post("delete-user", { id })).status, 200);
  assert.equal((await get("player?id=" + id)).status, 404);
});

test("clack off: create, race the ghost, one run each, standings and rivalry", opts, async () => {
  const a = (await call("/api/register", { method: "POST", body: { name: "chal_a_" + tag } })).body;
  const b = (await call("/api/register", { method: "POST", body: { name: "chal_b_" + tag } })).body;
  const c = (await call("/api/register", { method: "POST", body: { name: "chal_c_" + tag } })).body;
  const seed = 5 + Math.floor(Math.random() * 1e6);
  const fast = typeWords(timeWords(seed), { gapMin: 70, gapMax: 150, maxMs: 30000 });
  const slow = typeWords(timeWords(seed), { gapMin: 170, gapMax: 330, maxMs: 30000 });
  // a robot-timed run can't start a challenge
  const bot = typeWords(timeWords(seed), { gapMin: 80, gapMax: 80, maxMs: 30000 });
  assert.equal((await call("/api/challenges", { method: "POST", code: a.code, body: { board: "time30", seed, dev: "k", ...bot } })).status, 422);
  const made = await call("/api/challenges", { method: "POST", code: a.code, body: { board: "time30", seed, dev: "k", taunt: 2, skin: "shark", ...fast } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.id;
  assert.match(id, /^[a-z2-9]{6}$/); assert.equal(made.body.creator.me, true); assert.equal(made.body.taunt, 2);
  // anyone can look (no sign-in): seed + ghost to race
  const view = (await call("/api/challenges/" + id)).body;
  assert.equal(view.skin, "shark", "racers see the creator's ghost skin");
  assert.equal(view.seed, seed); assert.equal(view.ghost.keys, fast.keys); assert.equal(view.entries.length, 1); assert.equal(view.open, true);
  // b plays slower, c plays the wrong words; b can't play twice
  const pb = await call(`/api/challenges/${id}/runs`, { method: "POST", code: b.code, body: { dev: "t", ...slow } });
  assert.equal(pb.status, 201); assert.equal(pb.body.mine.rank, 2); assert.deepEqual(pb.body.record, { wins: 0, losses: 1 });
  const again = await call(`/api/challenges/${id}/runs`, { method: "POST", code: b.code, body: { dev: "t", ...fast } });
  assert.equal(again.body.duplicate, true); assert.equal(again.body.mine.rank, 2, "the first run stands");
  const wrong = typeWords(timeWords(seed + 1), { maxMs: 30000 });
  const pc = await call(`/api/challenges/${id}/runs`, { method: "POST", code: c.code, body: { dev: "k", ...wrong } });
  assert.equal(pc.status, 201); assert.ok(pc.body.mine.wpm < 30, "words that don't match score badly");
  assert.deepEqual(pc.body.entries.map(e => e.name), ["chal_a_" + tag, "chal_b_" + tag, "chal_c_" + tag]);
  // a's list shows it with 3 players; b sees it too
  const mineA = (await call("/api/challenges", { code: a.code })).body.rows.find(r => r.id === id);
  assert.equal(mineA.players, 3); assert.equal(mineA.mine, true); assert.equal(mineA.my_rank, 1);
  assert.ok((await call("/api/challenges", { code: b.code })).body.rows.some(r => r.id === id && r.my_rank === 2));
  // new results are other people's runs since you last looked, on any device: a hasn't looked since
  // b and c raced; b raced before c, and never counts its own run
  assert.equal(mineA.fresh, 2);
  assert.equal((await call("/api/challenges", { code: b.code })).body.rows.find(r => r.id === id).fresh, 1);
  await call("/api/challenges/" + id, { code: a.code });                      // a opens it (say, on the phone)
  assert.equal((await call("/api/challenges", { code: a.code })).body.rows.find(r => r.id === id).fresh, 0, "seen on every device");
  assert.equal((await call("/api/challenges", { code: c.code })).body.rows.find(r => r.id === id).fresh, 0, "your own run isn't news");
  // admin can remove it; then it's gone
  assert.equal((await call("/api/admin/remove-challenge", { method: "POST", body: { id }, admin: "local-admin-key" })).status, 200);
  assert.equal((await call("/api/challenges/" + id)).status, 404);
  assert.equal((await call("/api/challenges/nope12")).status, 404);
  for (const u of [a, b, c]) assert.equal((await call("/api/me", { method: "DELETE", code: u.code })).status, 200);   // deleting cleans up their clack offs
});

test("sync: two devices add up instead of overwriting", opts, async () => {
  const u = (await call("/api/register", { method: "POST", body: { name: "sync_" + tag } })).body;
  const laptop = await call("/api/sync", { method: "POST", code: u.code, body: {
    delta: { keys: { e: { a: 100, e: 5 } }, data: { "2026-10-1": { words: 120, time: 60 } }, clacks: 80 },
    sets: { history: [{ t: 1, wpm: 90, dev: "k" }], owned: { ship: { arrow: 1, dart: 1 } } } } });
  assert.equal(laptop.status, 200);
  const phone = await call("/api/sync", { method: "POST", code: u.code, body: {
    delta: { keys: { e: { a: 40, e: 4 } }, data: { "2026-10-1": { words: 30, time: 60 } }, clacks: 20 },
    sets: { history: [{ t: 2, wpm: 40, dev: "t" }], owned: { trail: { laser: 1 } } } } });
  const blob = phone.body.blob;
  assert.deepEqual(blob.keys.e, { a: 140, e: 9 });
  assert.deepEqual(blob.data["2026-10-1"], { words: 150, time: 120 });
  assert.equal(blob.clacks, 100);
  assert.equal(blob.history.length, 2);
  assert.deepEqual(blob.owned, { ship: { arrow: 1, dart: 1 }, trail: { laser: 1 } });
  // store: sound packs etc. merge like ships; streak freezes add up as a counter; covered days union
  const more = (await call("/api/sync", { method: "POST", code: u.code, body: {
    delta: { freezes: 2 }, sets: { owned: { sound: { thock: 1 }, ghost: { robot: 1 }, frame: { kente: 1 }, bogus: { x: 1 } }, frozen: { "2026-10-1": 1 } } } })).body.blob;
  const used = (await call("/api/sync", { method: "POST", code: u.code, body: {
    delta: { freezes: -1 }, sets: { frozen: { "2026-10-2": 1, "nope": 1 } } } })).body.blob;
  assert.equal(more.freezes, 2); assert.equal(used.freezes, 1);
  assert.deepEqual(used.owned.sound, { thock: 1 }); assert.deepEqual(used.owned.frame, { kente: 1 }); assert.equal(used.owned.bogus, undefined);
  assert.deepEqual(used.frozen, { "2026-10-1": 1, "2026-10-2": 1 });
  await call("/api/me", { method: "DELETE", code: u.code });
});
