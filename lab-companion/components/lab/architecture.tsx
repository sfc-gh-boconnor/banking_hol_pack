import Link from "next/link"
import { ArrowDown, ArrowRight, Bot, Database, Download, Layers, ShieldCheck, Sparkles, Workflow } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { ARCHITECTURE, moduleByCode } from "@/lib/content"
import { cn } from "@/lib/utils"

// Icons named in core/architecture.json
const ICONS: Record<string, LucideIcon> = { Download, Layers, Workflow, Database, Sparkles, Bot, ShieldCheck }

/** Module code chips; each opens the module, with its title on hover. */
export function ModuleChips({ codes, inverse = false }: { codes: string[]; inverse?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((c) => (
        <Link
          key={c}
          href={`/module/${c}`}
          title={moduleByCode(c)?.title ?? c}
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
            inverse ? "border-white/50 text-white hover:bg-white/15" : "border-primary/40 text-primary hover:bg-primary/10",
          )}
        >
          {c}
        </Link>
      ))}
    </div>
  )
}

/**
 * The platform architecture from core/architecture.json: numbered lanes in data-flow order
 * (left to right on wide screens, stacked on narrow ones) and the governance band across them.
 * `compact` is the Data map's smaller version; the Architecture tab uses the full one.
 */
export function ArchitectureFlow({ compact = false }: { compact?: boolean }) {
  const { lanes, governance } = ARCHITECTURE
  const GovIcon = ICONS[governance.icon] ?? ShieldCheck
  return (
    <div className="space-y-3">
      <div className={cn("grid gap-3 md:grid-cols-3", "xl:grid-cols-6")}>
        {lanes.map((lane, i) => {
          const Icon = ICONS[lane.icon] ?? Layers
          return (
            <div key={lane.lane} className="relative flex flex-col rounded-lg bg-[var(--sf-mid-blue)]/5 p-3 dark:bg-white/5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sf-blue)]/15 text-[var(--sf-mid-blue)] dark:text-[var(--sf-star-blue)]" aria-hidden>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-muted-foreground">Step {i + 1}</div>
                  <div className="font-heading text-xs font-black uppercase tracking-wide text-[var(--sf-mid-blue)] dark:text-[var(--sf-star-blue)]">{lane.lane}</div>
                </div>
              </div>
              {!compact && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{lane.summary}</p>}
              <div className="mt-3 flex-1 space-y-2">
                {lane.items.map((it) => (
                  <div key={it.name} className="rounded-md border bg-card p-2.5 shadow-sm">
                    <div className="text-xs font-semibold">{it.name}</div>
                    <div className="mb-2 text-[11px] leading-snug text-muted-foreground">{it.detail}</div>
                    <ModuleChips codes={it.modules} />
                  </div>
                ))}
              </div>
              {i < lanes.length - 1 && (
                <>
                  <ArrowRight className="absolute -right-3 top-6 z-10 hidden h-5 w-5 rounded-full bg-background text-primary xl:block" aria-hidden />
                  <ArrowDown className="mx-auto mt-2 h-4 w-4 text-primary md:hidden" aria-hidden />
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex flex-col gap-3 rounded-lg bg-[var(--sf-mid-blue)] p-4 text-white sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-2 font-heading text-xs font-black uppercase tracking-wide">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15" aria-hidden><GovIcon className="h-4 w-4" /></span>
          {governance.name}, across every step
        </div>
        <div className="text-xs leading-relaxed text-white/90 sm:flex-1">{governance.detail}</div>
        <ModuleChips codes={governance.modules} inverse />
      </div>
    </div>
  )
}
