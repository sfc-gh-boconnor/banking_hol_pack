/**
 * GET /api/external-access - which of the lab's external access integrations exist in this account.
 * Trial accounts can't create them, so provisioning skips them and module pages warn.
 * Runs as the app's role (HOL_ADMIN), which has USAGE on each one provisioning creates.
 * POST - try to create any that are missing (LAB.ENSURE_EXTERNAL_ACCESS, owner's rights), for when
 * the account team enables external access after the lab was installed.
 */
import { querySnowflake } from "@/lib/snowflake"
import { ALL_INTEGRATIONS } from "@/lib/external-access"

export const dynamic = "force-dynamic"

async function available() {
  const rows = await querySnowflake("SHOW INTEGRATIONS")
  const present = new Set(rows.map((r) => String(r.name ?? r.NAME ?? "").toUpperCase()))
  return ALL_INTEGRATIONS.filter((n) => present.has(n))
}

export async function POST() {
  try {
    const [row] = await querySnowflake("CALL BANKING_HOL.LAB.ENSURE_EXTERNAL_ACCESS()")
    const raw = row ? Object.values(row)[0] : null
    const result = typeof raw === "string" ? JSON.parse(raw) : raw
    return Response.json({ available: await available(), skipped: result?.skipped ?? [], reason: result?.reason ?? null })
  } catch (e) {
    // accounts installed before this procedure existed
    console.warn(new Date().toISOString(), "[external-access] ensure failed", e)
    return Response.json({ error: "This account's setup predates the check. Ask the facilitator to rerun setup/00_admin_provision.sql." }, { status: 500 })
  }
}

export async function GET() {
  try {
    return Response.json({ available: await available() })
  } catch (e) {
    // can't tell: show no warnings rather than wrong ones
    console.warn(new Date().toISOString(), "[external-access] unavailable", e)
    return Response.json({ available: null })
  }
}
