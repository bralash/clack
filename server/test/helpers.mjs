// Builds keystroke logs the way the page records them: one char per event, gaps in ms.
import { dailyWords, wordGen } from "../src/engine.js";

let s = 99;
const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);

/** Types `words` like a person: uneven gaps, a space after each word, optional typos. */
export function typeWords(words, { gapMin = 80, gapMax = 220, typoEvery = 0, maxMs = Infinity } = {}) {
  let keys = "", gaps = [], t = 0, n = 0;
  const press = ch => { const g = keys.length ? Math.round(gapMin + rand() * (gapMax - gapMin)) : 0;
    if (t + g > maxMs) return false; t += g; keys += ch; gaps.push(g); return true; };
  words.forEach((w, i) => {
    if (t > maxMs) return;
    if (i && !press(" ")) { t = Infinity; return; }          // the page stops recording after the last word
    for (const ch of w) { n++; if (!press(typoEvery && n % typoEvery === 0 ? "q" === ch ? "z" : "q" : ch)) { t = Infinity; return; } }
  });
  t = gaps.reduce((a, b) => a + b, 0);
  return { keys, gaps, t };
}
export const timeWords = (seed, n = 400) => { const g = wordGen(seed); return Array.from({ length: n }, g); };
export { dailyWords };
