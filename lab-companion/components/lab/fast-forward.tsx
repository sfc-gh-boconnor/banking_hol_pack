"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Circle, FastForward, Loader2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"

type Run = { CATCHUP: string; STATUS: "RUNNING" | "DONE" | "FAILED"; STARTED_AT: string; FINISHED_AT: string | null; ERROR_MESSAGE: string | null; STEP_NO: number | null; STEP_TOTAL: number | null; STEP_NAME: string | null; ELAPSED_S: number }

const LABELS: Record<string, { label: string; detail: string }> = {
  core_analytics: { label: "Analytics layer", detail: "the staging views, marts and AI-enriched feedback that DE1 and DA1 build (about 2 minutes)" },
  client_360: { label: "Client 360 semantic view", detail: "the analytics layer if it is missing, plus SV_CLIENT_360 (about 1 minute)" },
  ds1_model: { label: "DS1 attrition model", detail: "the customer features, a pre-trained attrition model, its scores and its experiment runs (about 1 to 2 minutes)" },
  gov4_tags: { label: "Tagged customer data", detail: "copies of the customer tables in your governance schema with the personal data tag on every personal column (about 30 seconds)" },
  ds4_predictions: { label: "DS4 customer predictions", detail: "the pre-trained calibrated attrition and margin models, their experiment runs and ML.RB_CUSTOMER_PREDICTIONS, running DS1's catch-up first if needed (about 1 minute)" },
}

/** Runs a module's catch-up scripts as the attendee, so they can skip ahead without doing the earlier module. */
export function CatchupCard({ catchups }: { catchups: string[] }) {
  const qc = useQueryClient()
  const [queued, setQueued] = useState(false)
  const status = useQuery<{ runs: Run[] }>({
    queryKey: ["catchup"],
    queryFn: async () => {
      const r = await fetch("/api/catchup")
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed")
      return r.json()
    },
    refetchInterval: (q) => (queued || q.state.data?.runs.some((r) => r.STATUS === "RUNNING") ? 3_000 : false),
  })
  const start = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/catchup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names: catchups }) })
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to start")
    },
    onSuccess: () => {
      setQueued(true)
      qc.invalidateQueries({ queryKey: ["catchup"] })
    },
  })

  const runs = Object.fromEntries((status.data?.runs ?? []).map((r) => [r.CATCHUP, r]))
  const running = catchups.some((c) => runs[c]?.STATUS === "RUNNING") || (queued && !catchups.every((c) => runs[c]?.STATUS === "DONE" || runs[c]?.STATUS === "FAILED"))
  const allDone = catchups.every((c) => runs[c]?.STATUS === "DONE")
  const failed = catchups.map((c) => runs[c]).find((r) => r?.STATUS === "FAILED")
  // each catch-up counts equally: done = 1, running = the steps it has finished so far
  const part = (c: string) => {
    const r = runs[c]
    if (r?.STATUS === "DONE") return 1
    if (r?.STATUS === "RUNNING") return r.STEP_NO && r.STEP_TOTAL ? (r.STEP_NO - 1) / r.STEP_TOTAL : 0.02
    return 0
  }
  const pct = Math.round((100 * catchups.reduce((n, c) => n + part(c), 0)) / catchups.length)
  const current = catchups.map((c) => runs[c]).find((r) => r?.STATUS === "RUNNING")
  const mins = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FastForward className="size-4" /> Fast-forward</CardTitle>
        <CardDescription>
          Skipped an earlier module? Press the button and it builds what that module leaves behind, in your account, as you.
          It takes a few minutes and you can leave this page open while it runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(running || allDone || pct > 0) && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {allDone ? "All built" : current ? `${LABELS[current.CATCHUP]?.label ?? current.CATCHUP}: ${current.STEP_NAME ? `step ${current.STEP_NO} of ${current.STEP_TOTAL}` : "starting"}` : running ? "Starting" : ""}
              </span>
              <span className="text-muted-foreground">{pct}%{current ? `, ${mins(current.ELAPSED_S)}` : ""}</span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full transition-all duration-500", failed ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.max(pct, running ? 3 : 0)}%` }} />
              {running && <div className="absolute inset-0 animate-pulse bg-primary/10" />}
            </div>
            {current?.STEP_NAME && <p className="text-sm">{current.STEP_NAME}</p>}
          </div>
        )}
        <ol className="space-y-2 text-sm">
          {catchups.map((c) => {
            const r = runs[c]
            const isRunning = r?.STATUS === "RUNNING" || (queued && !r)
            return (
              <li key={c} className="flex items-start gap-3">
                {r?.STATUS === "DONE" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                  : r?.STATUS === "FAILED" ? <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  : isRunning ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
                  : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <div>
                  <div className="font-medium">{LABELS[c]?.label ?? c}</div>
                  <div className="text-xs text-muted-foreground">
                    {r?.STATUS === "DONE" && r.FINISHED_AT ? `Done ${formatRelative(r.FINISHED_AT)} in ${mins(r.ELAPSED_S)}. ` : ""}
                    {r?.STATUS === "RUNNING" && r.STEP_NAME ? `Now: ${r.STEP_NAME}. ` : ""}
                    Builds {LABELS[c]?.detail ?? "what the module leaves behind"}.
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
        {failed?.ERROR_MESSAGE && (
          <p className="max-h-32 overflow-auto rounded-md bg-destructive/10 p-2 font-mono text-xs text-destructive">{failed.ERROR_MESSAGE.slice(0, 600)}</p>
        )}
        {(start.isError || status.isError) && <p className="text-sm text-destructive">{start.error?.message ?? status.error?.message}</p>}
        <Button onClick={() => { setQueued(false); start.mutate() }} disabled={running || start.isPending}>
          {running || start.isPending ? <Loader2 className="size-4 animate-spin" /> : <FastForward className="size-4" />}
          {running || start.isPending ? "Building, you can leave this page open" : allDone ? "Run again" : failed ? "Try again" : "Fast-forward"}
        </Button>
      </CardContent>
    </Card>
  )
}
