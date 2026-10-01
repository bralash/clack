// Serves the site (the repo root) on http://localhost:5173 for local testing with the API.
// The page must come from localhost (not file://) so it finds the local API and passes CORS.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
const PORT = 5173;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon" };

createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(root, p));
  if (!file.startsWith(root) || /[\\/](server|node_modules|\.git)[\\/]/.test(file.slice(root.length))) { res.writeHead(404); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(PORT, () => console.log(`Clack on http://localhost:${PORT}`));
