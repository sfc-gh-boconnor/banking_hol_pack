/**
 * GET  /api/catchup  - the attendee's latest run of each catch-up
 * POST /api/catchup  - { names: [...] } runs those catch-ups in order, as the attendee
 */
import { currentUser, isCatchupName, latestRuns, startCatchups, type CatchupName } from "@/lib/catchup"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return Response.json({ runs: await latestRuns(await currentUser()) })
  } catch (e) {
    console.error(new Date().toISOString(), "[catchup] status failed", e)
    return Response.json({ error: e instanceof Error ? e.message : "Failed to read catch-up status" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { names } = (await req.json().catch(() => ({}))) as { names?: unknown }
  if (!Array.isArray(names) || !names.length || !names.every(isCatchupName)) {
    return Response.json({ error: "names must be a list of known catch-ups" }, { status: 400 })
  }
  try {
    const running = (await latestRuns(await currentUser())).filter((r) => r.STATUS === "RUNNING")
    if (running.length) return Response.json({ error: `${running[0].CATCHUP} is already running` }, { status: 409 })
    await startCatchups(names as CatchupName[])
    return Response.json({ started: true })
  } catch (e) {
    console.error(new Date().toISOString(), "[catchup] start failed", e)
    return Response.json({ error: e instanceof Error ? e.message : "Failed to start the catch-up" }, { status: 500 })
  }
}
