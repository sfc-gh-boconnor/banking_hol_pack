"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AppWindow, ArrowRight, BarChart3, Bot, CheckCircle2, Clock, Compass, CreditCard, Database, FlaskConical, Presentation, ShieldCheck, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { UseCase } from "@/lib/content"
import { aboutDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

type ModuleSummary = { code: string; title: string; minutes: number | null; persona: string; checkIds: string[] }
type Progress = Record<string, { ok: boolean }>
type View = "role" | "usecase" | "leader"

// One icon per persona on the pathway cards (Snowflake Blue tint, Mid Blue stroke)
const PERSONA_ICONS: Record<string, typeof Users> = {
  "Data Engineer": Database,
  "Data Analyst": BarChart3,
  "Payments Ops": CreditCard,
  "Data Scientist": FlaskConical,
  "AI Builder": Bot,
  "App Builder": AppWindow,
  "Governance": ShieldCheck,
}

const VIEWS: { id: View; label: string; icon: typeof Users }[] = [
  { id: "role", label: "By role", icon: Users },
  { id: "usecase", label: "By use case", icon: Compass },
  { id: "leader", label: "For leaders", icon: Presentation },
]

export function PathwayHome({
  pathways,
  useCases,
  modules,
}: {
  pathways: Record<string, { blurb: string; modules: string[] }>
  useCases: UseCase[]
  modules: ModuleSummary[]
}) {
  const names = Object.keys(pathways)
  const [persona, setPersona] = useState<string | null>(null)
  const [view, setView] = useState<View>("role")
  useEffect(() => {
    setPersona(localStorage.getItem("hol_persona"))
    const v = localStorage.getItem("hol_view") as View | null
    if (v && VIEWS.some((x) => x.id === v)) setView(v)
  }, [])
  const choose = (p: string) => {
    setPersona(p)
    localStorage.setItem("hol_persona", p)
  }
  const pickView = (v: View) => {
    setView(v)
    localStorage.setItem("hol_view", v)
  }

  const progress = useQuery<{ user: string; progress: Progress }>({
    queryKey: ["progress"],
    queryFn: async () => {
      const r = await fetch("/api/progress")
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed")
      return r.json()
    },
  })
  const done = (m: ModuleSummary) => {
    const p = progress.data?.progress ?? {}
    const passed = m.checkIds.filter((id) => p[id]?.ok).length
    return { passed, total: m.checkIds.length }
  }

  const byCode = Object.fromEntries(modules.map((m) => [m.code, m]))
  const path = view === "role" && persona ? pathways[persona] : null
  const others = path ? modules.filter((m) => !path.modules.includes(m.code)) : modules

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Ways to choose a pathway">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <Button key={id} role="tab" aria-selected={view === id} variant={view === id ? "default" : "outline"} onClick={() => pickView(id)}>
            <Icon className="size-4" /> {label}
          </Button>
        ))}
      </div>

      {view === "usecase" && <UseCaseCards useCases={useCases} byCode={byCode} done={done} />}
      {view === "leader" && <LeaderCard />}

      {view === "role" && (
      <Card>
        <CardHeader>
          <CardTitle>Choose your pathway</CardTitle>
          <CardDescription>
            Most pathways start with C0 and C1; data scientists start with DS0. Each vignette stands alone - if it lists a prerequisite you have not built, run the catch-up script it names.
            {progress.data?.user && <> Signed in as <strong>{progress.data.user}</strong>.</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {names.map((p) => {
            const Icon = PERSONA_ICONS[p] ?? Users
            return (
            <button
              key={p}
              onClick={() => choose(p)}
              className={cn(
                // a button centres its content vertically: stack from the top so every card lines up
                "flex min-w-0 flex-col items-start justify-start gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary",
                persona === p && "border-primary bg-primary/5 ring-1 ring-primary",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--sf-blue)]/15 text-[var(--sf-mid-blue)]" aria-hidden>
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-heading text-sm font-black uppercase tracking-wide text-[var(--sf-mid-blue)]">{p}</span>
              <span className="text-xs text-muted-foreground">{pathways[p].blurb}</span>
            </button>
            )
          })}
        </CardContent>
      </Card>
      )}

      {path && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{persona} pathway</h2>
          <div className="grid gap-3">
            {path.modules.map((code, i) => byCode[code] && (
              <ModuleRow key={code} m={byCode[code]} step={i + 1} {...done(byCode[code])} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {path ? "Other vignettes" : view === "role" ? "All modules" : "Or pick any module"}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {others.map((m) => <ModuleRow key={m.code} m={m} {...done(m)} compact />)}
        </div>
      </section>
    </div>
  )
}

function UseCaseCards({ useCases, byCode, done }: {
  useCases: UseCase[]
  byCode: Record<string, ModuleSummary>
  done: (m: ModuleSummary) => { passed: number; total: number }
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {useCases.map((u) => {
        const mins = u.steps.reduce((t, s) => t + (byCode[s.code]?.minutes ?? 0), 0)
        const complete = u.steps.filter((s) => byCode[s.code] && (() => { const d = done(byCode[s.code]); return d.total > 0 && d.passed === d.total })()).length
        return (
          <Link key={u.id} href={`/usecase/${u.id}`} className="group min-w-0">
            <Card className="h-full transition-colors group-hover:border-primary">
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">{u.business}</Badge>
                  <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{aboutDuration(mins)}</span>
                  {complete > 0 && <Badge variant="success">{complete}/{u.steps.length} done</Badge>}
                </div>
                <CardTitle className="text-lg">{u.title}</CardTitle>
                <CardDescription>{u.question}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-1.5">
                {u.steps.map((s, i) => (
                  <span key={s.code} className="flex items-center gap-1.5">
                    <Badge variant="outline" className="font-bold text-primary">{s.code}</Badge>
                    {i < u.steps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  </span>
                ))}
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}

function LeaderCard() {
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">For C-level and line-of-business leaders</p>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">See the finished data products in 15 minutes, no hands-on needed</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            A click-through tour of retail and corporate banking: profit and branch catchments on a map, who is about to leave,
            mule rings, an APP scam case worked by AI, fuzzy name matching, and an assistant you can ask anything. It runs on its own
            copy of the data, so you can't break anything, and every stop links to the lab module that builds it.
          </p>
        </div>
        <Button asChild size="lg"><Link href="/demo">Start the tour <ArrowRight className="size-4" /></Link></Button>
      </div>
    </Card>
  )
}

function ModuleRow({ m, step, passed, total, compact }: { m: ModuleSummary; step?: number; passed: number; total: number; compact?: boolean }) {
  const complete = total > 0 && passed === total
  return (
    <Link href={`/module/${m.code}`} className="group min-w-0">
      <div className={cn("flex min-w-0 items-center gap-4 rounded-lg border bg-card p-4 transition-colors group-hover:border-primary", compact && "p-3")}>
        {step !== undefined && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{step}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-primary">{m.code}</span>
            <span className="truncate text-sm font-medium">{m.title}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{m.persona}</span>
            {m.minutes && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{m.minutes} min</span>}
          </div>
        </div>
        {total > 0 && (
          complete
            ? <Badge variant="success" className="shrink-0 gap-1"><CheckCircle2 className="h-3 w-3" />Complete</Badge>
            : <Badge variant="outline" className="shrink-0">{passed}/{total} checks</Badge>
        )}
        <Button variant="ghost" size="icon" className="shrink-0" tabIndex={-1}><ArrowRight className="h-4 w-4" /></Button>
      </div>
    </Link>
  )
}
