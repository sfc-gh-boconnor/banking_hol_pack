/** GET /api/demo/evidence/<file> - one evidence file for the worked case (police PDF, phishing screenshot). */
import { querySnowflake } from "@/lib/snowflake"

export const dynamic = "force-dynamic"

const TYPES: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" }

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  // bare file names only; the procedure checks the same pattern
  const m = /^[A-Za-z0-9_-]+\.(pdf|png|jpg|jpeg)$/.exec(file)
  if (!m) return Response.json({ error: "Not an evidence file" }, { status: 400 })
  try {
    const rows = await querySnowflake(`CALL BANKING_DEMO.EXEC.DEMO_EVIDENCE_FILE('${file}')`)
    const b64 = String(Object.values(rows[0] ?? {})[0] ?? "")
    if (!b64) return Response.json({ error: "File not found" }, { status: 404 })
    return new Response(Buffer.from(b64, "base64"), {
      headers: { "Content-Type": TYPES[m[1].toLowerCase()], "Content-Disposition": `inline; filename="${file}"`, "Cache-Control": "private, max-age=3600" },
    })
  } catch (e) {
    console.error(new Date().toISOString(), "[demo] evidence failed", file, e)
    return Response.json({ error: "Couldn't load the file" }, { status: 500 })
  }
}
