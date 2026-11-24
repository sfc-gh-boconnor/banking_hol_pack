"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Step = { STEP_NO: number; STEP_NAME: string; STATUS: string; MINUTES: number | null; ERROR_MESSAGE: string | null }
type Summary = { STATUS: string; STEPS_DONE: number; STEP_TOTAL: number; CURRENT_STEP: string | null; ERROR_MESSAGE: string | null }
type SetupStatus = { summary: Summary | null; steps: Step[] }

/**
 * Covers the app while the account's background lab setup (LAB.PROVISION_LAB) runs, so attendees
 * don't start a module before its data exists. Opens on READY, and on accounts set up the older way.
 */
export function SetupGate({ children }: { children: React.ReactNode }) {
  const facilitator = usePathname()?.startsWith("/facilitator") ?? false
  const status = useQuery<SetupStatus>({
    queryKey: ["setup-status"],
    queryFn: async () => (await fetch("/api/setup-status")).json(),
    refetchInterval: (q) => {
      const s = q.state.data?.summary?.STATUS
      return s === "RUNNING" || s === "FAILED" ? 5_000 : false
    },
    refetchIntervalInBackground: true,
  })
  const summary = status.data?.summary
  if (facilitator || !summary || summary.STATUS === "READY" || summary.STATUS === "NOT_STARTED") return <>{children}</>

  const failed = summary.STATUS === "FAILED"
  const pct = summary.STEP_TOTAL ? Math.round((100 * summary.STEPS_DONE) / summary.STEP_TOTAL) : 0
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>{failed ? "Lab setup stopped" : "Setting up your lab"}</CardTitle>
          <CardDescription>
            {failed
              ? "A setup step failed. Ask your facilitator: they can see the error below and restart the setup."
              : summary.STEP_TOTAL === 0
                ? "Your account is starting to build the lab data, packs and demo inside Snowflake. This page opens the lab when it's done; you can also follow it in Snowsight with SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS."
                : `Your account is building the lab data, packs and demo inside Snowflake (${summary.STEPS_DONE} of ${summary.STEP_TOTAL} steps). This page opens the lab when it's done; you can also follow it in Snowsight with SELECT * FROM BANKING_HOL.LAB.SETUP_STATUS.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full transition-all", failed ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
          <ol className="space-y-1.5 text-sm">
            {status.data?.steps.map((s) => (
              <li key={s.STEP_NO} className={cn("flex items-center gap-2", s.STATUS === "PENDING" && "text-muted-foreground")}>
                {s.STATUS === "DONE" ? <CheckCircle2 className="size-4 text-green-600" />
                  : s.STATUS === "RUNNING" ? <Loader2 className="size-4 animate-spin" />
                  : s.STATUS === "FAILED" ? <XCircle className="size-4 text-destructive" />
                  : <Circle className="size-4" />}
                <span className="flex-1">{s.STEP_NAME}</span>
                {s.MINUTES != null && s.STATUS !== "PENDING" ? <span className="text-xs text-muted-foreground">{s.MINUTES} min</span> : null}
              </li>
            ))}
          </ol>
          {failed && summary.ERROR_MESSAGE ? (
            <p className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">{summary.ERROR_MESSAGE}</p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
