/**
 * GET  /api/my-defaults - whether the signed-in user can "do the lab as themselves" (self-installed
 *      accounts only, for whoever has HOL_ADMIN) and whether they already sign in as an attendee.
 * POST { action: "attendee" | "restore" } - switch their defaults, through LAB.MY_LAB_DEFAULTS
 *      (owner's rights). Always for the signed-in user, never a user named by the browser.
 */
import { currentUser } from "@/lib/lab"
import { querySnowflake } from "@/lib/snowflake"

export const dynamic = "force-dynamic"

async function call(action: "status" | "attendee" | "restore") {
  const [row] = await querySnowflake("CALL BANKING_HOL.LAB.MY_LAB_DEFAULTS(?, ?)", { binds: [await currentUser(), action] })
  const raw = row ? Object.values(row)[0] : null
  return typeof raw === "string" ? JSON.parse(raw) : raw
}

async function snowsightUrl() {
  const [row] = await querySnowflake("SELECT LOWER(CURRENT_ORGANIZATION_NAME()) AS ORG, LOWER(CURRENT_ACCOUNT_NAME()) AS ACCT")
  return row ? `https://app.snowflake.com/${row.ORG}/${row.ACCT}/` : null
}

export async function GET() {
  try {
    return Response.json({ ...(await call("status")), snowsight: await snowsightUrl() })
  } catch (e) {
    // accounts set up before this procedure existed: no card
    console.warn(new Date().toISOString(), "[my-defaults] unavailable", e)
    return Response.json({ eligible: false })
  }
}

export async function POST(req: Request) {
  const { action } = await req.json().catch(() => ({}))
  if (action !== "attendee" && action !== "restore") return Response.json({ error: "Unknown action" }, { status: 400 })
  try {
    return Response.json({ ...(await call(action)), snowsight: await snowsightUrl() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ error: (/ValueError: ([^\n]+)/.exec(msg)?.[1] ?? msg) }, { status: 500 })
  }
}
