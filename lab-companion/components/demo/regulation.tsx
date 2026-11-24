"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, ExternalLink, FileText, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/empty-state"
import { StatCard } from "@/components/stat-card"
import { CHART_COLORS } from "@/components/chart-utils"
import { REGULATIONS, type Regulation, type RegId } from "@/lib/regulations"
import { cn } from "@/lib/utils"

type Rows = Record<string, any>[]
const num = (v: unknown) => Math.round(Number(v ?? 0)).toLocaleString("en-GB")

function useDemoStop(stop: string) {
  return useQuery<Record<string, Rows>>({
    queryKey: ["demo", stop],
    queryFn: async () => {
      const r = await fetch(`/api/demo/${stop}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Failed")
      return j
    },
    staleTime: Infinity,
  })
}

/** The live number behind each regulation, from the "regulations" stop query. */
function evidenceFor(id: RegId, e: Record<string, any>): { value: string; label: string } {
  switch (id) {
    case "op-res": return { value: num(e.OPRES_BREACHES), label: `payments outside SLA caught by the dynamic table; ${num(e.OPRES_ALERTS)} escalated live by the Snowflake Alert` }
    case "consumer-duty": return { value: num(e.CD_VULNERABLE), label: `customers flagged as potentially vulnerable; ${num(e.CD_COMPLAINTS)} complaints read by AI SQL` }
    case "app-scams": return { value: `${num(e.APP_REIMBURSED_PCT)}%`, label: `of ${num(e.APP_CASES)} fraud cases reimbursed in full or in part, each decision drafted with its evidence` }
    case "aml": return { value: num(e.AML_MULES), label: `mule accounts traced from the money flows; ${num(e.AML_SARS)} SARs checked for completeness` }
    case "uk-gdpr": return { value: num(e.GDPR_REQUESTS), label: `customer data requests answered from tagged data; ${num(e.GDPR_MASKED_ACCOUNTS)} client accounts masked by policy` }
    case "cash-access": return { value: num(e.CASH_BUSINESSES), label: `small businesses, charities and clubs paying cash in at a branch; ${num(e.CASH_NOT_DIGITAL)} with a treasurer who doesn't bank online` }
    case "model-risk": return { value: num(e.MR_MODELS), label: `model in the inventory with validation and a model card, status ${String(e.MR_STATUS ?? "-").replaceAll("_", " ").toLowerCase()}` }
  }
}

/** Small "Regulation:" chips for a tour stop, linking to the map. */
export function RegulationChips({ ids }: { ids: RegId[] }) {
  if (!ids.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      Regulation:
      {ids.map((id) => {
        const r = REGULATIONS.find((x) => x.id === id)
        return r && <Link key={id} href={`/demo/regulations#${id}`}><Badge variant="outline" className="gap-1 hover:bg-muted"><ShieldCheck className="size-3" />{r.name.split(":")[0]}</Badge></Link>
      })}
    </div>
  )
}

function RegulationCard({ r, e, compact }: { r: Regulation; e?: Record<string, any>; compact?: boolean }) {
  const ev = e ? evidenceFor(r.id, e) : null
  return (
    <Card id={r.id} className="scroll-mt-20">
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">{r.name}</p>
          <span className="text-xs text-muted-foreground">{r.regulator}</span>
        </div>
        {!compact && <p className="text-muted-foreground">{r.duty}</p>}
        {ev && (
          <div className="flex items-baseline gap-3 rounded-md bg-muted/50 px-3 py-2">
            <span className="text-2xl font-semibold tabular-nums">{ev.value}</span>
            <span className="text-xs text-muted-foreground">{ev.label}</span>
          </div>
        )}
        {!compact && (
          <ul className="list-disc space-y-0.5 pl-5">{r.controls.map((c) => <li key={c}>{c}</li>)}</ul>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">See it:</span>
          {r.demo.map((d) => (
            <Link key={d.stop} href={`/demo?tour=${d.tour}&stop=${d.stop}`} className="rounded-md border px-2 py-0.5 hover:bg-muted">{d.label}</Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Build it in the lab:</span>
          {r.modules.map((m) => <Link key={m} href={`/module/${m}`}><Badge variant="outline" className="hover:bg-muted">{m}</Badge></Link>)}
        </div>
        {!compact && (
          <a href={r.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">
            {r.source.label} <ExternalLink className="size-3" />
          </a>
        )}
      </CardContent>
    </Card>
  )
}

/** The full regulation-to-control map (/demo/regulations). */
export function RegulationMap() {
  const q = useDemoStop("regulations")
  const e = q.data?.evidence?.[0]
  return (
    <div className="space-y-4">
      {q.isError && <EmptyState variant="error" title="Couldn't load the live evidence" description={q.error.message} />}
      <div className="grid gap-4 lg:grid-cols-2">{REGULATIONS.map((r) => <RegulationCard key={r.id} r={r} e={e} />)}</div>
      <p className="text-xs text-muted-foreground">
        Each duty is a short paraphrase of the linked source, read on {REGULATIONS[0].verifiedOn}; it is not legal advice. Evidence numbers are live from the demo data (BANKING_DEMO), which is synthetic.
      </p>
    </div>
  )
}

/** "Avoiding the fine": the map in brief, as a tour stop. */
export function AvoidingTheFine() {
  const q = useDemoStop("regulations")
  if (q.isPending) return <Skeleton className="h-[420px]" />
  if (q.isError) return <EmptyState variant="error" title="Couldn't load this stop" description={q.error.message} />
  const e = q.data.evidence[0]
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{REGULATIONS.map((r) => <RegulationCard key={r.id} r={r} e={e} compact />)}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
        <p>Every control above runs on the same governed data, and leaves its own evidence: the alert history, the access history, the model registry, the AI audit trail.</p>
        <Button asChild size="sm"><Link href="/demo/regulations">Open the full regulation map <ArrowRight className="size-4" /></Link></Button>
      </div>
    </div>
  )
}

type Pack = {
  request_id: string; due_by: string; rows: number; letter: string
  customer: { CUSTOMER_ID: string; NAME: string; CITY: string }
  tables: { table: string; rows: number; kinds: string[]; columns: string[]; sample?: Record<string, unknown>[] }[]
  held_back: { table: string; rows: number; kinds: string[] }[]
  access: { USER_NAME: string; ROLE_NAME: string; QUERIES: number; LAST_READ: string }[]
}
const tableLabel = (t: string) => t.replace(/^RB_/, "").replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())

/** "A customer asks for their data": UK GDPR right of access, answered from tagged personal data. */
export function DataRequest() {
  const [id, setId] = useState("RB101023")
  const [pack, setPack] = useState<Pack | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [took, setTook] = useState<number | null>(null)
  const run = async () => {
    setBusy(true); setError(null); setPack(null)
    const t0 = Date.now()
    const r = await fetch("/api/demo/data-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: id }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false); setTook(Math.round((Date.now() - t0) / 1000))
    if (!r.ok) setError(j.error ?? "Couldn't run the data request"); else setPack(j)
  }
  return (
    <div className="space-y-4">
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4 text-sm">
        <div className="flex-1 space-y-1">
          <p className="font-medium">A customer has written in asking for a copy of everything we hold about them.</p>
          <p className="text-muted-foreground">The law gives us a month. Today that means searching system by system. Here Snowflake finds it from the personal-data tags, in one go.</p>
        </div>
        <label className="text-xs"><span className="block text-muted-foreground">Customer id</span>
          <input value={id} onChange={(e) => setId(e.target.value)} className="mt-1 w-32 rounded-md border bg-background px-2 py-1.5 font-mono text-sm" /></label>
        <Button onClick={run} disabled={busy}>{busy ? "Searching every system…" : "Answer the request"}</Button>
      </CardContent></Card>
      {error && <EmptyState variant="error" title="Couldn't answer the request" description={error} />}
      {busy && <Skeleton className="h-[360px]" />}
      {pack && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Customer" value={pack.customer.NAME} hint={`${pack.customer.CUSTOMER_ID} · ${pack.customer.CITY}`} />
            <StatCard label="Found in" value={`${pack.tables.length} tables`} hint={`${num(pack.rows)} records of personal data`} />
            <StatCard label="Held back for review" value={num(pack.held_back.reduce((a, t) => a + t.rows, 0))} hint="financial crime records go to the MLRO first" />
            <StatCard label="Answered in" value={took != null ? `${took} s` : "-"} hint={`legal deadline ${pack.due_by}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <div className="space-y-3">
              <Table bordered>
                <TableHeader><TableRow><TableHead>Where it was found</TableHead><TableHead>What kind</TableHead><TableHead className="text-right">Records</TableHead><TableHead>Example</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pack.tables.map((t) => {
                    const first = t.sample?.[0] ?? {}
                    const [k, v] = Object.entries(first).find(([, x]) => x != null) ?? ["", ""]
                    return (
                      <TableRow key={t.table}>
                        <TableCell className="font-medium">{tableLabel(t.table)}</TableCell>
                        <TableCell><div className="flex flex-wrap gap-1">{t.kinds.map((x) => <Badge key={x} variant="outline" className="text-[10px]">{x.toLowerCase().replace("_", " ")}</Badge>)}</div></TableCell>
                        <TableCell className="text-right tabular-nums">{num(t.rows)}</TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground" title={String(v)}>{k && `${k.toLowerCase().replaceAll("_", " ")}: ${String(v)}`}</TableCell>
                      </TableRow>
                    )
                  })}
                  {pack.held_back.map((t) => (
                    <TableRow key={t.table} className="bg-amber-500/5">
                      <TableCell className="font-medium">{tableLabel(t.table)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">financial crime</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{num(t.rows)}</TableCell>
                      <TableCell className="text-xs text-amber-700 dark:text-amber-400">Held back: referred to the MLRO before anything is released</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="rounded-lg border p-3 text-sm">
                <p className="mb-1 font-medium">Who has read these tables in the last 30 days</p>
                {pack.access.length === 0 ? <p className="text-xs text-muted-foreground">No reads recorded yet (access history can take a few hours to appear).</p> : (
                  <ul className="space-y-0.5 text-xs">{pack.access.map((a) => (
                    <li key={`${a.USER_NAME}-${a.ROLE_NAME}`} className="flex justify-between gap-2"><span>{a.USER_NAME} <span className="text-muted-foreground">as {a.ROLE_NAME ?? "-"}</span></span><span className="tabular-nums text-muted-foreground">{num(a.QUERIES)} queries · last {a.LAST_READ}</span></li>
                  ))}</ul>
                )}
              </div>
            </div>
            <Card><CardContent className="space-y-2 p-4 text-sm">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><FileText className="size-3.5" /> Cover letter (AI draft, checked before sending)</p>
              <p className="whitespace-pre-line leading-relaxed">{String(pack.letter).replace(/^"|"$/g, "").replaceAll("\\n", "\n")}</p>
              <p className="text-xs text-muted-foreground">Request {pack.request_id}, logged with its due date.</p>
            </CardContent></Card>
          </div>
          <p className="text-xs text-muted-foreground">How it works: personal data is tagged once by column. The search follows the tags, so a new table holding customer data is included as soon as it's tagged, and nothing is missed because someone forgot a system. Access history is recorded by Snowflake for every query.</p>
        </>
      )}
    </div>
  )
}

/** "Every model on the record": model risk evidence from the Model Registry (12g). */
export function ModelInventory() {
  const q = useDemoStop("retail-models")
  if (q.isPending) return <Skeleton className="h-[420px]" />
  if (q.isError) return <EmptyState variant="error" title="Couldn't load this stop" description={q.error.message} />
  const m = q.data.inventory[0] ?? {}
  const band = q.data.validation.filter((v) => v.CUT === "RISK_BAND")
  const seg = q.data.validation.filter((v) => v.CUT === "SEGMENT")
  const maxPct = Math.max(...q.data.validation.map((v) => Math.max(Number(v.PREDICTED_PCT), Number(v.ACTUAL_PCT), Number(v.CALIBRATED_PCT ?? 0))), 1)
  const card = String(q.data.card[0]?.CARD ?? "").replace(/^"|"$/g, "").replaceAll("\\n", "\n").replaceAll("**", "")
  // registry names like DEMO_ATTRITION_MODEL or YOUNG_ADULT, as words
  const plain = (s: unknown) => String(s ?? "").replace(/^DEMO_/, "").replaceAll("_", " ").toLowerCase()
  const series = [
    { key: "PREDICTED_PCT", label: "Model's raw score", colour: CHART_COLORS[0] },
    { key: "CALIBRATED_PCT", label: "After recalibration", colour: CHART_COLORS[2] },
    { key: "ACTUAL_PCT", label: "Actually left", colour: CHART_COLORS[3] },
  ] as const
  const Bars = ({ rows, title }: { rows: Rows; title: string }) => (
    <div className="flex h-full flex-col rounded-lg border p-4 text-sm">
      <p className="mb-3 font-medium">{title}</p>
      <div className="flex flex-1 flex-col justify-around gap-4">{rows.map((r) => (
        <div key={r.GROUP_NAME}>
          <div className="flex justify-between text-xs">
            <span className="font-medium capitalize">{plain(r.GROUP_NAME)} <span className="font-normal text-muted-foreground">({num(r.CUSTOMERS)})</span></span>
            <span className="tabular-nums text-muted-foreground">actual <b className="text-foreground">{r.ACTUAL_PCT}%</b></span>
          </div>
          <div className="mt-1.5 space-y-1">
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className="h-2.5 flex-1 rounded-full bg-muted"><div className="h-2.5 rounded-full" style={{ width: `${(100 * Number(r[s.key] ?? 0)) / maxPct}%`, background: s.colour }} /></div>
                <span className="w-12 text-right text-[11px] tabular-nums text-muted-foreground">{Number(r[s.key] ?? 0).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      ))}</div>
      <div className="mt-3 flex flex-wrap gap-3 border-t pt-2 text-[11px] text-muted-foreground">
        {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: s.colour }} />{s.label}</span>)}
      </div>
    </div>
  )
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Model" value={<span className="capitalize">{plain(m.MODEL_NAME)}</span>} hint={`${m.MODEL_NAME} ${m.VERSION} in the Model Registry · ${m.FRAMEWORK} · registered ${m.REGISTERED_ON} · scores the attrition stop`} />
        <StatCard label="AUC" value={String(m.AUC ?? "-")} hint="logged with the version in the Model Registry" />
        <StatCard label="Risk tier" value={String(m.RISK_TIER ?? "-").toLowerCase()} hint={`owner ${m.OWNER}`} />
        <StatCard label="Status" value={String(m.STATUS ?? "-").replaceAll("_", " ").toLowerCase()} hint={String(m.CONDITIONS ?? "")} />
      </div>
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Bars rows={band} title="Validation: does it rank the right people?" />
        <Bars rows={seg} title="Validation: by customer segment" />
        <Card><CardContent className="space-y-2 p-4 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Model card (AI draft, signed off by model risk)</p>
          <p className="whitespace-pre-line text-xs leading-relaxed">{card}</p>
        </CardContent></Card>
      </div>
      <div className={cn("rounded-lg border p-3 text-sm")}>
        <p><b>What validation found:</b> the model ranks customers well (the high band leaves far more often than the low band), but its raw probabilities run high against what really happened. So it was approved for ranking retention offers, with a condition to recalibrate before anyone quotes a probability. That's the kind of finding SS1/23's independent validation principle exists to surface.</p>
        <p className="mt-1"><b>Condition met:</b> the scores are now recalibrated against real outcomes, and the recalibrated rates are what the attrition stop shows and what lifetime value is built on (DS4 in the lab).</p>
        <p className="mt-1 text-xs text-muted-foreground">Permitted use: {m.PERMITTED_USE}. Training data: {m.TRAINING_DATA}. Actual: customers who left after the observation date.</p>
      </div>
    </div>
  )
}
