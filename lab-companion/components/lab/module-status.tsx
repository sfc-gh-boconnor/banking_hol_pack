"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, CircleDashed, FastForward, Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/empty-state"

type Status = { complete: boolean; fastForward: { catchup: string; objects: number }[] }

/**
 * Whether this module is complete, and if Fast-forward built it, a reset that drops what Fast-forward
 * created so the attendee can build the module themselves. Completion comes from the module's checks.
 */
export function ModuleStatus({ code }: { code: string }) {
  const qc = useQueryClient()
  const [preview, setPreview] = useState<string[] | null>(null)
  const status = useQuery<Status>({
    queryKey: ["module-status", code],
    queryFn: async () => {
      const r = await fetch(`/api/module-status/${code}`)
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed")
      return r.json()
    },
  })
  const reset = useMutation({
    mutationFn: async (confirm: boolean) => {
      const r = await fetch(`/api/module-status/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) })
      if (!r.ok) throw new Error((await r.json()).error ?? "Reset failed")
      return r.json() as Promise<{ dropped: boolean; objects: string[] }>
    },
    onSuccess: (data) => {
      if (!data.dropped) return setPreview(data.objects)
      setPreview(null)
      qc.invalidateQueries({ queryKey: ["module-status", code] })
      qc.invalidateQueries({ queryKey: ["checks", code] })
      qc.invalidateQueries({ queryKey: ["catchup"] })
    },
  })

  const s = status.data
  const viaFastForward = (s?.fastForward.length ?? 0) > 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            {s?.complete ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <CircleDashed className="h-5 w-5 text-muted-foreground" />}
            {viaFastForward ? "Completed with Fast-forward" : s?.complete ? "Complete" : "Not yet complete"}
          </CardTitle>
          <CardDescription>
            {viaFastForward
              ? "Fast-forward built this module for you. To build it yourself, reset it first: the reset removes what Fast-forward created."
              : s?.complete
                ? "Every check for this module has passed."
                : "Run the checks at the end of the module to mark it complete."}
          </CardDescription>
        </div>
        {viaFastForward && !preview && (
          <Button variant="outline" onClick={() => reset.mutate(false)} disabled={reset.isPending} className="shrink-0">
            {reset.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Reset this module
          </Button>
        )}
      </CardHeader>
      {(preview || status.isError || reset.isError) && (
        <CardContent className="space-y-3">
          {status.isError && <EmptyState variant="error" title="Could not load the module status" description={status.error.message} />}
          {reset.isError && <EmptyState variant="error" title="Reset failed" description={reset.error.message} />}
          {preview && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <FastForward className="h-4 w-4" />
                {preview.length
                  ? `The reset will drop ${preview.length} object${preview.length === 1 ? "" : "s"} that Fast-forward created:`
                  : "Fast-forward left nothing to drop."}
              </p>
              {preview.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
                  {preview.map((o) => <li key={o} className="font-mono">{o}</li>)}
                </ul>
              )}
              <div className="flex gap-2">
                <Button variant="destructive" onClick={() => reset.mutate(true)} disabled={reset.isPending}>
                  {reset.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Confirm reset
                </Button>
                <Button variant="ghost" onClick={() => setPreview(null)} disabled={reset.isPending}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
