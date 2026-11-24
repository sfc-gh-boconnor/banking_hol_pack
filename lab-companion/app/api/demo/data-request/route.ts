/** POST /api/demo/data-request - answer a customer's request for their data ({ customerId }), via DEMO_DATA_REQUEST (12g). */
import { dataRequest } from "@/lib/demo"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const id = String(body?.customerId ?? "").trim().toUpperCase()
  // retail customer ids look like RB123456; anything else never reaches Snowflake
  if (!/^RB\d{6}$/.test(id)) return Response.json({ error: "Enter a customer id like RB101023" }, { status: 400 })
  try {
    const pack = await dataRequest(id)
    if (pack?.error) return Response.json({ error: String(pack.error) }, { status: 404 })
    return Response.json(pack)
  } catch (e) {
    console.error(new Date().toISOString(), "[demo] data request failed", e)
    return Response.json({ error: "Couldn't run the data request" }, { status: 500 })
  }
}
