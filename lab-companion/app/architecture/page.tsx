import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PlatformDiagram } from "@/components/lab/platform-diagram"
import { ARCHITECTURE } from "@/lib/content"

// Lanes from core/architecture.json, talking points from core/C2_data_product_tour.md (both
// read by scripts/sync-content.mjs): edit those, not this page. See the hol-architecture skill.
export default function ArchitecturePage() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <PageHeader
        eyebrow="Architecture"
        title="One governed platform, end to end"
        description="Everything runs inside Snowflake: open Iceberg storage, elastic compute, AI and apps, all under Snowflake Horizon governance. Module chips open the lab that builds each part."
      />
      <Card>
        <CardHeader>
          <CardTitle>Platform architecture</CardTitle>
          <CardDescription>{ARCHITECTURE.intro}</CardDescription>
        </CardHeader>
        <CardContent>
          <PlatformDiagram />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Why it's built this way</CardTitle>
          <CardDescription>The ideas to take back to your own platform.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ARCHITECTURE.points.map((p, i) => (
            <div key={p.title} className="flex flex-col gap-2 rounded-lg border border-t-4 border-t-primary p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--sf-blue)]/15 font-heading text-xs font-black text-[var(--sf-mid-blue)]" aria-hidden>{i + 1}</span>
              <div className="font-heading text-sm font-black uppercase tracking-wide text-[var(--sf-mid-blue)] dark:text-[var(--sf-star-blue)]">{p.title}</div>
              <p className="text-xs leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-sm">
        <Link href="/data" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          See every table, how they join and their row counts in the data map <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </p>
    </main>
  )
}
