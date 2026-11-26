// Trim a hand-recorded take (DA3_MANUAL=1 npm run record -- <name> --headed) down to the clicks.
//   node trim.mjs <name> --sheet            contact sheet, one frame every 2 s: out/<name>.sheet.png
//   node trim.mjs <name> 12-42 86-95.7      keep these second ranges (joined), encode out/<name>.mp4
// The first run moves the full take to out/<name>.take.mp4 and always trims from that, so
// you can re-cut as often as you like. Also writes the end frame to out/<name>.end.png.
import { existsSync, renameSync, statSync, mkdirSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { config, ROOT } from "./lib.mjs"

const [name, ...args] = process.argv.slice(2)
if (!name || !args.length) {
  console.error("Usage: node trim.mjs <name> --sheet | <start>-<end> [<start>-<end>...]")
  process.exit(1)
}
const out = path.join(ROOT, "out")
const clip = path.join(out, `${name}.mp4`)
const take = path.join(out, `${name}.take.mp4`)
if (!existsSync(take)) {
  if (!existsSync(clip)) throw new Error(`no out/${name}.mp4: record the take first`)
  renameSync(clip, take)
}
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a])
const duration = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", take]).toString().trim()

if (args[0] === "--sheet") {
  // -ss after -i: hand takes have few keyframes
  const dir = path.join(out, `.${name}_frames`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir)
  ff("-i", take, "-vf", "fps=1/2,scale=320:-1", path.join(dir, "f_%03d.png"))
  ff("-i", path.join(dir, "f_%03d.png"), "-filter_complex", "tile=6x8", "-frames:v", "1", path.join(out, `${name}.sheet.png`))
  rmSync(dir, { recursive: true, force: true })
  console.log(`take is ${duration} s; out/${name}.sheet.png reads left to right, 2 s per frame (frame n = ${"(n-1)*2"} s, 48 frames per sheet)`)
  process.exit(0)
}

const ranges = args.map((r) => r.split("-").map(Number))
const parts = ranges.map(([a, b], i) => `[0:v]trim=${a}:${b},setpts=PTS-STARTPTS[p${i}]`)
const joined = `${ranges.map((_, i) => `[p${i}]`).join("")}concat=n=${ranges.length}:v=1[c]`
const { fps, crf, maxKb } = config.output
ff("-i", take, "-filter_complex", `${parts.join(";")};${joined};[c]fps=${fps},scale='min(800,iw)':-2:flags=lanczos[o]`,
  "-map", "[o]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", clip)
ff("-sseof", "-1", "-i", clip, "-frames:v", "1", path.join(out, `${name}.end.png`))
const kb = Math.round(statSync(clip).size / 1024)
console.log(`${kb > maxKb ? "TOO BIG" : "ok"}  out/${name}.mp4  ${kb} KB (take ${duration} s); end frame out/${name}.end.png`)
