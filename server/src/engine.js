// Rebuilds a run from its keystrokes and scores it the same way the page does.
// Mirrors index.html: seededRng, dailyWords, wordGen and the test engine (inputCharTest,
// typeSpace, typeBackspace, commitWord). If you change those in the page, change them here.
import { WORDS } from "./words.js";

export const DAILY_WORDS = 30;
export const DAILY_EPOCH = Date.UTC(2026, 8, 30);
export const MAX_WPM = 250;
const BS = "\b";

/** UTC day number on the same scale as the daily (day 1 = 30 Sep 2026). */
export const utcDay = (ms = Date.now()) => Math.floor((ms - DAILY_EPOCH) / 864e5) + 1;

export function seededRng(seed) {           // mulberry32, identical to the page
  return () => {
    seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function dailyWords(n) {
  const r = seededRng(n * 7919 + 104729), out = [], used = new Set();
  while (out.length < DAILY_WORDS) { const w = WORDS[Math.floor(r() * WORDS.length)]; if (!used.has(w)) { used.add(w); out.push(w); } }
  return out;
}
/** Endless word stream for a seeded time run (same no-repeat window as the page's pickWord). */
export function wordGen(seed) {
  const r = seededRng(seed >>> 0), recent = [];
  return () => {
    let w, tries = 0;
    do { w = WORDS[Math.floor(r() * WORDS.length)]; tries++; } while (recent.includes(w) && tries < 25);
    recent.push(w); if (recent.length > 40) recent.shift();
    return w;
  };
}

/** Replays keystrokes. keys: one char per event ("\b" = backspace); gaps: ms since the previous event. */
export function replay(nextWord, keys, gaps, stopAfterWords = Infinity) {
  const words = []; const word = i => { while (words.length <= i) words.push(nextWord()); return words[i]; };
  let idx = 0, typed = "", correct = 0, total = 0, done = 0, t = 0, end = 0, finished = false, extra = 0;
  const commit = () => {
    const w = word(idx);
    for (let i = 0; i < w.length; i++) { total++; if (typed[i] === w[i]) correct++; }
    total++; correct++; done++; idx++; typed = "";            // the space always counts as correct
    if (done >= stopAfterWords) { finished = true; end = t; }
  };
  for (let i = 0; i < keys.length; i++) {
    t += gaps[i];
    if (finished) { extra++; continue; }
    const ch = keys[i];
    if (ch === BS) typed = typed.slice(0, -1);
    else if (ch === " ") { if (typed.length) commit(); }
    else { typed += ch; if (typed.length >= word(idx).length) commit(); }
  }
  return { correct, total, words: done, end: finished ? end : t, finished, extra };
}

/** Too-regular timing is the main sign of a script. Returns a reason string, or null. */
export function rhythmProblem(gaps, dev) {
  const g = gaps.slice(1).filter(x => x > 0);               // touch keyboards insert bursts at 0 ms
  if (g.length < 40) return null;
  const mean = g.reduce((s, x) => s + x, 0) / g.length;
  const sd = Math.sqrt(g.reduce((s, x) => s + (x - mean) ** 2, 0) / g.length);
  if (sd / mean < 0.15) return "typing rhythm looks automated";
  const sorted = [...g].sort((a, b) => a - b), median = sorted[sorted.length >> 1];
  if (dev === "k" && median < 25) return "typing rhythm looks automated";
  return null;
}

/**
 * Verifies a submitted run. Returns { wpm, acc } computed here (never trusts the page's numbers)
 * or { error }.
 */
export function scoreRun({ board, day, seed, keys, gaps, dev }) {
  if (typeof keys !== "string" || !Array.isArray(gaps) || keys.length !== gaps.length) return { error: "bad run data" };
  if (!keys.length || keys.length > 4000) return { error: "bad run data" };
  for (let i = 0; i < keys.length; i++) {
    const c = keys.charCodeAt(i), g = gaps[i];
    if (!(c === 8 || (c >= 33 && c <= 126) || c === 32)) return { error: "bad run data" };
    if (!Number.isInteger(g) || g < 0 || g > 60000) return { error: "bad run data" };
  }
  if (gaps[0] !== 0) return { error: "bad run data" };
  let r, secs;
  if (board === "daily") {
    const words = dailyWords(day); let i = 0;
    r = replay(() => words[i++] ?? "", keys, gaps, DAILY_WORDS);
    if (!r.finished || r.extra) return { error: "the run doesn't match today's words" };
    secs = Math.max(1, r.end / 1000);
  } else {
    const limit = board === "time30" ? 30 : 60;
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) return { error: "bad run data" };
    r = replay(wordGen(seed), keys, gaps);
    if (r.end > limit * 1000 + 600) return { error: "the run is longer than the time limit" };
    secs = limit;
  }
  const wpm = Math.round((r.correct / 5) / (secs / 60)) || 0;
  const acc = r.total ? Math.round(r.correct / r.total * 100) : 100;
  if (wpm > MAX_WPM) return { error: "that's faster than the leaderboard allows" };
  const why = rhythmProblem(gaps, dev);
  if (why) return { error: why };
  return { wpm, acc };
}
