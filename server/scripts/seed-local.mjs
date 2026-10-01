// Fills the LOCAL dev database (npm run dev) with a few players and verified runs, for trying the
// leaderboard and admin pages. Never point this at the live API.
import { typeWords, timeWords, dailyWords } from "../test/helpers.mjs";
import { utcDay } from "../src/engine.js";

const API = "http://127.0.0.1:8787";
if (!(await fetch(API + "/api/health").then(r => r.ok, () => false))) { console.error("start the local API first: npm run dev"); process.exit(1); }
const post = (path, body, code) => fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json", ...(code ? { Authorization: "Bearer " + code } : {}) },
  body: JSON.stringify(body) }).then(r => r.json());
const players = [["homerow_hero", "k", [70, 140]], ["qwerty_queen", "k", [80, 170]], ["thumbs_up", "t", [140, 260]], ["night_owl", "t", [160, 300]], ["swift_keys", "k", [45, 95]]];
for (const [name, dev, [lo, hi]] of players) {
  const u = await post("/api/register", { name });
  if (!u.code) { console.log(name, "exists — skipped"); continue; }
  for (const board of ["time30", "time60"]) {
    const seed = Math.floor(Math.random() * 1e9), limit = board === "time30" ? 30000 : 60000;
    console.log(name, board, JSON.stringify(await post("/api/scores", { board, seed, dev, ...typeWords(timeWords(seed), { gapMin: lo, gapMax: hi, maxMs: limit }) }, u.code)));
  }
  const n = utcDay();
  console.log(name, "daily", JSON.stringify(await post("/api/scores", { board: "daily", day: n, dev, ...typeWords(dailyWords(n), { gapMin: lo, gapMax: hi }) }, u.code)));
}
