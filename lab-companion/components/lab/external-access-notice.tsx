"use client"

import { useQuery } from "@tanstack/react-query"
import { Info, TriangleAlert } from "lucide-react"
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
