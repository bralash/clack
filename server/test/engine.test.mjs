import { test } from "node:test";
import assert from "node:assert/strict";
import { replay, scoreRun, dailyWords, wordGen, utcDay } from "../src/engine.js";
import { nameProblem } from "../src/names.js";
import { applyDeltas, mergeSets } from "../src/merge.js";
import { typeWords, timeWords } from "./helpers.mjs";

test("replay scores like the page: auto-advance, spaces after a full word are ignored", () => {
  const ws = ["cat", "dog"]; let i = 0;
  const r = replay(() => ws[i++], "cat dog ", [0, 100, 100, 100, 100, 100, 100, 100]);
  assert.deepEqual([r.correct, r.total, r.words], [8, 8, 2]);
});
test("replay: an early space commits a short word and counts the missing letters wrong", () => {
  const ws = ["house", "x"]; let i = 0;
  const r = replay(() => ws[i++], "ho ", [0, 100, 100]);
  assert.deepEqual([r.correct, r.total, r.words], [3, 6, 1]);
});
test("replay: backspace fixes a typo before the word ends", () => {
  const ws = ["sun"]; let i = 0;
  const r = replay(() => ws[i++], "sx\bun", [0, 100, 100, 100, 100]);
  assert.deepEqual([r.correct, r.total], [4, 4]);
});

test("a human-paced 60s run is accepted and scored on the server", () => {
  const run = typeWords(timeWords(4242), { maxMs: 60000 });
  const r = scoreRun({ board: "time60", seed: 4242, ...run, dev: "k" });
  assert.ok(!r.error, r.error);
  assert.ok(r.wpm > 60 && r.wpm < 160, "wpm " + r.wpm);
  assert.equal(r.acc, 100);
});
test("perfectly even timing is rejected as automated", () => {
  const run = typeWords(timeWords(7), { gapMin: 100, gapMax: 100, maxMs: 60000 });
  assert.match(scoreRun({ board: "time60", seed: 7, ...run, dev: "k" }).error, /automated/);
});
test("runs longer than the limit, or impossibly fast, are rejected", () => {
  const long = typeWords(timeWords(8), { maxMs: 35000 });
  assert.match(scoreRun({ board: "time30", seed: 8, ...long, dev: "k" }).error, /longer/);
  const fast = typeWords(timeWords(9), { gapMin: 20, gapMax: 60, maxMs: 30000 });
  assert.match(scoreRun({ board: "time30", seed: 9, ...fast, dev: "k" }).error, /faster/);
});
test("a run typed against the wrong words scores badly, so a forged seed doesn't help", () => {
  const run = typeWords(timeWords(1), { maxMs: 60000 });
  const r = scoreRun({ board: "time60", seed: 2, ...run, dev: "k" });
  assert.ok(r.acc < 50, "acc " + r.acc);
});
test("the daily must be the real 30 words, all of them", () => {
  const n = utcDay(), ok = typeWords(dailyWords(n));
  const r = scoreRun({ board: "daily", day: n, ...ok, dev: "k" });
  assert.ok(!r.error, r.error); assert.equal(r.acc, 100);
  const half = typeWords(dailyWords(n).slice(0, 15));
  assert.match(scoreRun({ board: "daily", day: n, ...half, dev: "k" }).error, /match/);
});
test("garbage input is refused", () => {
  assert.ok(scoreRun({ board: "time60", seed: 1, keys: "ab", gaps: [0], dev: "k" }).error);
  assert.ok(scoreRun({ board: "time60", seed: 1, keys: "aé", gaps: [0, 100], dev: "k" }).error);
  assert.ok(scoreRun({ board: "time60", seed: -1, keys: "a", gaps: [0], dev: "k" }).error);
});
test("the word stream is deterministic per seed", () => {
  const a = wordGen(5), b = wordGen(5);
  for (let i = 0; i < 200; i++) assert.equal(a(), b());
  assert.equal(dailyWords(1).length, 30);
});

test("names: rules, reserved words and the offensive-word filter", () => {
  for (const ok of ["emmanuel", "Fast_Fingers", "canal_rat", "document", "raccoon42", "cockpit", "abc"]) assert.equal(nameProblem(ok), null, ok);
  for (const bad of ["ab", "a b c", "waytoolongusername1", "admin", "Clack", "fuck_you", "sh1t", "anal", "f4g"]) assert.ok(nameProblem(bad), bad);
});

test("sync: deltas add up across devices, sets merge without duplicates", () => {
  const blob = {};
  applyDeltas(blob, { keys: { a: { a: 10, e: 2 } }, data: { "2026-10-1": { words: 50, time: 60 } }, clacks: 30 });
  applyDeltas(blob, { keys: { a: { a: 5, e: 1 } }, data: { "2026-10-1": { words: 20, time: 30 } }, clacks: -10 });
  assert.deepEqual(blob.keys.a, { a: 15, e: 3 });
  assert.deepEqual(blob.data["2026-10-1"], { words: 70, time: 90 });
  assert.equal(blob.clacks, 20);
  mergeSets(blob, { history: [{ t: 1, wpm: 50, dev: "k" }], pb: { "time·60": { v: 70, kind: "wpm" } }, badges: { first: 200 }, owned: { ship: { dart: 1 } } });
  mergeSets(blob, { history: [{ t: 1, wpm: 50, dev: "k" }, { t: 2, wpm: 30, dev: "t" }], pb: { "time·60": { v: 60, kind: "wpm" } }, badges: { first: 100 }, owned: { trail: { laser: 1 } } });
  assert.equal(blob.history.length, 2);
  assert.equal(blob.pb["time·60"].v, 70);
  assert.equal(blob.badges.first, 100);
  assert.deepEqual(blob.owned, { ship: { dart: 1 }, trail: { laser: 1 } });
});
