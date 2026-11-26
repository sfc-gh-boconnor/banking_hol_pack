"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Info, Loader2, RefreshCw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InlineMd } from "@/components/lab/inline-md"
import { Badge } from "@/components/ui/badge"
import { missingAccess } from "@/lib/external-access"

/** The integrations this account has, or null when the app can't tell (then nothing is shown). */
export function useExternalAccess() {
  return useQuery<string[] | null>({
    queryKey: ["external-access"],
    queryFn: async () => {
      const r = await fetch("/api/external-access")
      if (!r.ok) return null
      return (await r.json()).available
    },
    staleTime: 10 * 60 * 1000,
  })
}

/**
 * Shown on a module page only when the account lacks an integration the module uses (e.g. a trial):
 * a warning when the module can't be done, an info note when only one part is affected.
 */
export function ExternalAccessNotice({ code }: { code: string }) {
  const access = useExternalAccess()
  const qc = useQueryClient()
  // the account team may enable external access after install: create what's missing, then look again
  const recheck = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/external-access", { method: "POST" })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error ?? "Check failed")
      return body as { available: string[]; skipped: string[] }
    },
    onSuccess: (body) => qc.setQueryData(["external-access"], body.available),
  })
  const need = missingAccess(code, access.data)
  if (!need) return null
  const { missing } = need

  const blocked = need.level === "blocked"
  const Icon = blocked ? TriangleAlert : Info
  return (
    <div
      role={blocked ? "alert" : "status"}
      className={
        blocked
          ? "flex gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm"
          : "flex gap-3 rounded-lg border border-sky-500/40 bg-sky-500/5 p-4 text-sm"
      }
    >
      <Icon className={blocked ? "mt-0.5 h-4 w-4 shrink-0 text-destructive" : "mt-0.5 h-4 w-4 shrink-0 text-sky-600"} />
      <div className="space-y-1">
        <p className="font-semibold">
          {blocked ? "Not available on this account" : "Part of this module needs external access"}
        </p>
        <p>
          This account has no external network access (usually a trial), so {missing.join(" and ")}{" "}
          {missing.length > 1 ? "weren't" : "wasn't"} created.
        </p>
        <p><InlineMd text={need.message} /></p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button size="sm" variant="outline" onClick={() => recheck.mutate()} disabled={recheck.isPending}>
            {recheck.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check again
          </Button>
          <span className="text-xs text-muted-foreground">
            {recheck.isError
              ? recheck.error.message
              : recheck.isSuccess
                ? "Still no external access on this account. The account team can enable it, then press Check again."
                : "Has the account team enabled external access? Press Check again to set it up."}
          </span>
        </div>
      </div>
    </div>
  )
}

/** A small badge for module lists: only when the module, or a main part of it, can't be done on this account. */
export function ExternalAccessBadge({ code }: { code: string }) {
  const access = useExternalAccess()
  const need = missingAccess(code, access.data)
  if (!need || need.minor) return null
  return need.level === "blocked"
    ? <Badge variant="destructive" className="shrink-0">Not available here</Badge>
    : <Badge variant="outline" className="shrink-0 border-sky-500/50 text-sky-700">Partly available</Badge>
}
