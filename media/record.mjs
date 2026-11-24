// Records one or more step clips and encodes them as small looping MP4s.
//   npm run record -- de1_dbt_tab          one clip
//   npm run record -- --all                every script in scripts/
//   npm run record -- de1_dbt_tab --headed watch it run
//   npm run record -- ops1_cowork ops3_cowork --cowork   CoWork clips: one visible browser; sign
//     in to CoWork once when asked, then every clip records in that session (CoWork's sign-in
//     doesn't survive a browser restart, so the normal one-browser-per-clip mode can't film it)
// Each script in scripts/ exports: name, optional viewport {width, height} (browser
// window size; smaller gives a compact layout), optional outputWidth, optional
// crop {x, y, width, height} (in viewport pixels), and run({ page, mark }). Call mark() just before the
// actions to show; everything before it (page loads) is trimmed off.
import { readdirSync, mkdirSync, rmSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { openBrowser, config, ROOT } from "./lib.mjs"

const args = process.argv.slice(2)
const headed = args.includes("--headed")
const gif = args.includes("--gif") // also write a GIF next to the MP4
const cowork = args.includes("--cowork")
const names = args.includes("--all")
  ? readdirSync(path.join(ROOT, "scripts")).filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, ""))
  : args.filter((a) => !a.startsWith("--"))
if (!names.length) {
  console.error("Usage: npm run record -- <script-name> | --all [--headed] [--gif]")
  process.exit(1)
}

const outDir = path.join(ROOT, "out")
mkdirSync(outDir, { recursive: true })
let failed = 0

// --cowork: one shared browser, signed in to CoWork before the first clip
let shared
if (cowork) {
  const first = await import(path.join(ROOT, "scripts", `${names[0]}.mjs`))
  shared = await openBrowser({ headless: false, recordDir: path.join(ROOT, ".raw", "_cowork"), viewport: first.viewport })
  const login = shared.pages()[0] ?? (await shared.newPage())
  await login.goto(config.snowsightUrl.replace("app.snowflake.com", "ai.snowflake.com").replace(/\/$/, ""))
  console.log("Sign in to CoWork in the browser window (up to 5 minutes)...")
  await login.waitForURL((u) => u.hostname === "ai.snowflake.com", { timeout: 300_000 })
  await login.getByRole("textbox").first().waitFor({ timeout: 300_000 })
  console.log("Signed in. Recording.")
}

for (const name of names) {
  const script = await import(path.join(ROOT, "scripts", `${name}.mjs`))
  const rawDir = path.join(ROOT, ".raw", name)
  rmSync(rawDir, { recursive: true, force: true })

  const context = shared ?? (await openBrowser({ headless: !headed, recordDir: rawDir, viewport: script.viewport }))
  const page = shared ? await shared.newPage() : context.pages()[0] ?? (await context.newPage())
  const done = () => (shared ? page.close() : context.close())
  const started = Date.now()
  let startAt = 0
  const mark = () => (startAt = (Date.now() - started) / 1000)

  try {
    await page.goto(config.snowsightUrl)
    await script.run({ page, mark })
    await page.waitForTimeout(1200) // hold the end state briefly
  } catch (err) {
    // A failing script usually means Snowsight changed and the step wording may be stale too
    console.error(`FAILED ${name}: ${err.message.split("\n")[0]}`)
    const shot = path.join(outDir, `${name}.failed.png`)
    await page.screenshot({ path: shot }).catch(() => {})
    console.error(`  screenshot of the page at failure: ${path.relative(ROOT, shot)}`)
    console.error(`  ${err.stack.split("\n").find((l) => l.includes("/media/") && !l.includes("node_modules"))?.trim() ?? ""}`)
    failed++
    await done()
    continue
  }
  const video = page.video()
  await done()
  const raw = await video.path()
  if (process.env.DEBUG) console.log(`  trim at ${startAt}s of`, execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw]).toString().trim())

  const { fps, crf, maxKb } = config.output
  const width = script.outputWidth ?? config.output.width
  const c = script.crop
  const filters = [c && `crop=${c.width}:${c.height}:${c.x}:${c.y}`, `fps=${fps}`, `scale='min(${width},iw)':-2:flags=lanczos`]
    .filter(Boolean)
    .join(",")
  const out = path.join(outDir, `${script.name ?? name}.mp4`)
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    // -ss after -i trims frame-accurately; Playwright's raw video has few keyframes,
    // so seeking before -i snaps back to the start
    "-i", raw, "-ss", String(Math.max(0, startAt - 0.3)),
    "-vf", filters, "-an",
    "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", out,
  ])
  const kb = Math.round(statSync(out).size / 1024)
  console.log(`${kb > maxKb ? "TOO BIG" : "ok"}  ${path.relative(ROOT, out)}  ${kb} KB`)

  if (gif) {
    // Built from the MP4 with a per-clip palette, which keeps GIFs readable at 64 colours
    const gifOut = out.replace(/\.mp4$/, ".gif")
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-i", out,
      "-vf", "split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
      "-loop", "0", gifOut,
    ])
    const gkb = Math.round(statSync(gifOut).size / 1024)
    console.log(`${gkb > maxKb ? "TOO BIG" : "ok"}  ${path.relative(ROOT, gifOut)}  ${gkb} KB`)
  }
}

if (shared) await shared.close()
rmSync(path.join(ROOT, ".raw"), { recursive: true, force: true })
process.exit(failed ? 1 : 0)
