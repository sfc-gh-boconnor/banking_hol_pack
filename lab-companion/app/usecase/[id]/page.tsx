import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, Clock, Presentation } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { USE_CASES, moduleByCode, useCaseById } from "@/lib/content"
import { aboutDuration } from "@/lib/format"

export const dynamic = "force-dynamic"

/** One use case end to end: the business question, the outcome, and the modules that build it, in order. */
export default async function UseCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const u = useCaseById(id)
  if (!u) notFound()
  const steps = u.steps.map((s) => ({ ...s, m: moduleByCode(s.code) })).filter((s) => s.m)
  const minutes = steps.reduce((t, s) => t + (s.m?.minutes ?? 0), 0)
  const others = USE_CASES.filter((x) => x.id !== u.id)

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/"><ArrowLeft className="h-4 w-4" />All pathways</Link>
      </Button>
      <PageHeader
        eyebrow={`Use case · ${u.business}`}
        title={u.title}
        description={u.question}
        actions={<Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />{aboutDuration(minutes)} hands-on</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader><CardTitle>What you end up with</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{u.outcome}</p>
              <p className="text-muted-foreground">Roles involved: {u.roles.join(", ")}. Do it alone end to end, or split the steps across a team.</p>
            </CardContent>
          </Card>

          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={s.code}>
                <Link href={`/module/${s.code}`} className="group block">
                  <div className="flex items-start gap-4 rounded-lg border bg-card p-4 transition-colors group-hover:border-primary">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{i + 1}</div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-primary">{s.code}</span>
                        <span className="text-sm font-medium">{s.m!.title}</span>
                        {s.m!.minutes && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{s.m!.minutes} min</span>}
                      </div>
                      <p className="text-sm text-muted-foreground">{s.why}</p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Presentation className="size-4" /> See it finished</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">The executive demo shows this use case already built, on its own copy of the data.</p>
              <Button asChild className="w-full"><Link href={`/demo?tour=${u.demo.tour}&stop=${u.demo.stop}`}>Open the demo <ArrowRight className="size-4" /></Link></Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Other use cases</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {others.map((o) => <Link key={o.id} href={`/usecase/${o.id}`} className="block rounded-md p-2 hover:bg-muted">{o.title}</Link>)}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
