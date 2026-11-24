"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Inbox as InboxIcon, Mail, Send } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/empty-state"
import { cn } from "@/lib/utils"

type Message = {
  MESSAGE_ID: string; SENT_AT: string; FROM_NAME: string; FROM_ADDR: string; TO_NAME: string; TO_ADDR: string
  SUBJECT: string; PREVIEW: string; SEVERITY: string; SOURCE: string
}
type Folder = "inbox" | "alerts" | "sent"

const SEVERITY_DOT: Record<string, string> = { CRITICAL: "bg-red-600", HIGH: "bg-orange-500", INFO: "bg-slate-400" }

function when(iso: string) {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

/** The email body, in a frame with every sandbox permission off: no scripts, forms, popups or same-origin access. */
function MessageBody({ id }: { id: string }) {
  const q = useQuery<{ html: string }>({
    queryKey: ["demo-inbox", id],
    queryFn: async () => {
      const r = await fetch(`/api/demo/inbox/${encodeURIComponent(id)}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Failed")
      return j
    },
    staleTime: Infinity,
  })
  if (q.isPending) return <Skeleton className="h-full min-h-[420px]" />
  if (q.isError) return <EmptyState variant="error" title="Couldn't open the message" description={q.error.message} />
  return <iframe title="Email" sandbox="" srcDoc={q.data.html} className="h-full min-h-[520px] w-full rounded-md border bg-white" />
}

/**
 * A simple mail client over the demo mailbox (BANKING_DEMO.EXEC.DEMO_INBOX). Nothing is ever
 * sent: the Snowflake Alert in 12f writes its HTML briefings here. Read state lives in the browser.
 */
export function DemoInbox({ className, highlight }: { className?: string; highlight?: string | null }) {
  const q = useQuery<{ messages: Message[] }>({
    queryKey: ["demo-inbox"],
    queryFn: async () => {
      const r = await fetch("/api/demo/inbox")
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Failed")
      return j
    },
    refetchInterval: 5_000,
  })
  const [folder, setFolder] = useState<Folder>("inbox")
  const [open, setOpen] = useState<string | null>(null)
  const [read, setRead] = useState<Set<string>>(new Set())
  const firstLoad = useRef<Set<string> | null>(null)
  const messages = q.data?.messages ?? []

  // everything there on first load counts as read except the newest alert email, so new mail stands out
  useEffect(() => {
    if (!q.data || firstLoad.current) return
    firstLoad.current = new Set(q.data.messages.map((m) => m.MESSAGE_ID))
    setRead(new Set(q.data.messages.filter((m) => m.SOURCE !== "SNOWFLAKE_ALERT").map((m) => m.MESSAGE_ID)))
  }, [q.data])
  // open the highlighted message (the one the live stop just raised) when it arrives
  useEffect(() => {
    if (highlight && messages.some((m) => m.MESSAGE_ID === highlight)) setOpen((o) => o ?? highlight)
  }, [highlight, messages])
  useEffect(() => {
    if (open) setRead((r) => (r.has(open) ? r : new Set(r).add(open)))
  }, [open])

  const shown = useMemo(() => folder === "sent" ? [] : folder === "alerts" ? messages.filter((m) => m.SEVERITY === "CRITICAL" || m.SEVERITY === "HIGH") : messages, [folder, messages])
  const unread = messages.filter((m) => !read.has(m.MESSAGE_ID)).length
  const owner = messages.find((m) => m.SOURCE === "SNOWFLAKE_ALERT")?.TO_NAME ?? messages[0]?.TO_NAME ?? "Relationship Manager"
  const current = messages.find((m) => m.MESSAGE_ID === open)

  if (q.isPending) return <Skeleton className={cn("h-[600px]", className)} />
  if (q.isError) return <EmptyState variant="error" title="Couldn't load the inbox" description={q.error.message} />

  const folders: { id: Folder; label: string; icon: typeof Mail; count?: number }[] = [
    { id: "inbox", label: "Inbox", icon: InboxIcon, count: unread },
    { id: "alerts", label: "Alerts", icon: AlertTriangle },
    { id: "sent", label: "Sent", icon: Send },
  ]
  return (
    <div className={cn("flex min-h-[600px] flex-col overflow-hidden rounded-lg border bg-background", className)}>
      <div className="flex items-center gap-3 border-b bg-[#00395d] px-4 py-2.5 text-white">
        <Mail className="size-4" />
        <span className="text-sm font-semibold">Bank Mail</span>
        <span className="text-xs opacity-80">{owner}, Relationship Manager</span>
        <Badge variant="outline" className="ml-auto border-white/40 text-[10px] text-white">Demo mailbox: nothing is sent</Badge>
      </div>
      <div className="grid flex-1 grid-cols-1 md:grid-cols-[150px_minmax(240px,320px)_1fr]">
        <nav className="flex gap-1 border-b p-2 md:flex-col md:border-b-0 md:border-r">
          {folders.map((f) => (
            <button key={f.id} onClick={() => setFolder(f.id)}
              className={cn("flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted", folder === f.id && "bg-muted font-medium")}>
              <f.icon className="size-4" /> {f.label}
              {!!f.count && <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{f.count}</span>}
            </button>
          ))}
        </nav>
        <ul className="max-h-[640px] divide-y overflow-y-auto border-b md:border-b-0 md:border-r">
          {shown.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nothing here.</li>}
          {shown.map((m) => {
            const isNew = !read.has(m.MESSAGE_ID)
            return (
              <li key={m.MESSAGE_ID}>
                <button onClick={() => setOpen(m.MESSAGE_ID)}
                  className={cn("w-full px-3 py-2.5 text-left hover:bg-muted/60", open === m.MESSAGE_ID && "bg-muted")}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={cn("inline-block size-2 shrink-0 rounded-full", SEVERITY_DOT[m.SEVERITY] ?? "bg-slate-400")} title={m.SEVERITY} />
                    <span className={cn("truncate", isNew && "font-semibold")}>{m.FROM_NAME}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">{when(m.SENT_AT)}</span>
                  </div>
                  <p className={cn("mt-0.5 truncate text-sm", isNew ? "font-semibold" : "text-foreground/90")}>{m.SUBJECT}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.PREVIEW}</p>
                </button>
              </li>
            )
          })}
        </ul>
        <section className="flex min-h-[520px] flex-col p-3">
          {current ? (
            <>
              <div className="mb-2 space-y-0.5 border-b pb-2 text-xs text-muted-foreground">
                <p className="text-base font-semibold text-foreground">{current.SUBJECT}</p>
                <p>From <b className="text-foreground">{current.FROM_NAME}</b> &lt;{current.FROM_ADDR}&gt;</p>
                <p>To {current.TO_NAME} &lt;{current.TO_ADDR}&gt; · {new Date(current.SENT_AT).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              <div className="flex-1"><MessageBody id={current.MESSAGE_ID} /></div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Pick a message to read it.</div>
          )}
        </section>
      </div>
    </div>
  )
}
