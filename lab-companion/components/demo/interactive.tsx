"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Loader2, Search, Send, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? "Request failed")
  return j as T
}

const input = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

type Candidate = { CUSTOMER_ID: string; FULL_NAME: string; CITY: string; DOB: string; SEGMENT: string; LEFT_BANK: string; DOB_MATCH: boolean | null; TOWN_MATCH: boolean | null; NAME_SIM: number; METHOD: string }

/** "Is this our customer?": fuzzy name search plus date of birth and town evidence. */
export function NameLookup() {
  const [name, setName] = useState("Liz Moor")
  const [dob, setDob] = useState("")
  const [town, setTown] = useState("London")
  const m = useMutation({ mutationFn: () => post<{ rows: Candidate[] }>("/api/demo/search", { kind: "name", name, dob, town }) })
  const rows = (m.data?.rows ?? []).map((r) => ({ ...r, score: 50 * Number(!!r.DOB_MATCH) + 20 * Number(!!r.TOWN_MATCH) + 0.3 * Number(r.NAME_SIM) }))
    .sort((a, b) => b.score - a.score)
  const verdict = (s: number) => (s >= 75 ? "MATCH" : s >= 45 ? "REVIEW" : "NO MATCH")

  return (
    <div className="space-y-3">
      <form className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name as written, e.g. MOORE, Elizabeth" aria-label="Name" />
        <input className={input} value={dob} onChange={(e) => setDob(e.target.value)} placeholder="DOB DD/MM/YYYY" aria-label="Date of birth" />
        <input className={input} value={town} onChange={(e) => setTown(e.target.value)} placeholder="Town" aria-label="Town" />
        <Button type="submit" disabled={m.isPending}>{m.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Look up</Button>
      </form>
      <p className="text-xs text-muted-foreground">Try a typo, a nickname, initials or "SURNAME, First". Add a date of birth to see the decision change.</p>
      {m.isError && <p className="text-sm text-destructive">{m.error.message}</p>}
      {m.data && (
        <Table bordered>
          <TableHeader><TableRow>
            <TableHead>Candidate</TableHead><TableHead>City</TableHead><TableHead>Date of birth</TableHead>
            <TableHead className="text-center">Evidence</TableHead><TableHead className="text-right">Score</TableHead><TableHead>Decision</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.CUSTOMER_ID} className={cn(i === 0 && "bg-muted/40")}>
                <TableCell><span className="font-medium">{r.FULL_NAME}</span> <span className="text-xs text-muted-foreground">{r.CUSTOMER_ID}</span></TableCell>
                <TableCell>{r.CITY}</TableCell>
                <TableCell>{r.DOB}</TableCell>
                <TableCell className="space-x-1 text-center">
                  <Badge variant={r.DOB_MATCH ? "default" : "outline"}>DOB</Badge>
                  <Badge variant={r.TOWN_MATCH ? "default" : "outline"}>Town</Badge>
                  <Badge variant="outline">Name {Math.round(r.NAME_SIM)}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{Math.round(r.score)}</TableCell>
                <TableCell><Badge variant={verdict(r.score) === "MATCH" ? "default" : verdict(r.score) === "REVIEW" ? "secondary" : "outline"}>{verdict(r.score)}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {m.data && <p className="text-xs text-muted-foreground">Candidates from {m.data.rows[0]?.METHOD === "CORTEX_SEARCH" ? "Cortex Search (fuzzy, meaning-aware)" : "name similarity (Cortex Search not enabled here)"}. A match is a lead for an investigator, never a fact on a name alone.</p>}
    </div>
  )
}

type Doc = { DOC_ID: string; DOC_TYPE: string; FRAUD_TYPE: string | null; CUSTOMER_ID: string; TITLE: string; EXCERPT: string }

/** Plain-English search over case notes, SARs and fraud calls. */
export function CaseSearch() {
  const [q, setQ] = useState("elderly customer told by someone claiming to be the bank to move money to a safe account")
  const m = useMutation({ mutationFn: () => post<{ rows: Doc[] }>("/api/demo/search", { kind: "cases", query: q }) })
  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
        <input className={input} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Describe the case" />
        <Button type="submit" disabled={m.isPending}>{m.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Search</Button>
      </form>
      {m.isError && <p className="text-sm text-destructive">{m.error.message}</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {(m.data?.rows ?? []).map((d) => (
          <div key={d.DOC_ID} className="rounded-lg border p-3 text-sm">
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="secondary">{d.DOC_TYPE.replace("_", " ")}</Badge>
              <span className="font-medium">{d.TITLE}</span>
            </div>
            <p className="line-clamp-4 text-muted-foreground">{d.EXCERPT.replace(/\*\*/g, "").replace(/\s*\n+\s*/g, " · ")}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

type Answer = { text: string; tools: string[]; sql: string[]; table?: { columns: string[]; rows: unknown[][] } }

/** Chat with DEMO_EXEC_ASSISTANT (semantic views and search). */
export function AssistantChat({ suggestions }: { suggestions: string[] }) {
  const [q, setQ] = useState("")
  const [history, setHistory] = useState<{ q: string; a?: Answer; error?: string }[]>([])
  const m = useMutation({
    mutationFn: (question: string) => post<Answer>("/api/demo/ask", { question }),
    onMutate: (question) => setHistory((h) => [...h, { q: question }]),
    onSuccess: (a) => setHistory((h) => h.map((x, i) => (i === h.length - 1 ? { ...x, a } : x))),
    onError: (e) => setHistory((h) => h.map((x, i) => (i === h.length - 1 ? { ...x, error: e.message } : x))),
  })
  const ask = (question: string) => { if (question.trim() && !m.isPending) { m.mutate(question.trim()); setQ("") } }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} onClick={() => ask(s)} disabled={m.isPending}
            className="rounded-full border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50">{s}</button>
        ))}
      </div>
      <div className="max-h-[420px] space-y-4 overflow-y-auto rounded-lg border p-4">
        {history.length === 0 && <p className="text-sm text-muted-foreground">Ask about profit, branches, customers at risk, fraud cases or a customer's name. Answers come from three semantic views and two search services.</p>}
        {history.map((h, i) => (
          <div key={i} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{h.q}</p>
            {!h.a && !h.error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Thinking: choosing a semantic view or search, running SQL…</p>}
            {h.error && <p className="text-sm text-destructive">{h.error}</p>}
            {h.a && (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5" /> Used {h.a.tools.length ? h.a.tools.map((t) => <Badge key={t} variant="outline">{t}</Badge>) : "no tools"}
                </div>
                <div className="whitespace-pre-wrap">{h.a.text.replace(/\*\*/g, "").replace(/\n{3,}/g, "\n\n")}</div>
                {h.a.sql.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Show the SQL it ran</summary>
                    <pre className="mt-2 max-h-56 overflow-auto rounded bg-background p-2">{h.a.sql.join("\n\n")}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q) }}>
        <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about the bank…" aria-label="Question" />
        <Button type="submit" disabled={m.isPending || !q.trim()}>{m.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Ask</Button>
      </form>
    </div>
  )
}
