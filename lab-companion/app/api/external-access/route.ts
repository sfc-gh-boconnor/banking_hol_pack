/**
 * GET /api/external-access - which of the lab's external access integrations exist in this account.
 * Trial accounts can't create them, so provisioning skips them and module pages warn.
 * Runs as the app's role (HOL_ADMIN), which has USAGE on each one provisioning creates.
 */
import { querySnowflake } from "@/lib/snowflake"
import { ALL_INTEGRATIONS } from "@/lib/external-access"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await querySnowflake("SHOW INTEGRATIONS")
    const present = new Set(rows.map((r) => String(r.name ?? r.NAME ?? "").toUpperCase()))
    return Response.json({ available: ALL_INTEGRATIONS.filter((n) => present.has(n)) })
  } catch (e) {
    // can't tell: show no warnings rather than wrong ones
    console.warn(new Date().toISOString(), "[external-access] unavailable", e)
    return Response.json({ available: null })
  }
}
