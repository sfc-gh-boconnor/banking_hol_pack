/**
 * POST /api/demo/search
 *   { kind: "name", name, dob?, town? }  candidate customers for a name as written
 *   { kind: "cases", query }             fraud cases, SARs and calls like a description
 * User text only ever reaches Snowflake as bind values.
 */
import { caseSearch, nameLookup } from "@/lib/demo"

export const dynamic = "force-dynamic"

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    if (body.kind === "name") {
      const name = clean(body.name, 80)
      if (!name) return Response.json({ error: "Type a name" }, { status: 400 })
      return Response.json({ rows: await nameLookup(name, clean(body.dob, 10), clean(body.town, 40)) })
    }
    if (body.kind === "cases") {
      const query = clean(body.query, 300)
      if (!query) return Response.json({ error: "Describe what you're looking for" }, { status: 400 })
      const rows = await caseSearch(query)
      return rows ? Response.json({ rows }) : Response.json({ error: "Cortex Search isn't enabled in this account." }, { status: 409 })
    }
    return Response.json({ error: "kind must be name or cases" }, { status: 400 })
  } catch (e) {
    console.error(new Date().toISOString(), "[demo] search failed", e)
    return Response.json({ error: e instanceof Error ? e.message : "Search failed" }, { status: 500 })
  }
}
