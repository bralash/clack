// Cuts brand/ships.png (the ChatGPT sprite sheet) into one sprite per ship in brand/ships/,
// using headless Edge's canvas. Ships are separated by their outlines, not by a grid, because
// the sheet's ships overlap its cell lines. Edge pixels are cleaned of the coloured halo left by
// the background removal ("defringe"): their colour is replaced with the nearest solid hull colour.
// Usage (with the site served on :5173, e.g. `npm run site`): node scripts/cut-ships.mjs
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "brand", "ships");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", PORT = 9346;
const NAMES = ["arrow", "dart", "stealth", "saucer", "pixel", "comet", "obsidian"];   // sheet order
const SIZE = 256;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGE = `(async () => {
  const im = new Image(); im.src = "/brand/ships.png?" + Date.now(); await im.decode();
  const W = im.naturalWidth, H = im.naturalHeight, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const src = g.getImageData(0, 0, W, H).data, N = W * H;
  // 1. solid pixels -> connected components (4-neighbour flood fill)
  const lab = new Int32Array(N).fill(-1), sizes = [];
  for (let p = 0; p < N; p++) {
    if (lab[p] !== -1 || src[p * 4 + 3] < 110) continue;
    const id = sizes.length; let n = 0; const st = [p]; lab[p] = id;
    while (st.length) { const q = st.pop(); n++; const x = q % W, y = (q - x) / W;
      for (const r of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1])
        if (r >= 0 && lab[r] === -1 && src[r * 4 + 3] >= 110) { lab[r] = id; st.push(r); } }
    sizes.push(n);
  }
  // the 7 biggest are ships; smaller islands join the nearest ship below
  const big = sizes.map((n, i) => [n, i]).sort((a, b) => b[0] - a[0]).slice(0, 7).map(x => x[1]);
  const box = {}; for (const id of big) box[id] = [1e9, 1e9, -1, -1];
  for (let p = 0; p < N; p++) { const id = lab[p]; if (box[id]) { const x = p % W, y = (p - x) / W, b = box[id];
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } }
  // order: by row (top/bottom half), then left to right
  const order = big.slice().sort((a, b) => { const ra = box[a][1] + box[a][3] > H ? 1 : 0, rb = box[b][1] + box[b][3] > H ? 1 : 0;
    return ra - rb || (box[a][0] - box[b][0]); });
  // 2. every visible pixel belongs to the ship whose solid body is nearest (grow labels outward, up to 14px)
  const own = new Int32Array(N).fill(-1); let front = [];
  for (let p = 0; p < N; p++) if (box[lab[p]]) { own[p] = lab[p]; front.push(p); }
  for (let step = 0; step < 14 && front.length; step++) { const next = [];
    for (const q of front) { const x = q % W, y = (q - x) / W;
      for (const r of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1])
        if (r >= 0 && own[r] === -1 && src[r * 4 + 3] > 0) { own[r] = own[q]; next.push(r); } }
    front = next; }
  // 3. defringe: edge pixels (alpha < 235) take the colour of the nearest solid pixel of the same ship
  const out = new Uint8ClampedArray(src), solid = p => src[p * 4 + 3] >= 235;
  const nearC = new Int32Array(N).fill(-1); let fr = [];
  for (let p = 0; p < N; p++) if (own[p] !== -1 && solid(p)) { nearC[p] = p; fr.push(p); }
  for (let step = 0; step < 16 && fr.length; step++) { const next = [];
    for (const q of fr) { const x = q % W, y = (q - x) / W;
      for (const r of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1])
        if (r >= 0 && nearC[r] === -1 && own[r] === own[q]) { nearC[r] = nearC[q]; next.push(r); } }
    fr = next; }
  let fixed = 0;
  for (let p = 0; p < N; p++) {
    if (own[p] === -1) { out[p * 4 + 3] = 0; continue; }                     // stray noise far from any ship
    const a = src[p * 4 + 3];
    if (a < 235 && nearC[p] !== -1) { const s = nearC[p] * 4;
      out[p * 4] = src[s]; out[p * 4 + 1] = src[s + 1]; out[p * 4 + 2] = src[s + 2]; fixed++;
      out[p * 4 + 3] = a < 24 ? 0 : a; }                                    // drop the faintest haze
  }
  const clean = document.createElement("canvas"); clean.width = W; clean.height = H;
  clean.getContext("2d").putImageData(new ImageData(out, W, H), 0, 0);
  // 4. one square sprite per ship, centred, nose up, ~8% padding
  const sprites = [];
  for (const id of order) {
    let [x0, y0, x1, y1] = box[id]; const pad = 18; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const one = document.createElement("canvas"); one.width = W; one.height = H; const og = one.getContext("2d");
    const piece = new Uint8ClampedArray(out.length);
    for (let p = 0; p < N; p++) if (own[p] === id) { piece.set(out.subarray(p * 4, p * 4 + 4), p * 4); }
    og.putImageData(new ImageData(piece, W, H), 0, 0);
    const bw = x1 - x0, bh = y1 - y0, side = Math.max(bw, bh) * 1.08, s = ${SIZE} / side;
    const t = document.createElement("canvas"); t.width = t.height = ${SIZE}; const tg = t.getContext("2d");
    tg.imageSmoothingQuality = "high";
    tg.drawImage(one, x0, y0, bw, bh, (${SIZE} - bw * s) / 2, (${SIZE} - bh * s) / 2, bw * s, bh * s);
    sprites.push({ png: t.toDataURL("image/png"), w: bw, h: bh });
  }
  return { sprites, fixed, components: sizes.length };
})()`;

let ws, id = 0; const pend = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(ROOT, "server", ".wrangler", "edge-ships")}`, "--no-first-run", "http://localhost:5173/"], { stdio: "ignore" });
try {
  let t; for (let i = 0; i < 50 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === "page"); } catch { } if (!t) await sleep(200); }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data), p = pend.get(m.id); if (p) { pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await sleep(1500);
  const r = await send("Runtime.evaluate", { expression: PAGE, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
  const { sprites, fixed, components } = r.result.value;
  mkdirSync(OUT, { recursive: true });
  sprites.forEach((s, i) => { writeFileSync(join(OUT, NAMES[i] + ".png"), Buffer.from(s.png.split(",")[1], "base64"));
    console.log(NAMES[i].padEnd(9), `${s.w}×${s.h} px in the sheet`); });
  console.log(`${components} pieces found, ${fixed} edge pixels recoloured`);
} catch (e) { console.error("failed:", e.message); }
finally { spawnSync("taskkill", ["/PID", String(edge.pid), "/T", "/F"]); process.exit(0); }
