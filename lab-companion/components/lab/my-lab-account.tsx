"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Loader2, Undo2, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Defaults = { eligible: boolean; attendee?: boolean; can_restore?: boolean; default_role?: string; user?: string; snowsight?: string | null }

/**
 * Self-installed accounts (a trial, one person): lets whoever installed the lab sign in as an attendee
 * (default role HOL_PARTICIPANT, no secondary roles) and switch back. Hidden on DataOps events.
 */
export function MyLabAccount() {
  const qc = useQueryClient()
  const status = useQuery<Defaults>({
    queryKey: ["my-defaults"],
    queryFn: async () => {
      const r = await fetch("/api/my-defaults")
      return r.ok ? r.json() : { eligible: false }
    },
  })
  const change = useMutation({
    mutationFn: async (action: "attendee" | "restore") => {
      const r = await fetch("/api/my-defaults", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error ?? "Couldn't change your defaults")
      return body as Defaults
    },
    onSuccess: (body) => qc.setQueryData(["my-defaults"], body),
  })

  const d = status.data
  if (!d?.eligible) return null
  const signIn = d.snowsight && (
    <Button asChild size="sm" variant="outline">
      <a href={d.snowsight} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open Snowsight</a>
    </Button>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserRound className="h-4 w-4" />Do the lab as yourself</CardTitle>
        <CardDescription>
          {d.attendee
            ? `${d.user} signs in as a lab attendee (HOL_PARTICIPANT), so masking and ownership work as they do for attendees.`
            : `${d.user} signs in as ${d.default_role ?? "another role"}. Attendees use HOL_PARTICIPANT, so some modules (masking, ownership) won't look the same for you.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {d.attendee ? (
          <>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Sign out of Snowsight and sign in again, so your new default role is used.</li>
              <li>Reopen this Lab Companion in a private window: it keeps its own session.</li>
              <li>For admin work, switch role to <span className="font-semibold">ACCOUNTADMIN</span> in Snowsight. You still have it.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              {signIn}
              {d.can_restore && (
                <Button size="sm" variant="ghost" onClick={() => change.mutate("restore")} disabled={change.isPending}>
                  {change.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                  Switch back to my old defaults
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p>This sets your default role to HOL_PARTICIPANT, your warehouse to BANKING_WH and turns off secondary roles. You keep every role you have, and you can switch back here.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => change.mutate("attendee")} disabled={change.isPending}>
                {change.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Make me an attendee
              </Button>
              {signIn}
            </div>
          </>
        )}
        {change.isError && <p className="text-xs text-destructive">{change.error.message}</p>}
      </CardContent>
    </Card>
  )
}
