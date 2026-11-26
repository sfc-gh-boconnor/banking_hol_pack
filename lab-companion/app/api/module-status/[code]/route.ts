/**
 * GET  /api/module-status/<CODE> - is the module complete (all its checks passed), and did Fast-forward build it?
 * POST /api/module-status/<CODE> - { confirm: false } lists what a reset would drop; { confirm: true } drops it.
 *   Only objects that Fast-forward built for this attendee are dropped (LAB.RESET_CATCHUP).
 */
import { CHECKS } from "@/lib/checks"
import { userProgress } from "@/lib/lab"
import { currentUser, fastForwardsFor, resetCatchup } from "@/lib/catchup"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ code: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params
  if (!CHECKS[code]) return Response.json({ error: `Unknown module ${code}` }, { status: 404 })
  try {
    const user = await currentUser()
    const [progress, fastForward] = await Promise.all([userProgress(user), fastForwardsFor(code, user)])
    const complete = CHECKS[code].every((c) => progress[c.id]?.ok === true)
    return Response.json({ complete, fastForward })
  } catch (e) {
    console.error(new Date().toISOString(), "[module-status] read failed", e)
    return Response.json({ error: e instanceof Error ? e.message : "Failed to read the module status" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params
  if (!CHECKS[code]) return Response.json({ error: `Unknown module ${code}` }, { status: 404 })
  const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: unknown }
  try {
    const user = await currentUser()
    const objects: string[] = []
    for (const { catchup } of await fastForwardsFor(code, user)) {
      objects.push(...(await resetCatchup(catchup, user, confirm !== true)))
    }
    return Response.json({ dropped: confirm === true, objects })
  } catch (e) {
    console.error(new Date().toISOString(), "[module-status] reset failed", e)
    return Response.json({ error: e instanceof Error ? e.message : "Reset failed" }, { status: 500 })
  }
}
