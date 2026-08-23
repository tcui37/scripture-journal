import fs from "fs";
import path from "path";

const roots = [
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/login/page.tsx",
  "src/app/signup/page.tsx",
  "src/app/account/page.tsx",
  "src/app/files/page.tsx",
];
const tests = fs
  .readdirSync("src/lib")
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => path.join("src/lib", f));

const all = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(e.name)) all.push(p);
  }
}
walk("src");

const code = new Map(all.map((f) => [f, fs.readFileSync(f, "utf8")]));

function resolve(from, spec) {
  let target;
  if (spec.startsWith("@/")) target = path.join("src", spec.slice(2));
  else if (spec.startsWith(".")) target = path.normalize(path.join(path.dirname(from), spec));
  else return null;
  for (const ext of ["", ".ts", ".tsx", ".css", "/index.ts", "/index.tsx"]) {
    const candidate = target + ext;
    if (code.has(candidate)) return candidate;
  }
  return null;
}

const seen = new Set();
const queue = [...roots, ...tests];
while (queue.length) {
  const f = queue.pop();
  if (seen.has(f) || !code.has(f)) continue;
  seen.add(f);
  const src = code.get(f);
  for (const m of src.matchAll(
    /(?:import|export)[^'"]*from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g,
  )) {
    const spec = m[1] || m[2];
    const resolved = resolve(f, spec);
    if (resolved && !seen.has(resolved)) queue.push(resolved);
  }
}

const unused = [...code.keys()].filter((f) => !seen.has(f)).sort();
console.log(`reachable ${seen.size} of ${all.length}`);
console.log("unreachable:");
for (const f of unused) console.log(f);
