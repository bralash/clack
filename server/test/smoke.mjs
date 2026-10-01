// Smoke test for a deployed API: claims a throwaway name, posts one verified run, checks the board,
// syncs, then deletes the name and everything it posted. Usage: node test/smoke.mjs <api url>
import { typeWords, timeWords } from "./helpers.mjs";

const API = (process.argv[2] || "").replace(/\/+$/, "");
if (!API) { console.error("usage: node test/smoke.mjs https://clack-api.<you>.workers.dev"); process.exit(1); }
const ORIGIN = "https://bralash.github.io";
let ok = true;
const check = (cond, label, extra = "") => { console.log(`${cond ? "✔" : "✖"} ${label}${extra ? " — " + extra : ""}`); if (!cond) ok = false; };
async function call(path, { method = "GET", code, body } = {}) {
  const headers = { Origin: ORIGIN }; if (body) headers["Content-Type"] = "application/json"; if (code) headers.Authorization = "Bearer " + code;
  const r = await fetch(API + path, { method, headers, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null), cors: r.headers.get("Access-Control-Allow-Origin") };
}

const name = "smoke_" + Date.now().toString(36).slice(-6);
let code;
try {
  const h = await call("/api/health");
  check(h.status === 200 && h.cors === ORIGIN, "health + CORS for the live site", `cors: ${h.cors}`);
  const nm = await call("/api/name?n=" + name);
  check(nm.status === 200 && nm.body.available === true, "database reachable, name available");
  const reg = await call("/api/register", { method: "POST", body: { name } });
  code = reg.body?.code;
  check(reg.status === 201 && /^clack-/.test(code || ""), "claim a name", `${reg.status} ${name}`);
  const me = await call("/api/me", { code });
  check(me.body?.name === name, "sign in with the recovery code");
  const seed = 1 + Math.floor(Math.random() * 1e9);
  const run = typeWords(timeWords(seed), { maxMs: 30000 });
  const sc = await call("/api/scores", { method: "POST", code, body: { board: "time30", seed, dev: "k", ...run } });
  check(sc.status === 201 && sc.body.wpm > 0, "post a verified 30s run", JSON.stringify(sc.body));
  const robot = typeWords(timeWords(seed), { gapMin: 60, gapMax: 60, maxMs: 30000 });
  const bad = await call("/api/scores", { method: "POST", code, body: { board: "time30", seed, dev: "k", ...robot } });
  check(bad.status === 422, "robot-timed run refused", bad.body?.error);
  const bd = await call("/api/board?b=time30&dev=k&range=today", { code });
  check(bd.body?.me?.name === name && bd.body.rows.some(r => r.name === name), "run shows on today's 30s board", `rank ${bd.body?.me?.rank} of ${bd.body?.total}`);
  const sy = await call("/api/sync", { method: "POST", code, body: { delta: { clacks: 5, keys: { a: { a: 3, e: 1 } } }, sets: { history: [{ t: 1, wpm: 50, dev: "k" }] } } });
  check(sy.status === 200 && sy.body.blob.clacks === 5, "sync");
} catch (e) { check(false, "request failed", e.message); }
finally {
  if (code) {
    const del = await call("/api/me", { method: "DELETE", code });
    const gone = await call("/api/me", { code });
    const bd = await call("/api/board?b=time30&dev=k&range=today");
    check(del.status === 200 && gone.status === 401 && !bd.body.rows.some(r => r.name === name), "clean up: name and scores deleted");
  }
  console.log(ok ? "\nsmoke test passed" : "\nsmoke test FAILED");
  process.exit(ok ? 0 : 1);
}
