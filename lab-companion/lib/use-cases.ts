// Server-only: the live list of use cases for the home and use case pages.
//
// Installed labs get new use cases without a redeploy: BANKING_HOL.LAB.REFRESH_LAB_CONTENT_TASK
// fetches the public repo each morning, and this reads lib/use-cases.json from the account's
// copy of it. Each entry is checked against what this app version can show; anything else, or
// any error, falls back to the copy built into the app.
import { querySnowflake } from "@/lib/snowflake"
import { BUILT_IN_USE_CASES, MODULES, type UseCase } from "@/lib/content"
import { isDemoStop } from "@/lib/demo-stops"

const REPO_FILE = "@BANKING_HOL_SETUP.PUBLIC.HOL_REPO/branches/main/lab-companion/lib/use-cases.json"
const CACHE_MS = 10 * 60 * 1000
const BUSINESS = new Set(["Retail", "Corporate", "Every business"])

let cache: { at: number; list: UseCase[] } | null = null

const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Why an entry from the repo can't be shown by this app, or null when it can. */
export function invalidReason(u: any, moduleCodes: Set<string>): string | null {
  if (!u || typeof u !== "object") return "not an object"
  for (const f of ["id", "title", "question", "outcome"]) if (!isText(u[f])) return `missing ${f}`
  if (!/^[a-z0-9-]+$/.test(u.id)) return "id must be kebab-case"
  if (!BUSINESS.has(u.business)) return `unknown business ${u.business}`
  if (!isDate(u.addedOn)) return "addedOn must be YYYY-MM-DD"
  if (!Array.isArray(u.roles) || !u.roles.every(isText)) return "roles must be text"
  if (!Array.isArray(u.steps) || u.steps.length === 0) return "no steps"
  for (const s of u.steps) {
    if (!s || !moduleCodes.has(s.code)) return `unknown module ${s?.code}`
    if (!isText(s.why)) return `step ${s.code} has no why`
  }
  if (!u.demo || !isDemoStop(u.demo.tour, u.demo.stop)) return `unknown demo stop ${u.demo?.tour}/${u.demo?.stop}`
  if (u.whyNow !== undefined) {
    if (!Array.isArray(u.whyNow)) return "whyNow must be a list"
    for (const w of u.whyNow) {
      if (!isText(w?.text) || !isText(w?.source?.label) || !/^https:\/\//.test(w?.source?.url ?? "")) return "whyNow entry needs text and an https source"
      if (!isDate(w.published) || !isDate(w.read)) return "whyNow dates must be YYYY-MM-DD"
    }
  }
  return null
}

async function fromRepo(): Promise<UseCase[]> {
  const rows = await querySnowflake(`SELECT $1 AS U FROM ${REPO_FILE} (FILE_FORMAT => 'BANKING_HOL.LAB.JSON_FILE')`)
  const codes = new Set(MODULES.map((m) => m.code))
  const valid: UseCase[] = []
  for (const r of rows) {
    const u = typeof r.U === "string" ? JSON.parse(r.U) : r.U
    const why = invalidReason(u, codes)
    if (why) console.warn(new Date().toISOString(), `[use-cases] skipped ${u?.id ?? "?"} from the repo: ${why}`)
    else valid.push(u as UseCase)
  }
  return valid
}

/** Built-in use cases, overlaid by id with the valid ones from the account's repo, newest last. */
export async function getUseCases(): Promise<UseCase[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.list
  let list = BUILT_IN_USE_CASES
  try {
    const live = await fromRepo()
    if (live.length) {
      const byId = new Map(BUILT_IN_USE_CASES.map((u) => [u.id, u]))
      for (const u of live) byId.set(u.id, u)
      list = [...byId.values()]
    }
  } catch (e) {
    // accounts set up before the file format existed, or the repo can't be read: the built-in copy
    console.warn(new Date().toISOString(), "[use-cases] using the built-in list", e instanceof Error ? e.message : e)
  }
  cache = { at: Date.now(), list }
  return list
}

export async function getUseCase(id: string) {
  return (await getUseCases()).find((u) => u.id === id)
}

/** Use cases added after the first full catalogue (25 Nov 2026) show New for 60 days. */
const CATALOGUE_START = "2026-11-25"
export function isNew(u: UseCase, now = new Date()) {
  if (u.addedOn <= CATALOGUE_START) return false
  return now.getTime() - new Date(u.addedOn + "T00:00:00Z").getTime() < 60 * 24 * 3600 * 1000
}
