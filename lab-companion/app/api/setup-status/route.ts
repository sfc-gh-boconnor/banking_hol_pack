/**
 * GET /api/setup-status - how far the account's background lab setup (LAB.PROVISION_LAB) has got:
 * one summary row and every step. Accounts provisioned before the background setup have no run
 * (status NOT_STARTED) or no views (null), and the app opens as normal.
 */
import { querySnowflake } from "@/lib/snowflake"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [summary] = await querySnowflake(
      `SELECT STATUS, STEPS_DONE, STEP_TOTAL, CURRENT_STEP, ERROR_MESSAGE, STARTED_AT::VARCHAR AS STARTED_AT
         FROM BANKING_HOL.LAB.SETUP_SUMMARY`,
    )
    const steps =
      summary && summary.STATUS !== "NOT_STARTED" && summary.STATUS !== "READY"
        ? await querySnowflake(
            `SELECT STEP_NO, STEP_NAME, STATUS, MINUTES, ERROR_MESSAGE FROM BANKING_HOL.LAB.SETUP_STATUS ORDER BY STEP_NO`,
          )
        : []
    return Response.json({ summary: summary ?? null, steps })
  } catch (e) {
    // no SETUP_SUMMARY view: an account set up the older way, so there's nothing to wait for
    console.warn(new Date().toISOString(), "[setup-status] unavailable", e)
    return Response.json({ summary: null, steps: [] })
  }
}
