// Cross-device sync. Two kinds of data:
//  - counters (per-key accuracy, daily activity, clacks) are synced as deltas: each device sends
//    what changed since its last sync, and the server adds it, so nothing is counted twice;
//  - sets (history, personal bests, badges, store items, ...) are merged: union, max or earliest.
// mergeSets is copied into index.html; keep the two in step.

const n = v => (Number.isFinite(+v) ? +v : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n(v))));
const isObj = v => v && typeof v === "object" && !Array.isArray(v);

export function applyDeltas(blob, d) {
  if (!isObj(d)) return;
  blob.keys = isObj(blob.keys) ? blob.keys : {};
  if (isObj(d.keys)) for (const [k, v] of Object.entries(d.keys)) {
    if (k.length !== 1 || !isObj(v)) continue;
    const e = blob.keys[k] || (blob.keys[k] = { a: 0, e: 0 });
    e.a = Math.max(0, e.a + clamp(v.a, -1e6, 1e6)); e.e = Math.max(0, Math.min(e.a, e.e + clamp(v.e, -1e6, 1e6)));
  }
  blob.data = isObj(blob.data) ? blob.data : {};
  if (isObj(d.data)) for (const [day, v] of Object.entries(d.data)) {
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(day) || !isObj(v)) continue;
    const r = blob.data[day] || (blob.data[day] = { words: 0, time: 0 });
    r.words = Math.max(0, r.words + clamp(v.words, -1e5, 1e5)); r.time = Math.max(0, r.time + clamp(v.time, -864e2, 864e2));
  }
  blob.clacks = Math.max(0, n(blob.clacks) + clamp(d.clacks, -1e6, 1e5));
}

export function mergeSets(into, from) {
  if (!isObj(from)) return into;
  const hist = new Map();
  for (const h of [...(Array.isArray(into.history) ? into.history : []), ...(Array.isArray(from.history) ? from.history : [])]) {
    if (!isObj(h) || !Number.isFinite(h.t)) continue;
    const e = { t: h.t, wpm: clamp(h.wpm, 0, 400) }; if (h.dev === "t" || h.dev === "k") e.dev = h.dev;
    if (typeof h.m === "string" && h.m.length <= 24) e.m = h.m;              // what kind of run, e.g. "time·60"
    const key = e.t + ":" + e.wpm, prev = hist.get(key);
    hist.set(key, prev ? { ...e, ...prev } : e);                              // keep fields either copy has
  }
  into.history = [...hist.values()].sort((a, b) => a.t - b.t).slice(-120);
  const best = (a, b) => {                                  // personal bests: keep the higher value
    a = isObj(a) ? a : {};
    if (isObj(b)) for (const [k, v] of Object.entries(b))
      if (isObj(v) && Number.isFinite(v.v) && (!a[k] || v.v > a[k].v)) a[k] = { v: v.v, kind: v.kind === "score" ? "score" : "wpm" };
    return a;
  };
  into.pb = best(into.pb, from.pb);
  into.pbDev = isObj(into.pbDev) ? into.pbDev : {};
  for (const dv of ["k", "t"]) into.pbDev[dv] = best(into.pbDev[dv], isObj(from.pbDev) ? from.pbDev[dv] : null);
  into.badges = isObj(into.badges) ? into.badges : {};      // earliest unlock wins
  if (isObj(from.badges)) for (const [k, v] of Object.entries(from.badges))
    if (Number.isFinite(v) && (!into.badges[k] || v < into.badges[k])) into.badges[k] = v;
  for (const f of ["modes", "puSeen"]) {
    into[f] = isObj(into[f]) ? into[f] : {};
    if (isObj(from[f])) for (const k of Object.keys(from[f])) into[f][k] = 1;
  }
  into.daily = isObj(into.daily) ? into.daily : {};         // the first result for a day is the official one
  if (isObj(from.daily)) for (const [k, v] of Object.entries(from.daily)) if (isObj(v) && !into.daily[k]) into.daily[k] = v;
  into.owned = isObj(into.owned) ? into.owned : {};
  if (isObj(from.owned)) for (const kind of ["ship", "trail"]) {
    into.owned[kind] = isObj(into.owned[kind]) ? into.owned[kind] : {};
    if (isObj(from.owned[kind])) for (const id of Object.keys(from.owned[kind])) into.owned[kind][id] = 1;
  }
  into.school = isObj(into.school) ? into.school : {};
  if (isObj(from.school)) {
    into.school.stars = isObj(into.school.stars) ? into.school.stars : {};
    if (isObj(from.school.stars)) for (const [k, v] of Object.entries(from.school.stars))
      into.school.stars[k] = Math.max(n(into.school.stars[k]), clamp(v, 0, 3));
    into.school.asked = !!(into.school.asked || from.school.asked);
  }
  return into;
}
