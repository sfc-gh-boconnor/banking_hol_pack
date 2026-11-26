// Server-only: the "Fast-forward" button. Runs LAB.RUN_CATCHUP (setup/11b_catchup_runner.sql)
// as the attendee, so what a catch-up builds belongs to them. The procedure logs to LAB.CATCHUP_LOG.
import { querySnowflake, querySnowflakeLongRunning } from "@/lib/snowflake"
import { callersRightsActive } from "@/lib/run-as"
import { currentUser } from "@/lib/lab"

const LOG = "BANKING_HOL.LAB.CATCHUP_LOG"

/** The only names that reach SQL as a bind. Must match the list in RUN_CATCHUP. */
export const CATCHUP_NAMES = ["core_analytics", "client_360", "ds1_model", "ds4_predictions", "gov4_tags"] as const
export type CatchupName = (typeof CATCHUP_NAMES)[number]

export type CatchupRun = { CATCHUP: string; STATUS: "RUNNING" | "DONE" | "FAILED"; STARTED_AT: string; FINISHED_AT: string | null; ERROR_MESSAGE: string | null; STEP_NO: number | null; STEP_TOTAL: number | null; STEP_NAME: string | null; ELAPSED_S: number }

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

/** Run the catch-ups one after another in the background. Returns once the first call has been submitted. */
export async function startCatchups(names: CatchupName[]): Promise<void> {
  const opts = callersRightsActive() ? { callersRights: true } : {}
  const chain = (async () => {
    for (const name of names) {
      await querySnowflakeLongRunning("CALL BANKING_HOL.LAB.RUN_CATCHUP(?)", { ...opts, binds: [name] })
    }
  })().catch((e) => console.error(new Date().toISOString(), "[catchup] run failed", e instanceof Error ? e.message : e))
  // let the first submission read the request headers before the response ends
  await Promise.race([chain, new Promise((r) => setTimeout(r, 2_000))])
}

export { currentUser }
