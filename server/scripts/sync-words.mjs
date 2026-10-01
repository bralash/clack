// Copies the WORDS list out of ../index.html into src/words.js, so the server rebuilds exactly
// the same daily words and seeded runs as the page. Runs before `dev` and `deploy`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "..", "index.html"), "utf8");
const m = html.match(/const WORDS = (\[\.\.\.new Set\(`[\s\S]*?`\.trim\(\)\.split\(\/\\s\+\/\)\)\]);/);
if (!m) throw new Error("couldn't find the WORDS list in index.html");
writeFileSync(join(here, "..", "src", "words.js"),
  "// Generated from index.html by scripts/sync-words.mjs. Do not edit by hand.\nexport const WORDS = " + m[1] + ";\n");
console.log("src/words.js updated");
