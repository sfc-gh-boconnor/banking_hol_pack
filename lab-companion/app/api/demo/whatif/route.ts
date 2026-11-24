/** POST /api/demo/whatif - outside-SLA payments today vs a scenario ({ speedup, fixFailures, limits }). */
import { whatIf } from "@/lib/demo"

export const dynamic = "force-dynamic"

const SCHEMES = new Set(["CHAPS", "FASTER_PAYMENTS", "BACS", "SWIFT", "SEPA", "WIRE_TRANSFER"])

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const speedup = Math.min(0.9, Math.max(0, Number(body?.speedup) || 0))
  const fixFailures = Math.min(1, Math.max(0, Number(body?.fixFailures) || 0))
  // only known schemes, positive whole milliseconds
  const limits: Record<string, number> = {}
  for (const [k, v] of Object.entries(body?.limits ?? {})) {
    const ms = Math.round(Number(v))
    if (SCHEMES.has(k) && ms > 0 && ms <= 7 * 86_400_000) limits[k] = ms
  }
  try {
    return Response.json(await whatIf(speedup, limits, fixFailures))
  } catch (e) {
    console.error(new Date().toISOString(), "[demo] what-if failed", e)
    return Response.json({ error: "Couldn't run the scenario" }, { status: 500 })
  }
}
