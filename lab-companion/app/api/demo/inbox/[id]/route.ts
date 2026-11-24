/** GET /api/demo/inbox/<id> - one demo email's HTML body, shown in a sandboxed frame. */
import { inboxMessage } from "@/lib/demo"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const row = await inboxMessage(id)
    if (!row) return Response.json({ error: "No such message" }, { status: 404 })
    return Response.json({ id: row.MESSAGE_ID, html: row.HTML_BODY })
  } catch (e) {
    console.error(new Date().toISOString(), "[demo] inbox message failed", id, e)
    return Response.json({ error: "Couldn't open the message" }, { status: 500 })
  }
}
