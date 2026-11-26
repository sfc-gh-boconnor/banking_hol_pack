// Swap lab module codes (for example DA1 <-> DA2) across the repo.
// Usage (repo root):
//   node .cortex/skills/hol-module-rename/references/swap-codes.mjs --pairs DA1:DA2 --dry
//   node .cortex/skills/hol-module-rename/references/swap-codes.mjs --pairs DA1:DA2
// Run once per swap. The text swap is its own inverse, so a second run undoes the first.

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, readdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const args = process.argv.slice(2)
const DRY = args.includes("--dry")
const pairArg = args[args.indexOf("--pairs") + 1]
if (!pairArg) throw new Error("pass --pairs DA1:DA2 (one or more, comma separated)")

const MAP = {}
for (const p of pairArg.split(",")) {
  const [a, b] = p.trim().split(":")
  MAP[a.toUpperCase()] = b.toUpperCase()
  MAP[b.toUpperCase()] = a.toUpperCase()
}
const keys = Object.keys(MAP)
const lowerOf = (k) => k.toLowerCase()
const upperRe = new RegExp(`(?<![A-Za-z0-9])(${keys.join("|")})(?![A-Za-z0-9])`, "g")
const lowerRe = new RegExp(`(?<![A-Za-z0-9])(${keys.map(lowerOf).join("|")})(?![A-Za-z0-9])`, "g")

const swapText = (s) => s
  .replace(upperRe, (k) => MAP[k])
  .replace(lowerRe, (k) => lowerOf(MAP[k.toUpperCase()]))
const swapSeg = (seg) => {
  const m = seg.match(/^([a-z]+\d+)(?=[_.]|$)/i)
  if (!m || !MAP[m[1].toUpperCase()]) return seg
  return lowerOf(MAP[m[1].toUpperCase()]) + seg.slice(m[1].length)
}
const newPath = (p) => p.split("/").map(swapSeg).join("/")

const ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim()
process.chdir(ROOT)
const sh = (c) => execSync(c, { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").filter(Boolean)

// Never touch generated files, binaries, saved reviewer feedback or local plans.
const skip = (f) =>
  /^(node_modules|\.git|tester-feedback|\.snowflake)\//.test(f) ||
  /\.(png|mp4|jpg|gif|pdf|gz|ico|woff2?|zip|csv)$/i.test(f) ||
  f.endsWith(".generated.json") || f === "guide/index.html"

const files = [...new Set([...sh("git ls-files"), ...sh("git ls-files --others --exclude-standard"), ...sh("find media/out lab-companion/public/media -type f")])]
  .filter((f) => existsSync(f) && !skip(f))
const moves = files.map((from) => ({ from, to: newPath(from) })).filter((m) => m.from !== m.to)
const textFiles = files.filter((f) => !/\.(mp4|png)$/i.test(f) && f !== "")

console.log(`moves: ${moves.length}`)
for (const m of moves) console.log(`  ${m.from} -> ${m.to}`)
console.log(`text files to check: ${textFiles.length}`)
if (DRY) process.exit(0)

// 1. Move everything through a staging folder, then into place.
const STAGE = `${ROOT}/.code_swap_stage`
mkdirSync(STAGE, { recursive: true })
moves.forEach((m, i) => renameSync(m.from, `${STAGE}/${i}`))
moves.forEach((m, i) => {
  mkdirSync(dirname(m.to), { recursive: true })
  renameSync(`${STAGE}/${i}`, m.to)
})
for (const m of moves) {
  let d = dirname(m.from)
  while (d !== "." && existsSync(d) && readdirSync(d).length === 0) {
    rmdirSync(d)
    d = dirname(d)
  }
}
rmdirSync(STAGE)

// 2. Swap text in the files at their new paths (after the move, so no stale copies).
let changed = 0
for (const f of textFiles.map(newPath)) {
  if (!existsSync(f)) continue
  let src
  try { src = readFileSync(f, "utf8") } catch { continue }
  const out = swapText(src)
  if (out !== src) { writeFileSync(f, out); changed++ }
}
console.log(`text files changed: ${changed}`)

// 3. Saved manual-test results: move the entries to their new module keys.
for (const f of ["tester-feedback/manual-test-results.json", "tester-feedback/manual-test-coco.json"]) {
  if (!existsSync(f)) continue
  const src = readFileSync(f, "utf8")
  const obj = JSON.parse(src)
  if (!obj.modules) continue
  const swapped = {}
  for (const [k, v] of Object.entries(obj.modules)) swapped[MAP[k] ?? k] = v
  obj.modules = swapped
  writeFileSync(f, JSON.stringify(obj, null, 2) + (src.endsWith("\n") ? "\n" : ""))
}
console.log("done. Next: node lab-companion/scripts/sync-content.mjs, python3 guide/build_guide.py, npx tsc --noEmit")
