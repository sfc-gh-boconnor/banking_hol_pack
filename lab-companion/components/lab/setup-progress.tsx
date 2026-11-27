"use client"

import type React from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, XCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export type PartStatus = "WAITING" | "RUNNING" | "READY" | "FAILED"
export type SetupStep = { PART?: string; STEP_NO: number; STEP_NAME: string; STATUS: string; MINUTES: number | null; ERROR_MESSAGE: string | null }
export type SetupSummary = {
  STATUS: string
  STEPS_DONE: number
  STEP_TOTAL: number
  CURRENT_STEP: string | null
  ERROR_MESSAGE: string | null
  // the executive demo and the reference models build after the lab, side by side (older views lack these)
  DEMO_STATUS?: PartStatus
  DEMO_STEPS_DONE?: number
  DEMO_STEP_TOTAL?: number
  DEMO_ERROR?: string | null
  MODELS_STATUS?: PartStatus
  MODELS_ERROR?: string | null
  ALL_READY?: boolean
}
export type SetupStatus = { summary: SetupSummary | null; steps: SetupStep[] }

// The models build trains in BANKING_HOL.ML and clears it when it's done, so work there waits for it
export const MODEL_CODES = ["DS1", "DS4"]
export const MODEL_CATCHUPS = ["ds1_model", "ds4_predictions"]

const partReady = (s: PartStatus | undefined) => s === undefined || s === "READY"

/** The account's background setup, shared by the gate, the banner and the notices (one query). */
export function useSetupStatus() {
  return useQuery<SetupStatus>({
    queryKey: ["setup-status"],
    queryFn: async () => (await fetch("/api/setup-status")).json(),
    refetchInterval: (q) => {
      const s = q.state.data?.summary
      if (s?.STATUS === "RUNNING" || s?.STATUS === "FAILED") return 5_000
      if (s && s.ALL_READY === false) return 15_000
      return false
    },
    refetchIntervalInBackground: true,
  })
}

/** What's still building once the lab is open: the demo, the reference models, or nothing. */
export function useBackgroundBuild() {
  const summary = useSetupStatus().data?.summary ?? null
  const labOpen = !summary || summary.STATUS === "READY" || summary.STATUS === "NOT_STARTED"
  return {
    labOpen,
    demoReady: partReady(summary?.DEMO_STATUS),
    modelsReady: partReady(summary?.MODELS_STATUS),
    summary,
  }
}

function partLabel(status: PartStatus | undefined, done?: number, total?: number) {
  if (status === "FAILED") return "stopped"
  if (status === "RUNNING" && total) return `${done ?? 0} of ${total} steps`
  return status === "RUNNING" ? "building" : "about to start"
}

/** A slim bar under the header while the demo or the reference models are still building. */
export function BackgroundBuildBanner() {
  const { labOpen, demoReady, modelsReady, summary } = useBackgroundBuild()
  if (!summary || !labOpen || (demoReady && modelsReady)) return null
  const parts = [
    !demoReady && `executive demo (${partLabel(summary.DEMO_STATUS, summary.DEMO_STEPS_DONE, summary.DEMO_STEP_TOTAL)})`,
    !modelsReady && `DS1 and DS4 reference models (${partLabel(summary.MODELS_STATUS)})`,
  ].filter(Boolean)
  const failed = summary.DEMO_STATUS === "FAILED" || summary.MODELS_STATUS === "FAILED"
  return (
    <div className={failed ? "border-b border-destructive/30 bg-destructive/10" : "border-b border-primary/20 bg-primary/5"}>
      <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-xs sm:px-6 lg:px-8">
        {failed ? <XCircle className="size-3.5 shrink-0 text-destructive" /> : <Loader2 className="size-3.5 shrink-0 animate-spin" />}
        <span>
          <span className="font-semibold">{failed ? "Part of the setup stopped: " : "Still building in the background: "}</span>
          {parts.join(" and ")}.{" "}
          {modelsReady ? "Every module can be started now." : "Every module except DS1 and DS4 can be started now."}
          {failed ? " Ask your facilitator: they can see the error in BANKING_HOL.LAB.SETUP_STATUS." : ""}
        </span>
      </p>
    </div>
  )
}

/** On DS1 and DS4: wait for the reference models, which are training in the same ML schema. */
export function ModelsBuildingNotice({ code }: { code: string }) {
  const { labOpen, modelsReady, summary } = useBackgroundBuild()
  if (!MODEL_CODES.includes(code) || !labOpen || modelsReady) return null
  const failed = summary?.MODELS_STATUS === "FAILED"
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p className="font-semibold">{failed ? "The reference model build stopped" : "Wait a few minutes before starting this module"}</p>
      <p className="mt-1 text-xs">
        {failed
          ? "Your facilitator can see the error in BANKING_HOL.LAB.SETUP_STATUS and rerun it with CALL BANKING_HOL.LAB.LOAD_LAB_DATA('MODELS')."
          : "Your account is still pre-training the DS1 and DS4 models in BANKING_HOL.ML (about 3 minutes), and it clears that schema when it finishes. Start this module once this note disappears, so nothing you build is removed."}
      </p>
    </div>
  )
}

/** The executive demo, once its database is built; until then, how far it has got. */
export function DemoGate({ children }: { children: React.ReactNode }) {
  const { labOpen, demoReady, summary } = useBackgroundBuild()
  if (demoReady || !summary) return <>{children}</>
  const failed = summary.DEMO_STATUS === "FAILED"
  const total = summary.DEMO_STEP_TOTAL ?? 0
  const pct = total ? Math.round((100 * (summary.DEMO_STEPS_DONE ?? 0)) / total) : 0
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>{failed ? "The executive demo didn't finish building" : "The executive demo is still being built"}</CardTitle>
        <CardDescription>
          {failed
            ? `Ask your facilitator: they can rebuild it from the facilitator page.${summary.DEMO_ERROR ? ` Error: ${summary.DEMO_ERROR}` : ""}`
            : !labOpen
              ? "It starts once the lab data has loaded, and takes about 9 minutes after that."
              : `It builds after the lab data, in about 9 minutes${total ? ` (${summary.DEMO_STEPS_DONE ?? 0} of ${total} steps done)` : ""}. This page shows the demo as soon as it's ready.`}
        </CardDescription>
      </CardHeader>
      {!failed && (
        <CardContent>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(pct, 3)}%` }} />
          </div>
        </CardContent>
      )}
    </Card>
  )
}
