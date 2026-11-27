/**
 * GET /api/setup-status - how far the account's background lab setup (LAB.PROVISION_LAB) has got:
 * one summary row (the lab, then the executive demo and reference models that build after it) and,
 * while the lab is still loading, its steps. Accounts provisioned before the background setup have no run
 * (status NOT_STARTED) or no views (null), and the app opens as normal.
 */
import { querySnowflake } from "@/lib/snowflake"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [summary] = await querySnowflake(
      // SELECT *: views from before the demo and models split lack DEMO_STATUS, MODELS_STATUS and ALL_READY
      `SELECT * EXCLUDE (STARTED_AT, APP_URL), STARTED_AT::VARCHAR AS STARTED_AT FROM BANKING_HOL.LAB.SETUP_SUMMARY`,
    )
    const steps =
      summary && summary.STATUS !== "NOT_STARTED" && summary.STATUS !== "READY"
        ? await querySnowflake(
            `SELECT * EXCLUDE (STARTED_AT, FINISHED_AT) FROM BANKING_HOL.LAB.SETUP_STATUS`,
          )
        : []
    return Response.json({ summary: summary ?? null, steps })
  } catch (e) {
    // no SETUP_SUMMARY view: an account set up the older way, so there's nothing to wait for
    console.warn(new Date().toISOString(), "[setup-status] unavailable", e)
    return Response.json({ summary: null, steps: [] })
  }
}
