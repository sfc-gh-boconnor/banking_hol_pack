// Server-only: the "Fast-forward" button and the module reset. Fast-forward starts the task
// LAB.RUN_CATCHUP_TASK (setup/11b_catchup_runner.sql) as the app's own role, HOL_ADMIN. The task runs
// each catch-up script, which builds as HOL_PARTICIPANT, logs to LAB.CATCHUP_LOG and records what it
// built in LAB.CATCHUP_OBJECTS. The app's restricted caller's rights session can't run the scripts
// itself: it can't reach the Cortex AI functions in the shared SNOWFLAKE database.
import { querySnowflake } from "@/lib/snowflake"
import { currentUser } from "@/lib/lab"

const LOG = "BANKING_HOL.LAB.CATCHUP_LOG"
const OBJECTS = "BANKING_HOL.LAB.CATCHUP_OBJECTS"

/** The only names that reach SQL. Must match the list in RUN_CATCHUP. */
export const CATCHUP_NAMES = ["core_analytics", "client_360", "ds1_model", "ds4_predictions", "gov4_tags"] as const
export type CatchupName = (typeof CATCHUP_NAMES)[number]

/** The modules each catch-up builds, so a module page knows when Fast-forward did its work. */
export const CATCHUP_MODULES: Record<CatchupName, string[]> = {
  core_analytics: ["DE1", "DA1"],
  client_360: ["DA2"],
  ds1_model: ["DS1"],
  ds4_predictions: ["DS4"],
  gov4_tags: ["GOV4"],
}

export type CatchupRun = { CATCHUP: string; STATUS: "RUNNING" | "DONE" | "FAILED" | "RESET"; STARTED_AT: string; FINISHED_AT: string | null; ERROR_MESSAGE: string | null; STEP_NO: number | null; STEP_TOTAL: number | null; STEP_NAME: string | null; ELAPSED_S: number }

export function isCatchupName(n: unknown): n is CatchupName {
  return typeof n === "string" && (CATCHUP_NAMES as readonly string[]).includes(n)
}

/** A run still marked RUNNING after 30 minutes is treated as dead. */
const STALE_MINUTES = 30

/** The attendee's latest run of each catch-up. */
export async function latestRuns(user: string): Promise<CatchupRun[]> {
  return (await querySnowflake(
    `SELECT CATCHUP, IFF(STATUS = 'RUNNING' AND STARTED_AT < DATEADD('minute', -${STALE_MINUTES}, CURRENT_TIMESTAMP()), 'FAILED', STATUS) AS STATUS,
            STARTED_AT::VARCHAR AS STARTED_AT, FINISHED_AT::VARCHAR AS FINISHED_AT, ERROR_MESSAGE,
            STEP_NO, STEP_TOTAL, STEP_NAME, DATEDIFF('second', STARTED_AT, COALESCE(FINISHED_AT, CURRENT_TIMESTAMP())) AS ELAPSED_S
     FROM ${LOG} WHERE USER_NAME = ?
     QUALIFY ROW_NUMBER() OVER (PARTITION BY CATCHUP ORDER BY STARTED_AT DESC) = 1`,
    { binds: [user] },
  )) as CatchupRun[]
}

/** User names go into the task config as JSON inside $$...$$, so refuse anything that could break out of it. */
function safeUser(user: string): string {
  if (!/^[A-Za-z0-9_.@-]+$/.test(user)) throw new Error(`Fast-forward can't run for the user name ${user}.`)
  return user
}

/** Start the catch-ups, in order, for the attendee. Returns once the task has been started. */
export async function startCatchups(names: CatchupName[]): Promise<void> {
  const user = safeUser(await currentUser())
  if (!names.every(isCatchupName)) throw new Error("Unknown catch-up")
  const config = JSON.stringify({ names: names.join(","), user })
  await querySnowflake(`EXECUTE TASK BANKING_HOL.LAB.RUN_CATCHUP_TASK USING CONFIG = $$${config}$$`)
}

/** The catch-ups that built this module for the attendee, with how many objects each left behind. */
export async function fastForwardsFor(code: string, user: string): Promise<{ catchup: CatchupName; objects: number }[]> {
  const names = CATCHUP_NAMES.filter((n) => CATCHUP_MODULES[n].includes(code))
  if (!names.length) return []
  const rows = await querySnowflake(
    `SELECT CATCHUP, COUNT(DISTINCT OBJECT_NAME) AS N FROM ${OBJECTS}
     WHERE USER_NAME = ? AND CATCHUP IN (${names.map(() => "?").join(", ")}) GROUP BY CATCHUP`,
    { binds: [user, ...names] },
  )
  return rows.filter((r) => isCatchupName(r.CATCHUP) && Number(r.N) > 0).map((r) => ({ catchup: r.CATCHUP as CatchupName, objects: Number(r.N) }))
}

/** List (dryRun) or drop what a catch-up built for the attendee. */
export async function resetCatchup(name: CatchupName, user: string, dryRun: boolean): Promise<string[]> {
  const [row] = await querySnowflake("CALL BANKING_HOL.LAB.RESET_CATCHUP(?, ?, ?)", { binds: [name, user, dryRun] })
  const value = row ? Object.values(row)[0] : null
  const result = typeof value === "string" ? JSON.parse(value) : value
  return Array.isArray(result?.objects) ? result.objects.map(String) : []
}

export { currentUser }
