/** GET /api/demo/<stop> - the data for one executive demo tour stop (fixed queries on BANKING_DEMO). */
import { stopData } from "@/lib/demo"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ stop: string }> }) {
  const { stop } = await params
  try {
    const data = await stopData(stop)
    if (!data) return Response.json({ error: "Unknown tour stop" }, { status: 404 })
    return Response.json(data)
  } catch (e) {
    console.error(new Date().toISOString(), "[demo] stop failed", stop, e)
    const msg = e instanceof Error ? e.message : "Failed"
    const missing = /does not exist or not authorized/i.test(msg)
    return Response.json(
      { error: missing ? "The demo data isn't built yet. A facilitator can build it from the Facilitator page (Rebuild the demo)." : msg },
      { status: missing ? 503 : 500 },
    )
  }
}
