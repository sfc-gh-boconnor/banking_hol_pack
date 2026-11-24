"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"

export type DriverRow = { CUSTOMER_ID: string; FEATURE: string; CONTRIBUTION: number; VALUE: string | null }

const ABOUT: Record<string, { label: string; what: string; fmt?: (v: number) => string }> = {
  SALARY_TREND: { label: "Salary trend", what: "Salary in the last 3 months against the 3 before. Below 1 means less pay is arriving, often a sign it is being paid elsewhere.", fmt: (v) => `${v.toFixed(2)}x` },
  TENURE_MONTHS: { label: "Time with us", what: "Months since the customer opened their first account.", fmt: (v) => `${Math.round(v)} months` },
  PRODUCTS_HELD: { label: "Products held", what: "How many products they hold. Fewer products, fewer ties to the bank.", fmt: (v) => v.toFixed(1) },
  MIN_SAVINGS_RATE: { label: "Savings rate", what: "The lowest rate on their savings. Low rates invite switching.", fmt: (v) => `${v.toFixed(2)}%` },
  HOUSING_TENURE: { label: "Housing", what: "Whether they own, rent or have a mortgage." },
  ON_LEGACY_SAVER: { label: "Legacy saver", what: "Has £15,000 or more on a closed-to-new-customers savings product paying below market.", fmt: (v) => `${Math.round(v * 100)}% hold one` },
  SEGMENT: { label: "Segment", what: "The customer segment (mass, affluent, young adult and so on)." },
  BRANCH_AT_RISK: { label: "Branch closing", what: "Their home branch is on the closure list.", fmt: (v) => `${Math.round(v * 100)}% affected` },
  PROFIT_TO_DATE: { label: "Profit to date", what: "Profit the bank has made from the customer so far.", fmt: (v) => `£${Math.round(v).toLocaleString("en-GB")}` },
  CARD_SPEND_L3M: { label: "Card spend", what: "Average monthly card spend over the last 3 months. Falling spend often comes before leaving.", fmt: (v) => `£${Math.round(v).toLocaleString("en-GB")}/month` },
}
const about = (f: string) => ABOUT[f] ?? { label: f.replace(/_/g, " ").toLowerCase(), what: "" }

/** Describe a set of raw values: the mean for numbers, the most common value for categories. */
function describe(feature: string, values: (string | null)[]) {
  const v = values.filter((x): x is string => x != null)
  if (!v.length) return "–"
  const nums = v.map(Number)
  if (nums.every(Number.isFinite)) {
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length
    return about(feature).fmt?.(mean) ?? mean.toFixed(2)
  }
  const counts = new Map<string, number>()
  v.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1))
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0]
  const label = top.replace(/_/g, " ").toLowerCase()
  return v.length > 1 ? `${label} (${n} of ${v.length})` : label
}

/** Diverging lollipop of SHAP contributions: averaged over the selected customers, or the high-risk band when none are. */
export function DriverLollipop({ rows, selected, names }: { rows: DriverRow[]; selected: string[]; names: Record<string, string> }) {
  const [hover, setHover] = useState<string | null>(null)

  const drivers = useMemo(() => {
    const pick = selected.length ? rows.filter((r) => selected.includes(r.CUSTOMER_ID)) : rows.filter((r) => r.CUSTOMER_ID === "ALL")
    const all = rows.filter((r) => r.CUSTOMER_ID === "ALL")
    const byF = new Map<string, DriverRow[]>()
    pick.forEach((r) => byF.set(r.FEATURE, [...(byF.get(r.FEATURE) ?? []), r]))
    return [...byF].map(([feature, rs]) => ({
      feature,
      value: rs.reduce((a, r) => a + Number(r.CONTRIBUTION), 0) / rs.length,
      allValue: Number(all.find((r) => r.FEATURE === feature)?.CONTRIBUTION ?? 0),
      raw: selected.length ? describe(feature, rs.map((r) => r.VALUE)) : null,
      bandRaw: describe(feature, rows.filter((r) => r.CUSTOMER_ID !== "ALL" && r.FEATURE === feature).map((r) => r.VALUE)),
    })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  }, [rows, selected])

  const max = Math.max(0.05, ...drivers.map((d) => Math.abs(d.value)), ...drivers.map((d) => Math.abs(d.allValue)))
  const pos = (v: number) => 50 + (v / max) * 48 // percent across the track, zero in the middle
  const h = drivers.find((d) => d.feature === hover)

  return (
    <div className="relative flex h-full flex-col">
      <p className="mb-1 text-sm font-medium">What drives it</p>
      <p className="mb-3 text-xs text-muted-foreground">
        {selected.length ? `${selected.map((id) => names[id] ?? id).join(", ")}` : "All high-risk customers. Click customers to see theirs."}
      </p>
      <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground"><span>keeps them</span><span>pushes them to leave</span></div>
      <ul className="flex flex-1 flex-col justify-around gap-1.5">
        {drivers.map((d) => {
          const x = pos(d.value), up = d.value >= 0
          return (
            <li key={d.feature} className={cn("grid cursor-default grid-cols-[110px_1fr] items-center gap-2 rounded px-1 py-0.5", hover === d.feature && "bg-muted/60")}
              onMouseEnter={() => setHover(d.feature)} onMouseLeave={() => setHover(null)}>
              <span className="truncate text-xs">{about(d.feature).label}</span>
              <div className="relative h-5">
                <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                {selected.length > 0 && <div className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-muted-foreground/60" style={{ left: `${pos(d.allValue)}%` }} title="High-risk average" />}
                <div className={cn("absolute top-1/2 h-0.5 -translate-y-1/2 transition-all duration-300", up ? "bg-destructive/70" : "bg-chart-1/70")}
                  style={{ left: `${Math.min(50, x)}%`, width: `${Math.abs(x - 50)}%` }} />
                <div className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background transition-all duration-300", up ? "bg-destructive" : "bg-chart-1")}
                  style={{ left: `${x}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      {selected.length > 0 && <p className="mt-2 text-[10px] text-muted-foreground">Hollow dot: high-risk average</p>}
      {h && (
        <div className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-1 rounded-md border bg-popover p-3 text-xs shadow-md">
          <div className="font-medium">{about(h.feature).label}</div>
          <p className="mt-0.5 text-muted-foreground">{about(h.feature).what}</p>
          <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {h.raw != null && <><span className="text-muted-foreground">Selected</span><span>{h.raw}</span></>}
            <span className="text-muted-foreground">All listed customers</span><span>{h.bandRaw}</span>
            <span className="text-muted-foreground">Effect</span>
            <span className={h.value >= 0 ? "text-destructive" : ""}>{h.value >= 0 ? "pushes towards leaving" : "helps keep them"} ({h.value >= 0 ? "+" : ""}{h.value.toFixed(2)} log-odds)</span>
          </div>
        </div>
      )}
    </div>
  )
}
