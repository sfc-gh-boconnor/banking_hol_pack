/** POST /api/demo/live - add one stuck CHAPS payment for a corporate client and wake the Snowflake Alert that briefs its RM (12f). */
import { querySnowflake } from "@/lib/snowflake"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    // an owner's-rights procedure adds one fixed stuck CHAPS payment; the viewer can't write to the table directly
    const [row] = await querySnowflake(`CALL BANKING_DEMO.EXEC.DEMO_SEND_LATE_PAYMENT()`)
    return Response.json({ ok: true, paymentId: String(Object.values(row ?? {})[0] ?? "") })
  } catch (e) {
    console.error(new Date().toISOString(), "[demo] live payment failed", e)
    return Response.json({ error: "Couldn't add the payment" }, { status: 500 })
  }
}
