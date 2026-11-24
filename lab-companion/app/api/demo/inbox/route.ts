/** GET /api/demo/inbox - the demo relationship manager's mailbox (BANKING_DEMO.EXEC.DEMO_INBOX), newest first, without bodies. */
import { inboxList } from "@/lib/demo"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return Response.json({ messages: await inboxList() })
  } catch (e) {
    console.error(new Date().toISOString(), "[demo] inbox failed", e)
    return Response.json({ error: "Couldn't load the demo inbox. A facilitator can rebuild the demo from the Facilitator page." }, { status: 500 })
  }
}
