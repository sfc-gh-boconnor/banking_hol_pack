/** POST /api/demo/ask { question } - one answer from DEMO_EXEC_ASSISTANT (semantic views and search). */
import { askAssistant } from "@/lib/demo"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(req: Request) {
  const { question } = (await req.json().catch(() => ({}))) as { question?: unknown }
  const q = typeof question === "string" ? question.trim().slice(0, 500) : ""
  if (!q) return Response.json({ error: "Ask a question" }, { status: 400 })
  try {
    return Response.json(await askAssistant(q))
  } catch (e) {
    console.error(new Date().toISOString(), "[demo] ask failed", e)
    return Response.json({ error: e instanceof Error ? e.message : "The assistant didn't answer" }, { status: 500 })
  }
}
