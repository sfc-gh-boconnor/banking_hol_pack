"use client"

import Link from "next/link"
import { createContext, useContext, useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { geoCentroid } from "d3-geo"
import { ArrowLeft, ArrowRight, Building2, Landmark, Lasso } from "lucide-react"
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/empty-state"
import { StatCard } from "@/components/stat-card"
import { CHART_COLORS, CHART_THEME } from "@/components/chart-utils"
import { cn } from "@/lib/utils"
import { GeoMap, rewind, type HexRow } from "./geo-map"
import { NetworkGraph, type GraphEdge, type GraphNode } from "./network-graph"
import { BoxSelect, ColumnChart, RowChart, Swatches } from "./minimal-charts"
import { useSelection } from "./use-linked"
import { DriverLollipop, type DriverRow } from "./driver-lollipop"
import { AssistantChat, CaseSearch, NameLookup } from "./interactive"
import { AvoidingTheFine, DataRequest, ModelInventory, RegulationChips } from "./regulation"
import { ENFORCEMENT, regulationById, type RegId } from "@/lib/regulations"
import { DemoInbox } from "./inbox"

type Rows = Record<string, any>[]
type StopData = Record<string, Rows>

const gbp = (v: unknown) => `£${Math.round(Number(v ?? 0)).toLocaleString("en-GB")}`
const gbpM = (v: unknown) => {
  const n = Number(v ?? 0)
  if (Math.abs(n) >= 1e9) return `£${(n / 1e9).toLocaleString("en-GB", { maximumFractionDigits: 1 })}bn`
  return Math.abs(n) < 1e6 ? `£${Math.round(n / 1e3).toLocaleString("en-GB")}k` : `£${(n / 1e6).toLocaleString("en-GB", { maximumFractionDigits: 1 })}M`
}
const num = (v: unknown) => Math.round(Number(v ?? 0)).toLocaleString("en-GB")

function useStop(stop: string, poll?: number) {
  return useQuery<StopData>({
    queryKey: ["demo", stop],
    queryFn: async () => {
      const r = await fetch(`/api/demo/${stop}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Failed")
      return j
    },
    staleTime: poll ? 0 : Infinity,
    refetchInterval: poll ?? false,
    refetchIntervalInBackground: !!poll,  // keep polling even when the browser thinks the tab is hidden
  })
}

/** Loads a stop's data and renders it, with loading and error states. */
/** poll: refetch every N ms (the live stop watches its dynamic table refresh) */
function StopBody({ stop, poll, children }: { stop: string; poll?: number; children: (d: StopData) => React.ReactNode }) {
  const q = useStop(stop, poll)
  if (q.isPending) return <Skeleton className="h-[420px]" />
  if (q.isError) return <EmptyState variant="error" title="Couldn't load this stop" description={q.error.message} />
  return <>{children(q.data)}</>
}

function ModuleChips({ codes }: { codes: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      How it's built:
      {codes.map((c) => <Link key={c} href={`/module/${c}`}><Badge variant="outline" className="hover:bg-muted">{c}</Badge></Link>)}
    </div>
  )
}

type Stop = { id: string; title: string; headline: string; soWhat: string; modules: string[]; regs?: RegId[]; render: () => React.ReactNode }

// lets a stop send the tour to another stop, optionally focused on one thing (e.g. a client from Client 360)
type TourNav = { goTo: (stopId: string, focus?: string) => void; focus: string | null; clearFocus: () => void }
const TourNavContext = createContext<TourNav>({ goTo: () => {}, focus: null, clearFocus: () => {} })
const useTourNav = () => useContext(TourNavContext)

// ---------------- Retail stops ----------------

function ProfitMap() {
  const [metric, setMetric] = useState<"PROFIT_GBP" | "PROFIT_PER_CUSTOMER_GBP" | "COST_GBP" | "AVG_IMD_DECILE">("PROFIT_GBP")
  const [city, setCity] = useState<string | null>("London")
  const [hoverCity, setHoverCity] = useState<string | null>(null)
  const [picked, setPicked] = useState<HexRow[]>([])
  const labels = { PROFIT_GBP: "Profit (12 months)", PROFIT_PER_CUSTOMER_GBP: "Profit per customer", COST_GBP: "Cost to serve", AVG_IMD_DECILE: "Deprivation decile (1 = most deprived)" }
  return (
    <StopBody stop="retail-profit">{(d) => {
      const k = d.kpis[0] ?? {}
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Customers" value={num(k.CUSTOMERS)} hint={`${num(k.ACTIVE_CUSTOMERS)} active`} />
            <StatCard label="Revenue, 12 months" value={gbpM(k.REVENUE_12M_GBP)} />
            <StatCard label="Profit, 12 months" value={gbpM(k.PROFIT_12M_GBP)} />
            <StatCard label="Balances held" value={gbpM(k.BALANCES_GBP)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(labels) as (keyof typeof labels)[]).map((m) => (
              <Button key={m} size="sm" variant={metric === m ? "default" : "outline"} onClick={() => setMetric(m)}>{labels[m]}</Button>
            ))}
            <span className="mx-1 self-center text-xs text-muted-foreground">Zoom:</span>
            <Button size="sm" variant={city === null ? "secondary" : "ghost"} onClick={() => setCity(null)}>All UK</Button>
            {d.cities.map((c) => <Button key={c.CITY} size="sm" variant={city === c.CITY ? "secondary" : "ghost"} onClick={() => setCity(c.CITY)}>{c.CITY}</Button>)}
          </div>
          {/* left: the city table, and the lasso comparison under it; right: the map, narrower and taller */}
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <div className="flex flex-col gap-3">
              <CityTable cities={d.cities} city={city} hoverCity={hoverCity} onPick={(c) => setCity(c === city ? null : c)} onHover={setHoverCity} />
              <LassoCompare picked={picked} cities={d.cities} onClear={() => setPicked([])} />
            </div>
            <GeoMap hexes={d.hexes as HexRow[]} metric={metric} metricLabel={labels[metric]} focusCity={city} height={680} onHoverCity={setHoverCity}
              diverging={metric === "PROFIT_GBP" || metric === "PROFIT_PER_CUSTOMER_GBP"}
              format={(v) => (metric === "AVG_IMD_DECILE" ? v.toFixed(1) : gbp(v))}
              hexTip={(h) => (
                <>
                  {metric !== "PROFIT_GBP" && <div>Profit: <b>{gbp(h.PROFIT_GBP)}</b></div>}
                  {metric !== "PROFIT_PER_CUSTOMER_GBP" && <div>Per customer: <b>{gbp(h.PROFIT_PER_CUSTOMER_GBP)}</b></div>}
                </>
              )}
              onLasso={setPicked} lassoed={picked.length ? new Set(picked.map((h) => h.H3)) : null} />
          </div>
        </div>
      )
    }}</StopBody>
  )
}

/** Profit by city: a bar for each city's total profit, and profit per customer against the UK average. */
function CityTable({ cities, city, hoverCity, onPick, onHover }: {
  cities: Record<string, unknown>[]; city: string | null; hoverCity: string | null; onPick: (c: string) => void; onHover: (c: string | null) => void
}) {
  const sum = (k: string) => cities.reduce((a, r) => a + Number(r[k] ?? 0), 0)
  const ukPer = sum("PROFIT_GBP") / (sum("CUSTOMERS") || 1)
  const maxProfit = Math.max(...cities.map((c) => Number(c.PROFIT_GBP ?? 0)), 1)
  const pers = cities.map((c) => Number(c.PROFIT_PER_CUSTOMER_GBP ?? 0))
  const lo = Math.min(...pers, ukPer) * 0.9, hi = Math.max(...pers, ukPer) * 1.05
  const at = (v: number) => `${(100 * (v - lo)) / ((hi - lo) || 1)}%`
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between bg-[var(--sf-mid-blue)] px-3 py-2 text-white">
        <span className="font-heading text-xs font-black uppercase tracking-wide">Profit by city</span>
        <span className="text-[11px] opacity-90">UK average {gbp(ukPer)} a customer</span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>City · profit, 12 months</span><span>Per customer</span>
      </div>
      {cities.map((c, i) => {
        const name = String(c.CITY), profit = Number(c.PROFIT_GBP ?? 0), per = Number(c.PROFIT_PER_CUSTOMER_GBP ?? 0)
        const above = per >= ukPer
        return (
          <button key={name} type="button" onClick={() => onPick(name)} onMouseEnter={() => onHover(name)} onMouseLeave={() => onHover(null)}
            className={cn("grid w-full grid-cols-[1fr_auto] items-center gap-x-3 border-b px-3 py-2 text-left text-xs last:border-0 hover:bg-muted/60",
              name === city && "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]", name === hoverCity && name !== city && "bg-muted/60")}>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="w-3 text-[10px] tabular-nums text-muted-foreground">{i + 1}</span>
                <span className={cn("font-medium", name === city && "text-[var(--sf-mid-blue)] dark:text-[var(--sf-star-blue)]")}>{name}</span>
                <span className="ml-auto tabular-nums">{gbpM(profit)}</span>
              </div>
              <div className="ml-5 mt-1 h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full" style={{ width: `${(100 * Math.max(profit, 0)) / maxProfit}%`, background: "var(--chart-1)" }} />
              </div>
            </div>
            <div className="w-24">
              <div className={cn("text-right font-semibold tabular-nums", above ? "text-[var(--chart-1)]" : "text-destructive")}>{gbp(per)}</div>
              {/* where this city sits against the UK average (the tick) */}
              <div className="relative mt-1 h-1.5 rounded-full bg-muted">
                <div className="absolute top-[-2px] h-2.5 w-px bg-foreground/60" style={{ left: at(ukPer) }} />
                <div className={cn("absolute top-[-1px] h-2 w-2 -translate-x-1/2 rounded-full", above ? "bg-[var(--chart-1)]" : "bg-destructive")} style={{ left: at(per) }} />
              </div>
            </div>
          </button>
        )
      })}
      <div className="border-t bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">Click a city to zoom to it. The tick marks the UK average per customer.</div>
    </div>
  )
}

/** Beside the profit map, under the city table: the lassoed hexagons against the rest of their city,
 *  everywhere else and the UK. City and UK figures come from the city table (every customer). */
function LassoCompare({ picked, cities, onClear }: { picked: HexRow[]; cities: Record<string, unknown>[]; onClear: () => void }) {
  if (!picked.length) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Lasso className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span><b className="text-foreground">Compare an area:</b> drag on the map to draw round some hexagons. You&apos;ll see their profit and profit per customer against the rest of the city and the UK.</span>
      </div>
    )
  }
  const sum = (rows: Record<string, unknown>[], k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)
  const byCity = new Map<string, number>()
  for (const h of picked) byCity.set(h.CITY, (byCity.get(h.CITY) ?? 0) + Number(h.CUSTOMERS ?? 0))
  const cityName = [...byCity].sort((a, b) => b[1] - a[1])[0][0]
  const c = cities.find((x) => x.CITY === cityName) ?? {}
  const inCity = picked.filter((h) => h.CITY === cityName)
  const sel = { cust: sum(picked, "CUSTOMERS"), profit: sum(picked, "PROFIT_GBP") }
  const uk = { cust: sum(cities, "CUSTOMERS"), profit: sum(cities, "PROFIT_GBP") }
  const rows = [
    { key: "sel", label: "Your selection", sub: `${picked.length} hexagons`, ...sel },
    { key: "city", label: `Rest of ${cityName}`, sub: "not selected", cust: Number(c.CUSTOMERS ?? 0) - sum(inCity, "CUSTOMERS"), profit: Number(c.PROFIT_GBP ?? 0) - sum(inCity, "PROFIT_GBP") },
    { key: "else", label: "Everywhere else", sub: "all cities, not selected", cust: uk.cust - sel.cust, profit: uk.profit - sel.profit },
    { key: "uk", label: "UK total", sub: "eight cities", ...uk },
  ].map((r) => ({ ...r, per: r.cust > 0 ? r.profit / r.cust : 0 }))
  const selPer = rows[0].per
  const maxPer = Math.max(...rows.map((r) => Math.abs(r.per)), 1)
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between bg-[var(--sf-mid-blue)] px-3 py-2 text-white">
        <span className="flex items-center gap-1.5 font-heading text-xs font-black uppercase tracking-wide"><Lasso className="h-3.5 w-3.5" aria-hidden />Selected area</span>
        <button type="button" className="text-[11px] underline opacity-90 hover:opacity-100" onClick={onClear}>Clear</button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-1.5 text-left font-medium">Area</th>
            <th className="px-2 py-1.5 text-right font-medium">Profit</th>
            <th className="px-3 py-1.5 text-right font-medium">Per customer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isSel = r.key === "sel"
            const diff = !isSel && r.per ? ((selPer - r.per) / Math.abs(r.per)) * 100 : null
            return (
              <tr key={r.key} className={cn("border-b last:border-0", isSel && "bg-primary/10", r.key === "uk" && "bg-muted/40")}>
                <td className="px-3 py-2 align-top">
                  <div className={cn("font-medium", isSel && "text-[var(--sf-mid-blue)] dark:text-[var(--sf-star-blue)]")}>{r.label}</div>
                  <div className="text-[10px] text-muted-foreground">{r.sub} · {num(r.cust)} customers</div>
                </td>
                <td className="px-2 py-2 text-right align-top tabular-nums">{gbpM(r.profit)}</td>
                <td className="px-3 py-2 align-top">
                  <div className="text-right font-semibold tabular-nums">{gbp(r.per)}</div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full" style={{ width: `${(100 * Math.max(r.per, 0)) / maxPer}%`, background: isSel ? "var(--chart-3)" : "var(--chart-1)" }} />
                  </div>
                  {diff != null && (
                    <div className={cn("mt-0.5 text-right text-[10px] font-medium", diff >= 0 ? "text-[var(--chart-1)]" : "text-destructive")}>
                      selection {diff >= 0 ? "+" : ""}{diff.toFixed(0)}%
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** 'BR-1:3.2,BR-2:14.0' (from DEMO_BRANCH_HEXES.DRIVE, nearest first) to [{ id, min }] */
function parseDrive(s: unknown): { id: string; min: number }[] {
  if (typeof s !== "string" || !s) return []
  return s.split(",").map((p) => { const i = p.lastIndexOf(":"); return { id: p.slice(0, i), min: Number(p.slice(i + 1)) } }).sort((x, y) => x.min - y.min)
}
const mins = (m: number) => `${m < 10 ? m.toFixed(1) : Math.round(m)} min`

function BranchCatchments() {
  const [branch, setBranch] = useState<string | null>(null)
  const [hex, setHex] = useState<HexRow | null>(null)
  return (
    <StopBody stop="retail-branches">{(d) => {
      const sel = d.branches.find((b) => b.BRANCH_ID === branch) ?? d.branches[0]
      const city = sel?.CITY ?? null
      const byId = new Map(d.branches.map((b) => [String(b.BRANCH_ID), b]))
      const catch20 = d.catchments.filter((c) => Number(c.MINUTES) === 20 && byId.get(String(c.BRANCH_ID))?.CITY === city)
      const cityHexes = (d.hexes as HexRow[]).filter((h) => h.CITY === city)
      const fineHexes = ((d.fine ?? []) as HexRow[]).filter((h) => h.CITY === city)
      const pickedHex = hex && hex.CITY === city ? hex : null
      // drive from the clicked hexagon to the selected branch, and to the nearest other branch if it closed
      const drive = parseDrive(pickedHex?.DRIVE)
      const toSel = drive.find((x) => x.id === sel?.BRANCH_ID)
      const fallback = drive.find((x) => x.id !== sel?.BRANCH_ID)
      // rewind first: Snowflake rings are counter-clockwise, which d3 reads as the whole globe minus the hexagon
      const centre = pickedHex ? geoCentroid(rewind(JSON.parse(pickedHex.GEOJSON))) as [number, number] : null
      const at = (id: string): [number, number] | null => { const b = byId.get(id); return b ? [Number(b.LON), Number(b.LAT)] : null }
      const links = centre && sel ? [
        ...(toSel && at(sel.BRANCH_ID) ? [{ from: centre, to: at(sel.BRANCH_ID)!, label: `${String(sel.BRANCH_NAME)} · ${mins(toSel.min)} today`, tone: "primary" as const }] : []),
        ...(fallback && at(fallback.id) ? [{ from: centre, to: at(fallback.id)!, label: `If closed: ${String(byId.get(fallback.id)?.BRANCH_NAME ?? fallback.id)} · ${mins(fallback.min)}`, tone: "warn" as const }] : []),
      ] : []
      return (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <GeoMap hexes={cityHexes} fineHexes={fineHexes} zoomable metric="PROFIT_GBP" metricLabel="Profit (12 months)" diverging format={gbp} height={560}
              overlays={catch20.map((c) => ({ id: c.BRANCH_ID, GEOJSON: c.GEOJSON }))} highlight={sel?.BRANCH_ID}
              points={d.branches.filter((b) => b.CITY === city).map((b) => ({ LAT: b.LAT, LON: b.LON, id: b.BRANCH_ID, label: b.BRANCH_NAME }))}
              onPointClick={setBranch} selectedPoint={sel?.BRANCH_ID}
              onHexClick={setHex} selectedHex={pickedHex?.H3} links={links}
              legend={links.length ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2"><span className="h-0.5 w-5 bg-[var(--chart-3)]" />Drive to the selected branch today</div>
                  <div className="flex items-center gap-2"><span className="h-0.5 w-5 bg-[var(--destructive)]" />Next nearest branch if it closes</div>
                </div>
              ) : null}
              hexTip={(h) => {
                const dr = parseDrive(h.DRIVE)
                const near = dr[0] && byId.get(dr[0].id)
                return near ? <div className="text-muted-foreground">Nearest: {String(near.BRANCH_NAME)}, {mins(dr[0].min)} drive · click for closure impact</div> : null
              }}
              pointTip={(id) => {
                const b = byId.get(id)
                if (!b) return null
                return (
                  <>
                    <div className="text-muted-foreground">{String(b.FORMAT ?? "Branch")} · {num(b.HOME_CUSTOMERS)} customers · {gbp(b.CUSTOMER_PROFIT_12M_GBP)} a year</div>
                    <div>Close it: <b>{num(b.CUSTOMERS_OVER_20_MIN)}</b> customers over 20 minutes away, <b>{gbp(b.PROFIT_AT_RISK_GBP)}</b> at risk</div>
                    <div className="text-muted-foreground">Click to select</div>
                  </>
                )
              }} />
            <div className="space-y-3">
              {sel && (
                <Card><CardContent className="space-y-2 p-4 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What if we close it?</p>
                  <p className="text-lg font-semibold">{sel.BRANCH_NAME}</p>
                  <p>{num(sel.HOME_CUSTOMERS)} customers bank here, worth {gbp(sel.CUSTOMER_PROFIT_12M_GBP)} a year. Running cost {gbp(sel.ANNUAL_COST_GBP)}.</p>
                  <p className="rounded-md bg-destructive/10 p-2"><b>{num(sel.CUSTOMERS_OVER_20_MIN)}</b> customers would be more than 20 minutes from a branch, putting <b>{gbp(sel.PROFIT_AT_RISK_GBP)}</b> of profit at risk. Their drive gets {Number(sel.AVG_EXTRA_MIN ?? 0).toFixed(1)} minutes longer on average.</p>
                </CardContent></Card>
              )}
              {sel && (
                <Card><CardContent className="space-y-2 p-4 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">From one neighbourhood</p>
                  {pickedHex && toSel ? (
                    <>
                      <p>{num(pickedHex.CUSTOMERS)} customers live here. Today they drive <b>{mins(toSel.min)}</b> to {sel.BRANCH_NAME}.</p>
                      {fallback ? (
                        <p className={cn("rounded-md p-2", fallback.min > 20 ? "bg-destructive/10" : "bg-muted")}>
                          If it closes, the nearest is {String(byId.get(fallback.id)?.BRANCH_NAME ?? fallback.id)}: <b>{mins(fallback.min)}</b>
                          {fallback.min > toSel.min ? <>, {mins(fallback.min - toSel.min)} further</> : <>, no further than today</>}
                          {fallback.min > 20 && <>. That is over the 20-minute line.</>}
                        </p>
                      ) : <p>No other branch is within reach of this neighbourhood.</p>}
                    </>
                  ) : pickedHex ? (
                    <p>{sel.BRANCH_NAME} isn&apos;t within reach of this hexagon in the drive-time matrix. Pick a branch nearer to it.</p>
                  ) : (
                    <p className="text-muted-foreground">Click any hexagon to see its drive time to {sel.BRANCH_NAME}, and to the next nearest branch if this one closes. Zoom in for neighbourhood-sized hexagons.</p>
                  )}
                </CardContent></Card>
              )}
              {sel && Number(sel.BUSINESSES ?? 0) > 0 && (
                <Card><CardContent className="space-y-2 p-4 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Who else pays in here</p>
                  <p>{num(sel.SMALL_BUSINESSES)} small businesses, {num(sel.CHARITIES)} charities and {num(sel.CLUBS)} clubs pay cash in at this counter: <b>{gbpM(sel.CASH_PAID_IN_12M_GBP)}</b> in 12 months.</p>
                  <p className="rounded-md bg-destructive/10 p-2"><b>{num(sel.BUSINESSES_OVER_20_MIN)}</b> would be more than 20 minutes from a counter. <b>{num(sel.NOT_DIGITAL)}</b> have a treasurer who doesn&apos;t bank online, often a volunteer.</p>
                  <p className="text-xs text-muted-foreground">The UK&apos;s largest high-street banks are designated under the FCA access to cash rules: before a closure they must assess the cash deposit needs of local businesses, not just personal customers.</p>
                </CardContent></Card>
              )}
              <p className="text-xs text-muted-foreground">Outlines are 20-minute drive-time catchments. Click a branch dot, or pick from the riskiest closures:</p>
              <div className="flex flex-wrap gap-1.5">
                {d.branches.slice(0, 8).map((b) => (
                  <Button key={b.BRANCH_ID} size="sm" variant={b.BRANCH_ID === sel?.BRANCH_ID ? "default" : "outline"} onClick={() => setBranch(b.BRANCH_ID)}>{b.BRANCH_NAME}</Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{num(d.gaps.length)} hexagons hold profitable customers more than 20 minutes from any branch today.</p>
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Every drive time is a lookup in a precomputed H3 travel-time matrix built with the OpenRouteService Native App, running inside Snowflake. Explore it in{" "}
                <Link href="/module/DA4" className="font-semibold text-primary hover:underline">DA4</Link>, based on the{" "}
                <a href="https://www.snowflake.com/en/developers/guides/oss-install-openrouteservice-native-app/" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">Build Routing Solution in Snowflake quickstart</a>.
              </p>
            </div>
          </div>
        </div>
      )
    }}</StopBody>
  )
}

function Attrition() {
  const { picked, toggle, clear } = useSelection()
  return (
    <StopBody stop="retail-attrition">{(d) => {
      const band = (b: string) => d.summary.find((s) => s.RISK_BAND === b) ?? {}
      const seg = (s: string) => (d.value ?? []).find((v) => v.SEGMENT === s) ?? {}
      const totalVar = (d.value ?? []).reduce((a, v) => a + Number(v.VALUE_AT_RISK_GBP ?? 0), 0)
      const names = Object.fromEntries(d.top.map((c) => [String(c.CUSTOMER_ID), String(c.CUSTOMER)]))
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="High-risk customers" value={num(band("HIGH").CUSTOMERS)} hint="top 5% chance of leaving in 3 months" />
            <StatCard label="Lifetime value at risk" value={gbpM(totalVar)} hint="expected loss in the next 12 months" />
            <StatCard label="Save now" value={num(seg("Save now").CUSTOMERS)} hint={`customers holding ${gbpM(seg("Save now").VALUE_AT_RISK_GBP)} of it`} />
            <StatCard label="Savings high-risk customers hold" value={gbpM(band("HIGH").SAVINGS_GBP)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Table bordered>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>City</TableHead><TableHead className="text-right">Chance of leaving</TableHead><TableHead className="text-right">Lifetime value</TableHead><TableHead className="text-right">At risk</TableHead><TableHead>Signals and next-best offer</TableHead></TableRow></TableHeader>
              <TableBody>{d.top.map((c) => (
                <TableRow key={c.CUSTOMER_ID} onClick={(e) => toggle(String(c.CUSTOMER_ID), e.shiftKey || e.metaKey || e.ctrlKey)} aria-selected={picked.includes(String(c.CUSTOMER_ID))}
                  className={cn("cursor-pointer", picked.includes(String(c.CUSTOMER_ID)) && "bg-primary/25 font-medium shadow-[inset_3px_0_0_var(--primary)] hover:bg-primary/30")}>
                  <TableCell>{c.CUSTOMER}<span className="ml-1 text-xs text-muted-foreground">{c.SEGMENT}</span></TableCell>
                  <TableCell>{c.CITY}</TableCell>
                  <TableCell className="text-right">{(Number(c.CHANCE_3M ?? 0) * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{gbp(c.LIFETIME_VALUE_GBP)}</TableCell>
                  <TableCell className="text-right font-medium">{gbp(c.VALUE_AT_RISK_GBP)}</TableCell>
                  <TableCell>
                    <div className="space-x-1">
                      {Number(c.ON_LEGACY_SAVER) === 1 && <Badge variant="warning">legacy saver</Badge>}
                      {Number(c.BRANCH_AT_RISK) === 1 && <Badge variant="warning">branch closing</Badge>}
                      {Number(c.SALARY_TREND) < 0.9 && <Badge variant="warning">salary moving</Badge>}
                    </div>
                    {c.NEXT_BEST_OFFER && c.NEXT_BEST_OFFER !== "No action" ? <div className="mt-1 text-xs text-primary">→ {String(c.NEXT_BEST_OFFER)}</div> : null}
                  </TableCell>
                </TableRow>))}
              </TableBody>
            </Table>
            <div className="flex flex-col">
              <div className="flex-1"><DriverLollipop rows={d.drivers as unknown as DriverRow[]} selected={picked} names={names} /></div>
              {picked.length > 0 && <Button variant="ghost" size="sm" className="mt-2" onClick={clear}>Clear selection</Button>}
            </div>
          </div>
          <ValueGrid seg={seg} />
          <p className="text-xs text-muted-foreground">Chance of leaving is the model&apos;s score calibrated against who actually left. Lifetime value is 5 years of each customer&apos;s monthly margin, weighted by the chance they stay and discounted at 10% a year; value at risk is what we expect to lose in the next 12 months. Offers are rules, not a model. The models are built in DS1 and DS4; the value, segments and offers in DA5.</p>
        </div>
      )
    }}</StopBody>
  )
}

/** Value against risk: four segments, each with its customers, value, value at risk and most common offer. */
function ValueGrid({ seg }: { seg: (s: string) => Record<string, unknown> }) {
  const cell = (name: string, what: string, tone: "save" | "grow" | "digital" | "maintain") => {
    const s = seg(name)
    return (
      <div className={cn("rounded-lg border p-3", tone === "save" && "border-destructive/50 bg-destructive/5", tone === "grow" && "border-primary/40 bg-primary/5")}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-heading text-sm font-black uppercase tracking-wide">{name}</span>
          <span className="text-xs text-muted-foreground">{num(s.CUSTOMERS)} customers</span>
        </div>
        <p className="text-xs text-muted-foreground">{what}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div><div className="text-muted-foreground">Lifetime value</div><div className="text-base font-semibold">{gbpM(s.LIFETIME_VALUE_GBP)}</div></div>
          <div><div className="text-muted-foreground">At risk</div><div className={cn("text-base font-semibold", tone === "save" && "text-destructive")}>{gbpM(s.VALUE_AT_RISK_GBP)}</div></div>
        </div>
        {s.TOP_OFFER ? <p className="mt-2 text-xs">Most common offer: <span className="font-medium">{String(s.TOP_OFFER)}</span></p> : null}
      </div>
    )
  }
  return (
    <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
      <div />
      <div className="text-center text-xs font-medium text-muted-foreground">Low risk</div>
      <div className="text-center text-xs font-medium text-muted-foreground">High risk</div>
      <div className="flex items-center justify-center text-xs font-medium text-muted-foreground sm:[writing-mode:vertical-rl] sm:rotate-180">High value</div>
      {cell("Grow", "Worth a lot and staying: offer the next product", "grow")}
      {cell("Save now", "Worth a lot and might leave: a named adviser calls", "save")}
      <div className="flex items-center justify-center text-xs font-medium text-muted-foreground sm:[writing-mode:vertical-rl] sm:rotate-180">Low value</div>
      {cell("Maintain", "Low value, low risk: business as usual", "maintain")}
      {cell("Serve digitally", "Low value, might leave: lower-cost channels", "digital")}
    </div>
  )
}

function CustomerVoice() {
  const sel = useSelection()
  const picked = sel.picked
  // a shape that fades the reasons that aren't picked (BoxSelect handles clicks and box drags)
  const shape = (props: unknown) => {
    const p = props as Record<string, unknown>
    const reason = String((p.payload as Record<string, unknown>)?.CALL_REASON ?? "")
    return (
      <g opacity={picked.length && !picked.includes(reason) ? 0.25 : 1} className="cursor-pointer">
        <Lollipop {...(p as Parameters<typeof Lollipop>[0])} />
      </g>
    )
  }
  return (
    <StopBody stop="retail-voice">{(d) => {
      const neg = (e: Record<string, unknown>) => e.SENTIMENT === "negative"
      const calls = picked.length
        ? d.examples.filter((e) => picked.includes(String(e.CALL_REASON))).sort((a, b) => Number(neg(b)) - Number(neg(a))).slice(0, 6)
        : d.examples.filter(neg).slice(0, 6)
      return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Why customers call (AI_CLASSIFY) <span className="font-normal text-muted-foreground">- click one, or drag a box for several</span></p>
            {picked.length > 0 && <button className="text-xs text-primary underline" onClick={sel.clear}>Show all</button>}
          </div>
          <div className="min-h-[320px] flex-1">
          {/* inset: recharts' 5px margins, plus the legend under the rows */}
          <BoxSelect items={d.reasons.map((r) => String(r.CALL_REASON))} axis="y" inset={{ start: 5, end: 31 }} sel={sel}>
          <ResponsiveContainer width="100%" height="100%">
            {/* barGap = -barSize puts both series on the same row; negative is drawn last, so it sits on top */}
            <BarChart data={d.reasons} layout="vertical" margin={{ left: 10, right: 16 }} barSize={14} barGap={-14}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="CALL_REASON" width={140} axisLine={false} tickLine={false}
                tick={(t) => { const { x, y } = t as { x: number; y: number }; const v = String(t.payload.value); return (
                  <text x={x - 4} y={y} dy={4} textAnchor="end" fontSize={11} className="cursor-pointer"
                    fill={picked.includes(v) ? "var(--foreground)" : CHART_THEME.tick.fill} fontWeight={picked.includes(v) ? 600 : 400}>
                    {v}
                  </text>
                ) }} />
              <Bar dataKey="CALLS" name="All calls" fill={CHART_COLORS[0]} shape={shape} isAnimationActive={false} />
              <Bar dataKey="NEGATIVE" name="Negative sentiment" fill={CHART_COLORS[3]} shape={shape} isAnimationActive={false} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
          </BoxSelect>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">What customers need from us (AI_AGG)</p>
          <ul className="list-disc space-y-1.5 rounded-lg bg-muted/40 p-3 pl-7 text-sm">
            {String(d.themes[0]?.THEMES ?? "").split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").replace(/\*\*/g, "").trim()).filter(Boolean)
              .map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          <p className="text-sm font-medium">{picked.length ? `Latest calls: ${picked.join(", ")}` : "Latest unhappy calls"} <span className="font-normal text-muted-foreground">(hover for the AI summary)</span></p>
          {calls.length === 0 && <p className="rounded-lg border p-3 text-sm text-muted-foreground">No calls for {picked.length > 1 ? "these reasons" : "this reason"}.</p>}
          <ul className="divide-y rounded-lg border text-sm empty:hidden">{calls.map((e) => (
            <li key={e.CALL_ID} className="group relative flex items-center gap-2 px-3 py-2 hover:bg-muted/50">
              <span title={`${e.SENTIMENT} sentiment`} className="inline-block size-2 shrink-0 rounded-full"
                style={{ background: e.SENTIMENT === "negative" ? CHART_COLORS[3] : e.SENTIMENT === "positive" ? "var(--chart-2)" : "var(--muted-foreground)" }} />
              <span className="font-medium">{e.CUSTOMER ?? "Customer"}</span>
              <span className="truncate text-muted-foreground">{String(e.CALL_REASON ?? "").replace(/_/g, " ")}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{e.CALL_DATE}</span>
              <Badge variant="outline" className="shrink-0">{e.QUEUE}</Badge>
              <div className="pointer-events-none absolute inset-x-2 bottom-full z-10 mb-1 hidden rounded-md border bg-popover p-3 text-xs shadow-md group-hover:block">
                {String(e.ONE_LINE_SUMMARY ?? "").replace(/^"|"$/g, "")}
              </div>
            </li>))}
          </ul>
        </div>
      </div>
      )
    }}</StopBody>
  )
}

/** Horizontal lollipop for a recharts Bar: a thin stalk with a dot at the value */
function Lollipop({ x = 0, y = 0, width = 0, height = 0, fill, value }: { x?: number; y?: number; width?: number; height?: number; fill?: string; value?: number | number[] }) {
  const cy = y + height / 2
  if (width <= 0) return null // nothing to draw for a zero value
  const v = Array.isArray(value) ? value[1] - value[0] : value
  return (
    <g>
      <line x1={x} x2={x + width} y1={cy} y2={cy} stroke={fill} strokeWidth={2} />
      <circle cx={x + width} cy={cy} r={11} fill={fill} stroke="var(--background)" strokeWidth={1.5} />
      <text x={x + width} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600} fill="#fff">{v}</text>
    </g>
  )
}

function FollowTheMoney() {
  return (
    <StopBody stop="retail-fraud">{(d) => (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {d.mules.slice(0, 3).map((m) => <StatCard key={m.MULE_ACCOUNT} label={m.MULE_ACCOUNT} value={gbp(m.RECEIVED_GBP)} hint={`from ${m.VICTIMS}`} />)}
        </div>
        <NetworkGraph nodes={d.nodes as GraphNode[]} edges={d.edges as GraphEdge[]} />
        <p className="text-xs text-muted-foreground">The six largest mule accounts and everything connected to them. Mule accounts, controllers and devices are synthetic, built for this demo; the victims, cases and SARs are the lab's data. {num(d.alerts[0]?.ALERTS)} payments were flagged by the anomaly score, {num(d.alerts[0]?.CONFIRMED)} of them confirmed fraud.</p>
      </div>
    )}</StopBody>
  )
}

function WorkedCase() {
  return (
    <StopBody stop="retail-case">{(d) => {
      const c = d.case[0]
      if (!c) return <EmptyState title="No case built" description="Rebuild the demo from the Facilitator page." />
      let police: Record<string, string> = {}
      try { police = JSON.parse(c.POLICE_REPORT_FIELDS ?? "{}") } catch { /* shown as empty */ }
      return (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2"><CardContent className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">{c.CASE_ID} · {c.CUSTOMER_NAME}, {c.AGE}</span>
              <Badge variant="destructive">{gbp(c.LOSS_GBP)} lost</Badge>
              <Badge variant="success">{String(c.DECISION).replace(/_/g, " ").toLowerCase()}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Case notes, call transcript and customer record, summarised by AI_COMPLETE</p>
            <div className="whitespace-pre-wrap">{String(c.AI_CASE_SUMMARY ?? "").replace(/^"|"$/g, "").replace(/\\n/g, "\n").replace(/\*\*/g, "").replace(/^#+ /gm, "")}</div>
          </CardContent></Card>
          <div className="space-y-4">
            <Card><CardContent className="space-y-2 p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Police report PDF · AI_EXTRACT</p>
              {c.POLICE_PDF && (
                <a href={`/api/demo/evidence/${c.POLICE_PDF}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 rounded-md border bg-muted/30 p-3 hover:bg-muted/60">
                  <span className="rounded bg-destructive px-1.5 py-1 text-[10px] font-bold text-white">PDF</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.POLICE_PDF}</span>
                  <span className="text-xs text-primary">View</span>
                </a>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-muted-foreground">Crime ref</dt><dd className="font-medium">{police.crime_reference ?? "?"}</dd>
                <dt className="text-muted-foreground">Offence</dt><dd>{police.offence ?? "?"}</dd>
                <dt className="text-muted-foreground">Loss</dt><dd>{police.loss_gbp ? gbp(police.loss_gbp) : "?"}</dd>
              </dl>
            </CardContent></Card>
            <Card><CardContent className="space-y-2 p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phishing screenshot · AI_COMPLETE vision</p>
              {c.PHISHING_PNG && (
                <a href={`/api/demo/evidence/${c.PHISHING_PNG}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/demo/evidence/${c.PHISHING_PNG}`} alt="Phishing message the customer received" className="max-h-56 w-full rounded border bg-white object-contain" />
                </a>
              )}
              <ul className="list-disc space-y-0.5 pl-5">
                {String(c.PHISHING_RED_FLAGS ?? "").replace(/^"|"$/g, "").replace(/\\n/g, "\n").replace(/\*\*/g, "").split("\n")
                  .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter((l) => l && !/^red flags:?$/i.test(l))
                  .map((l, i) => <li key={i} className={l.includes(":") && i === 0 ? "list-none -ml-5 font-medium" : ""}>{l}</li>)}
              </ul>
            </CardContent></Card>
          </div>
        </div>
      )
    }}</StopBody>
  )
}

function IsThisOurCustomer() {
  return (
    <div className="space-y-5">
      <NameLookup />
      <StopBody stop="retail-names">{(d) => (
        <div className="space-y-2">
          <p className="text-sm font-medium">Names from outside records, matched automatically</p>
          <div className="flex flex-wrap gap-2 text-sm">{d.summary.map((s) => <Badge key={s.DECISION} variant={s.DECISION === "MATCH" ? "default" : s.DECISION === "REVIEW" ? "secondary" : "outline"}>{s.DECISION}: {s.RECORDS}</Badge>)}</div>
          <Table bordered>
            <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>As written</TableHead><TableHead>Matched to</TableHead><TableHead>Evidence</TableHead><TableHead>Decision</TableHead></TableRow></TableHeader>
            <TableBody>{d.examples.map((e, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs text-muted-foreground">{e.SOURCE_DESCRIPTION}</TableCell>
                <TableCell className="font-medium">{e.NAME_AS_WRITTEN}</TableCell>
                <TableCell>{e.MATCHED_NAME} <span className="text-xs text-muted-foreground">{e.MATCHED_CITY}</span></TableCell>
                <TableCell className="space-x-1"><Badge variant={e.DOB_MATCH ? "default" : "outline"}>DOB</Badge><Badge variant={e.TOWN_MATCH ? "default" : "outline"}>Town</Badge></TableCell>
                <TableCell><Badge variant={e.DECISION === "MATCH" ? "default" : "secondary"}>{e.DECISION}</Badge></TableCell>
              </TableRow>))}
            </TableBody>
          </Table>
        </div>
      )}</StopBody>
    </div>
  )
}

const RETAIL_QUESTIONS = ["Which cities make the most profit per customer?", "Which branch closure would cut off the most profitable customers?",
  "How many high-risk customers are on legacy savings rates?", "Is Liz Moor one of our customers?", "Find cases where an elderly customer was told to move money to a safe account"]
const CORPORATE_QUESTIONS = ["What is our corporate payment success rate by scheme?", "Which clients send the most volume and who is their relationship manager?",
  "How many critical alerts are still open?", "Which mule accounts received money from the most victims?"]

const RETAIL: Stop[] = [
  { id: "profit", title: "Where we make money", headline: "Profit, revenue and cost to serve, mapped to the neighbourhood",
    soWhat: "Every customer's monthly profit rolled up to hexagons of about 5 km². Switch to deprivation to see where profit and need diverge.", modules: ["C0", "DA3", "DA6"], render: () => <ProfitMap /> },
  { id: "branches", title: "Branch catchments", headline: "What happens if we close a branch?",
    soWhat: "Real drive-time catchments for every branch, and the customers and profit each closure would cut off. Decide with numbers, not maps on a wall.", modules: ["DA3", "DA4"], regs: ["consumer-duty", "cash-access"], render: () => <BranchCatchments /> },
  { id: "attrition", title: "Who's about to leave", headline: "An attrition model scoring every customer, every month",
    soWhat: "A model in the Snowflake Model Registry finds the customers worth saving, and the reasons: legacy savings rates, closing branches, salaries moving elsewhere. Lifetime value turns risk into money: who to call first, and what to offer.", modules: ["DS0", "DS1", "DS4", "DA5", "DS3"], regs: ["model-risk"], render: () => <Attrition /> },
  { id: "models", title: "Every model on the record", headline: "Model risk: inventoried, validated, signed off",
    soWhat: "The attrition model with everything model risk asks for: where it came from, how well it works against what really happened, what it may be used for, and who approved it. The evidence sits next to the model, not in a slide deck.", modules: ["DS1", "DS3", "DS4"], regs: ["model-risk"], render: () => <ModelInventory /> },
  { id: "voice", title: "What customers are telling us", headline: "Every call, read and summarised by AI SQL",
    soWhat: "Sentiment, reasons and one-line summaries for calls, with a themes paragraph a leader can act on. Approved AI SQL, no data leaves Snowflake.", modules: ["AI4"], regs: ["consumer-duty"], render: () => <CustomerVoice /> },
  { id: "money", title: "Follow the money", headline: "Mule accounts hiding in plain sight",
    soWhat: "Victims who never met pay the same few accounts, which pay the same controllers and log in from the same devices. The network shows the ring at a glance.", modules: ["DS2", "AI4"], regs: ["aml", "app-scams"], render: () => <FollowTheMoney /> },
  { id: "case", title: "One case, worked by AI", headline: "Notes, call, police PDF and phishing screenshot in one view",
    soWhat: "AI SQL reads the PDF, looks at the screenshot and drafts the decision, citing the evidence. The investigator still decides.", modules: ["AI4"], regs: ["app-scams"], render: () => <WorkedCase /> },
  { id: "names", title: "Is this our customer?", headline: "Fuzzy name matching across outside records",
    soWhat: "Police reports and other banks spell names their own way. Search finds the candidates; date of birth and town decide. Leads, never facts on a name alone.", modules: ["AI5"], regs: ["aml"], render: () => <IsThisOurCustomer /> },
  { id: "data-request", title: "A customer asks for their data", headline: "Everything we hold about a customer, in seconds",
    soWhat: "A customer has a right to a copy of their personal data within a month. Personal data is tagged once, so one search finds it across every system, holds back financial crime records for review, shows who has read it and drafts the letter.", modules: ["GOV1", "GOV2", "GOV4"], regs: ["uk-gdpr"], render: () => <DataRequest /> },
  { id: "cases", title: "Find similar cases", headline: "Search case notes and SARs in plain English",
    soWhat: "Describe what happened and get the closest cases, SARs and calls, without knowing the right keywords.", modules: ["AI5"], regs: ["aml"], render: () => <CaseSearch /> },
  { id: "ask", title: "Ask the assistant", headline: "Ask anything, answered from governed data",
    soWhat: "An agent over three semantic views and two search services. It shows which data it used and the SQL it ran.", modules: ["DA1", "AI1", "AI5"], render: () => <AssistantChat suggestions={RETAIL_QUESTIONS} /> },
]

// ---------------- Corporate stops ----------------

/** Weekly payment counts against +/- 3 sigma limits, breaches labelled with their reason, then the
 *  next 4 weeks from SNOWFLAKE.ML.FORECAST with its prediction interval (setup/12b, setup/12c). */
function ControlForecast({ control, forecast, series, onPick }: { control: Record<string, unknown>[]; forecast: Record<string, unknown>[]; series: string; onPick: (s: string) => void }) {
  type Row = { WEEK: string; PAYMENTS?: number; MEAN?: number; BAND?: [number, number]; BREACH?: boolean; REASON?: string; FORECAST?: number; FBAND?: [number, number] }
  const rows: Row[] = control.filter((r) => r.SERIES === series && r.UCL != null).map((r) => ({
    WEEK: String(r.WEEK), PAYMENTS: Number(r.PAYMENTS), MEAN: Number(r.MEAN), BAND: [Number(r.LCL), Number(r.UCL)],
    BREACH: Boolean(r.BREACH), REASON: r.REASON ? String(r.REASON) : undefined,
  }))
  const fc = forecast.filter((r) => r.SERIES === series)
  // join the forecast onto the last actual week so the dashed line continues from it
  const last = rows[rows.length - 1]
  if (last && fc.length) { last.FORECAST = last.PAYMENTS; last.FBAND = [last.PAYMENTS!, last.PAYMENTS!] }
  for (const r of fc) rows.push({ WEEK: String(r.WEEK), FORECAST: Number(r.FORECAST), FBAND: [Number(r.LOWER_BOUND), Number(r.UPPER_BOUND)] })
  const breaches = rows.filter((r) => r.BREACH)
  // unexplained weeks in any scheme: a total can hide one scheme's incident, so list them all
  const anywhere = control.filter((r) => r.REASON === "Unexplained" && r.SERIES !== "ALL")
  const day = (w: unknown) => new Date(String(w)).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 22, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="WEEK" tickFormatter={(w) => new Date(w).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} fontSize={11} minTickGap={28} />
            <YAxis fontSize={11} width={44} />
            <Tooltip labelFormatter={(l) => `Week of ${l}`} formatter={(v, name) => {
              if (Array.isArray(v)) return [`${num(v[0])} to ${num(v[1])}`, name]
              return [num(v), name]
            }} />
            <Area dataKey="BAND" name="Control limits (mean ± 3σ)" stroke="none" fill="var(--chart-2)" fillOpacity={0.15} isAnimationActive={false} />
            <Area dataKey="FBAND" name="Forecast range" stroke="none" fill="var(--chart-3)" fillOpacity={0.25} isAnimationActive={false} />
            <Line dataKey="MEAN" name="8-week mean" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            <Line dataKey="FORECAST" name="Forecast" stroke="var(--chart-3)" strokeDasharray="6 4" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line dataKey="PAYMENTS" name="Payments" stroke={CHART_COLORS[0]} strokeWidth={2.5} isAnimationActive={false}
              dot={(p: { cx?: number; cy?: number; payload?: Row; index?: number }) => {
                const r = p.payload
                if (!r?.BREACH || p.cx == null || p.cy == null) return <g key={p.index} />
                const bad = r.REASON === "Unexplained"
                return (
                  <g key={p.index}>
                    <circle cx={p.cx} cy={p.cy} r={bad ? 6 : 4.5} fill={bad ? "var(--destructive)" : "var(--background)"} stroke={bad ? "var(--destructive)" : "var(--muted-foreground)"} strokeWidth={2} />
                    {bad && <text x={p.cx} y={p.cy - 11} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--destructive)" stroke="var(--background)" strokeWidth={3} paintOrder="stroke">Unexplained</text>}
                  </g>
                )
              }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {anywhere.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-destructive">Unexplained weeks:</span>
          {anywhere.map((r) => (
            <button key={`${r.SERIES}-${r.WEEK}`} type="button" onClick={() => onPick(String(r.SERIES))}
              className={cn("rounded-full border border-destructive/40 px-2 py-0.5 hover:bg-destructive/10", r.SERIES === series && "bg-destructive/10 font-semibold")}>
              {String(r.SERIES)} · week of {day(r.WEEK)} · {Number(r.PAYMENTS) > Number(r.UCL) ? "surge" : "drop"}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Payments per week against the mean ± 3 standard deviations of the previous 8 weeks. Hollow points break the limits for a calendar reason
        ({[...new Set(breaches.filter((r) => r.REASON !== "Unexplained").map((r) => r.REASON))].join(", ").toLowerCase() || "none in this series"});
        red ones have no calendar explanation and are worth investigating.
        The dashed line is the next {fc.length} weeks from Snowflake&apos;s built-in ML forecasting (SNOWFLAKE.ML.FORECAST), with its range. It has one year of history, so holiday weeks are its least reliable.
      </p>
    </div>
  )
}

function Payments() {
  const sel = useSelection()
  const [view, setView] = useState<"control" | "volume">("control")
  return (
    <StopBody stop="corporate-payments">{(d) => {
      const k = d.kpis[0] ?? {}
      // one row per week: the total plus a column per scheme
      const weeks = new Map<string, Record<string, number | string>>()
      for (const r of d.weekly) {
        const w = weeks.get(String(r.WEEK)) ?? { WEEK: String(r.WEEK), TOTAL: 0 }
        w[String(r.PAYMENT_TYPE)] = Number(r.VOLUME_GBP)
        w.TOTAL = Number(w.TOTAL) + Number(r.VOLUME_GBP)
        weeks.set(String(r.WEEK), w)
      }
      const rows = [...weeks.values()]
      const schemes = d.schemes.map((s) => String(s.PAYMENT_TYPE))
      // six schemes, five theme colours: the sixth uses the foreground colour so no two match
      const palette = [...CHART_COLORS, "var(--muted-foreground)"]
      const colour = (s: string) => palette[schemes.indexOf(s) % palette.length]
      const lines = sel.picked.length ? sel.picked : ["TOTAL"]
      const lastRow = rows[rows.length - 1] ?? {}
      // the control chart follows one series: the scheme picked last, or all schemes
      const series = sel.picked.length ? sel.picked[sel.picked.length - 1] : "ALL"
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Payments" value={num(k.PAYMENTS)} hint="last 12 months" />
            <StatCard label="Volume" value={`£${(Number(k.VOLUME_GBP) / 1e9).toFixed(1)}bn`} />
            <StatCard label="Success rate" value={`${Number(k.SUCCESS_PCT).toFixed(1)}%`} />
            <StatCard label="95th percentile time" value={`${(Number(k.P95_MS) / 1000).toFixed(1)} s`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <div className="flex min-h-[380px] flex-col">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {view === "control" ? "Payments per week" : "Weekly volume"}
                  {view === "control" ? (series === "ALL" ? ", all schemes" : `: ${series}`) : (sel.picked.length ? `: ${sel.picked.join(", ")}` : ", all schemes")}
                  {" "}<span className="font-normal text-muted-foreground">- pick a scheme in the table</span>
                </p>
                <div className="flex items-center gap-2">
                  {sel.picked.length > 0 && <button className="text-xs text-primary underline" onClick={sel.clear}>Show all</button>}
                  <div className="flex overflow-hidden rounded-md border text-xs">
                    {([["control", "Control chart & forecast"], ["volume", "Volume (£)"]] as const).map(([v, label]) => (
                      <button key={v} type="button" onClick={() => setView(v)}
                        className={cn("px-2.5 py-1", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex-1">
                {view === "control" ? (
                  <ControlForecast control={d.control ?? []} forecast={d.forecast ?? []} series={series} onPick={(s) => { sel.clear(); sel.toggle(s, false) }} />
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 16, right: 64, left: 8, bottom: 4 }}>
                    <XAxis dataKey="WEEK" hide />
                    {/* a line needn't start at zero: start 10% under the lowest week so it fills the height without exaggerating the swings */}
                    <YAxis hide domain={[(lo: number) => lo * 0.9, "dataMax"]} />
                    <Tooltip formatter={(v) => gbpM(v)} labelFormatter={(l) => `Week of ${l}`} />
                    {lines.map((s) => (
                      <Line key={s} dataKey={s} name={s === "TOTAL" ? "All schemes" : s} dot={false} isAnimationActive={false}
                        stroke={s === "TOTAL" ? CHART_COLORS[0] : colour(s)} strokeWidth={sel.hovered === s ? 4 : 2.5}>
                        <LabelList dataKey={s} content={({ x, y, index }) => index === rows.length - 1 ? (
                          <text x={Number(x) + 6} y={Number(y)} dy={4} fontSize={12} fontWeight={600} fill="var(--foreground)">{gbpM(lastRow[s])}</text>
                        ) : null} />
                      </Line>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                )}
              </div>
              {view === "volume" && <p className="text-xs text-muted-foreground">{rows[0]?.WEEK} to {lastRow.WEEK}, whole weeks. Value swings with a handful of very large payments; the control chart counts payments instead.</p>}
            </div>
            <Table bordered>
              <TableHeader><TableRow><TableHead>Scheme</TableHead><TableHead className="text-right">Volume</TableHead><TableHead className="text-right">Success</TableHead></TableRow></TableHeader>
              <TableBody>{d.schemes.map((s) => {
                const id = String(s.PAYMENT_TYPE)
                return (
                  <TableRow key={id} onClick={(e) => sel.toggle(id, e.shiftKey || e.metaKey || e.ctrlKey)} onMouseEnter={() => sel.setHovered(id)} onMouseLeave={() => sel.setHovered(null)}
                    className={cn("cursor-pointer", sel.isPicked(id) && "bg-primary/15 font-medium", !sel.active(id) && "opacity-50")}>
                    <TableCell><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: colour(id) }} />{id}</TableCell>
                    <TableCell className="text-right">{gbpM(s.VOLUME_GBP)}</TableCell>
                    <TableCell className="text-right">{Number(s.SUCCESS_PCT).toFixed(1)}%</TableCell>
                  </TableRow>
                )
              })}</TableBody>
            </Table>
          </div>
        </div>
      )
    }}</StopBody>
  )
}

function Clients() {
  const sel = useSelection()
  const nav = useTourNav()
  return (
    <StopBody stop="corporate-clients">{(d) => {
      const failed = d.clients.reduce((a, c) => a + Number(c.FAILED_VALUE_GBP), 0)
      const below = d.clients.filter((c) => Number(c.SUCCESS_PCT) < 96)
      const outside = d.clients.reduce((a, c) => a + Number(c.OUTSIDE_SLA), 0)
      const worst = [...d.clients].sort((a, b) => Number(b.OUTSIDE_SLA_VALUE_GBP) - Number(a.OUTSIDE_SLA_VALUE_GBP))[0]
      const maxVol = Math.max(...d.clients.map((c) => Number(c.VOLUME_GBP)), 1)
      const maxPct = Math.max(...d.clients.map((c) => Number(c.OUTSIDE_SLA) / Math.max(Number(c.PAYMENTS), 1)), 0.0001)
      return (
      <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Client payments that failed" value={gbpM(failed)} hint={`across the top ${d.clients.length} clients, 12 months`} />
        <StatCard label="Most exposed client" value={String(worst?.CLIENT_NAME ?? "-")} hint={`${gbpM(worst?.OUTSIDE_SLA_VALUE_GBP)} outside SLA; RM ${worst?.RM_NAME ?? ""}`} />
        <StatCard label="Clients below 96% success" value={num(below.length)} hint="the conversation to have before they call" />
        <StatCard label="Payments outside SLA" value={num(outside)} hint="failed or late, same rule as the live SLA view" />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Click a row to highlight it; click <b>Outside SLA</b> to see that client's late payments live.</p>
        {sel.picked.length > 0 && <button className="text-xs text-primary underline" onClick={sel.clear}>Clear</button>}
      </div>
      <Table bordered>
        <TableHeader><TableRow>
          <TableHead className="w-[34%]">Client · volume, 12 months</TableHead><TableHead>Relationship manager</TableHead>
          <TableHead className="text-right">Success</TableHead><TableHead className="w-[18%]">Outside SLA</TableHead>
          <TableHead className="text-right">Failed value</TableHead><TableHead className="text-right">95th pct time</TableHead>
        </TableRow></TableHeader>
        <TableBody>{d.clients.map((c) => {
          const id = String(c.CLIENT_NAME)
          const pct = Number(c.OUTSIDE_SLA) / Math.max(Number(c.PAYMENTS), 1)
          return (
            <TableRow key={id} onClick={(e) => sel.toggle(id, e.shiftKey || e.metaKey || e.ctrlKey)} onMouseEnter={() => sel.setHovered(id)} onMouseLeave={() => sel.setHovered(null)}
              className={cn("cursor-pointer", (sel.isPicked(id) || sel.hovered === id) && "bg-primary/15", !sel.active(id) && "opacity-50")}>
              <TableCell>
                <div className="flex items-baseline justify-between gap-2"><span className="font-medium">{id}</span><span className="text-xs text-muted-foreground">{c.SECTOR}</span></div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full" style={{ width: `${(100 * Number(c.VOLUME_GBP)) / maxVol}%`, background: CHART_COLORS[0] }} /></div>
                  <span className="w-14 text-right text-xs tabular-nums">{gbpM(c.VOLUME_GBP)}</span>
                </div>
              </TableCell>
              <TableCell>{c.RM_NAME}</TableCell>
              <TableCell className={cn("text-right", Number(c.SUCCESS_PCT) < 95 && "text-destructive")}>{c.SUCCESS_PCT}%</TableCell>
              <TableCell>
                <button onClick={(e) => { e.stopPropagation(); nav.goTo("live", id) }} title={`See ${id}'s payments outside SLA on the live stop`}
                  className="group w-full text-left">
                  <div className="flex items-baseline justify-between text-xs"><span className="font-medium group-hover:underline">{num(c.OUTSIDE_SLA)}</span><span className="text-muted-foreground">{(100 * pct).toFixed(1)}% · {gbpM(c.OUTSIDE_SLA_VALUE_GBP)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full" style={{ width: `${(100 * pct) / maxPct}%`, background: CHART_COLORS[3] }} /></div>
                </button>
              </TableCell>
              <TableCell className="text-right">{gbpM(c.FAILED_VALUE_GBP)}</TableCell>
              <TableCell className={cn("text-right", Number(c.P95_S) > 12 && "text-destructive")}>{c.P95_S} s</TableCell>
            </TableRow>
          )
        })}</TableBody>
      </Table>
      </div>
      )
    }}</StopBody>
  )
}

const SEVERITY_COLOURS: Record<string, string> = { CRITICAL: "var(--destructive)", HIGH: "var(--chart-4)", MEDIUM: "var(--chart-3)", LOW: "var(--chart-2)" }

function Alerts() {
  const sel = useSelection()
  return (
    <StopBody stop="corporate-alerts">{(d) => {
      const shown = sel.picked.length ? d.open.filter((a) => sel.picked.includes(String(a.SEVERITY))) : d.open.filter((a) => ["CRITICAL", "HIGH"].includes(String(a.SEVERITY)))
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex min-h-[380px] flex-col">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-medium">Open alerts by severity <span className="font-normal text-muted-foreground">- click one, or drag a box for several</span></p>
              {sel.picked.length > 0 && <button className="text-xs text-primary underline" onClick={sel.clear}>Show all</button>}
            </div>
            <div className="flex-1">
              <ColumnChart data={d.severity} x="SEVERITY" y="OPEN_ALERTS" color={CHART_COLORS[3]} colors={SEVERITY_COLOURS} sel={sel} />
            </div>
          </div>
          <div className="flex flex-col">
            <p className="mb-1 text-sm font-medium">{sel.picked.length ? `Latest open: ${sel.picked.map((s) => s.toLowerCase()).join(", ")}` : "Latest open critical and high"}</p>
            <ul className="max-h-[440px] flex-1 space-y-2 overflow-y-auto pr-1 text-sm">{shown.map((a) => {
              const s = String(a.SEVERITY)
              return (
                <li key={String(a.ALERT_ID)} onMouseEnter={() => sel.setHovered(s)} onMouseLeave={() => sel.setHovered(null)}
                  className={cn("rounded-md border p-2 transition-colors", sel.hovered === s && "bg-muted/60")}>
                  <Badge variant={s === "CRITICAL" ? "destructive" : "warning"} className="mr-2">{s}</Badge>
                  <span className="text-xs text-muted-foreground">{a.ALERT_DAY} · {a.PAYMENT_TYPE}</span>
                  <p className="mt-1">{a.ALERT_DESCRIPTION}</p>
                </li>
              )
            })}</ul>
          </div>
        </div>
      )
    }}</StopBody>
  )
}

function Feedback() {
  const sel = useSelection()
  return (
    <StopBody stop="corporate-feedback">{(d) => {
      const shown = (sel.picked.length ? d.low.filter((f) => sel.picked.includes(String(f.THEME))) : d.low.filter((f) => f.SENTIMENT === "negative")).slice(0, 8)
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex min-h-[360px] flex-col">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-medium">{num(d.rating[0]?.FEEDBACK)} comments by theme (AI_CLASSIFY, AI_SENTIMENT) <span className="font-normal text-muted-foreground">- click one, or drag a box for several</span></p>
              {sel.picked.length > 0 && <button className="text-xs text-primary underline" onClick={sel.clear}>Show all</button>}
            </div>
            <div className="flex-1">
              <RowChart data={d.themes} label="THEME" sel={sel}
                series={[{ key: "NEGATIVE", name: "Negative", color: CHART_COLORS[3] }, { key: "POSITIVE", name: "Positive", color: CHART_COLORS[1] }]} />
            </div>
            <Swatches items={[{ name: "Negative", color: CHART_COLORS[3] }, { name: "Positive", color: CHART_COLORS[1] }]} />
          </div>
          <div className="flex flex-col">
            <p className="mb-1 text-sm font-medium">{sel.picked.length ? `What clients say: ${sel.picked.join(", ")}` : "The complaints heard most often"}</p>
            <ul className="max-h-[440px] flex-1 space-y-2 overflow-y-auto pr-1 text-sm">{shown.map((f, i) => (
              <li key={i} onMouseEnter={() => sel.setHovered(String(f.THEME))} onMouseLeave={() => sel.setHovered(null)}
                className={cn("flex gap-2 rounded-md border p-2", sel.hovered === f.THEME && "bg-muted/60")}>
                <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full" title={`${f.SENTIMENT} sentiment`}
                  style={{ background: f.SENTIMENT === "negative" ? CHART_COLORS[3] : f.SENTIMENT === "positive" ? CHART_COLORS[1] : "var(--muted-foreground)" }} />
                <span><Badge variant="outline" className="mr-2">{f.THEME} · {num(f.TIMES)}×</Badge>{f.FEEDBACK_TEXT}</span>
              </li>))}
            </ul>
          </div>
        </div>
      )
    }}</StopBody>
  )
}

// the journey of a sent payment, as the live stop shows it (pipeline query in lib/demo.ts)
const LIVE_STEPS = [
  { key: "sent", label: "Payment received", hint: "£250,000 CHAPS from Liverpool Freight, still pending after 9 s" },
  { key: "table", label: "Breach detected", hint: "the SLA dynamic table, within a minute of the Iceberg payments table" },
  { key: "alert", label: "Alert raised", hint: "Snowflake Alert DEMO_ALERT_CHAPS_AT_RISK logs a CRITICAL operational alert" },
  { key: "email", label: "RM briefed", hint: "an HTML briefing with an AI-drafted call lands in the RM's inbox" },
] as const
type LiveStep = (typeof LIVE_STEPS)[number]["key"]

function LiveSla() {
  const sel = useSelection()
  const nav = useTourNav()
  // a sent payment: its id, when each step was first seen (ms after sending), and CHAPS breaches before it
  const [run, setRun] = useState<{ pid: string; sentAt: number; before: number; seen: Partial<Record<LiveStep, number>>; error?: string } | null>(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [, tick] = useState(0)
  const done = run?.seen.email != null
  const watching = run != null && !done && !run.error && Date.now() - run.sentAt < 240_000
  const q = useStop("corporate-live", watching ? 5_000 : undefined)
  const chaps = (d?: StopData) => Number(d?.breaches.find((r) => r.PAYMENT_TYPE === "CHAPS")?.BREACHES ?? 0)
  // a clock for the elapsed counter
  useEffect(() => {
    if (!watching) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [watching])
  // note when each step first shows up for this payment
  useEffect(() => {
    const p = q.data?.pipeline[0]
    if (!run || !run.pid || !p || p.PAYMENT_ID !== run.pid) return
    const now = Date.now() - run.sentAt
    const seen = { ...run.seen }
    if (seen.table == null && p.IN_DYNAMIC_TABLE) seen.table = now
    if (seen.alert == null && p.ALERT_ID) seen.alert = now
    if (seen.email == null && p.MESSAGE_ID) seen.email = now
    if (JSON.stringify(seen) !== JSON.stringify(run.seen)) setRun({ ...run, seen })
  }, [q.data, run])
  const send = async () => {
    const before = chaps(q.data)
    setRun({ pid: "", sentAt: Date.now(), before, seen: { sent: 0 } })
    const r = await fetch("/api/demo/live", { method: "POST" })
    const j = await r.json().catch(() => ({}))
    setRun((cur) => cur && (r.ok ? { ...cur, pid: j.paymentId } : { ...cur, error: j.error ?? "Couldn't add the payment" }))
  }
  const elapsed = run ? Math.round((Date.now() - run.sentAt) / 1000) : 0
  const secs = (ms?: number) => (ms == null ? "" : ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`)
  const emailId = q.data?.pipeline[0]?.PAYMENT_ID === run?.pid ? (q.data?.pipeline[0]?.MESSAGE_ID as string | undefined) : undefined
  return (
    <StopBody stop="corporate-live" poll={watching ? 5_000 : undefined}>{(d) => {
      const total = d.breaches.reduce((a, r) => a + Number(r.BREACHES), 0)
      const value = d.breaches.reduce((a, r) => a + Number(r.BREACH_VALUE_GBP), 0)
      const ice = d.iceberg[0] ?? {}
      const picked = sel.picked.length ? d.breaches.filter((r) => sel.picked.includes(String(r.PAYMENT_TYPE))) : d.breaches
      const focusRows = nav.focus ? d.clientSla.filter((r) => r.CLIENT_NAME === nav.focus && Number(r.OUTSIDE_SLA) > 0) : []
      return (
        <div className="space-y-4">
          {nav.focus && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Focused on {nav.focus}</Badge>
                <span className="text-muted-foreground">RM {String(d.clientSla.find((r) => r.CLIENT_NAME === nav.focus)?.RM_NAME ?? "")} · {num(focusRows.reduce((a, r) => a + Number(r.OUTSIDE_SLA), 0))} payments outside SLA, {gbpM(focusRows.reduce((a, r) => a + Number(r.OUTSIDE_SLA_VALUE_GBP), 0))}</span>
                <button className="ml-auto text-xs text-primary underline" onClick={() => nav.goTo("clients")}>Back to Client 360</button>
                <button className="text-xs text-primary underline" onClick={nav.clearFocus}>Clear</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">{focusRows.map((r) => (
                <span key={String(r.PAYMENT_TYPE)} className="rounded-md border bg-background px-2 py-1 text-xs">{r.PAYMENT_TYPE}: <b>{num(r.OUTSIDE_SLA)}</b> of {num(r.PAYMENTS)} · {gbpM(r.OUTSIDE_SLA_VALUE_GBP)}</span>
              ))}</div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Late or failed payments" value={num(total)} hint="failed, or over the scheme's time limit" />
            <StatCard label="Value at risk" value={`£${(value / 1e9).toFixed(2)}bn`} hint="money that didn't move on time" />
            <StatCard label="Clients affected" value={num(d.clients[0]?.CLIENTS)} hint="corporate clients with at least one" />
            <StatCard label="Time to tell the RM" value={run?.seen.email != null ? secs(run.seen.email) : "~1-2 min"} hint="today: next morning's MI report" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardContent className="space-y-3 p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">A client's payment runs late</p>
              <p>Liverpool Freight is paying its suppliers: a <b>£250,000 CHAPS</b> payment. It has been stuck in processing for 9 seconds against the 5-second limit, and CHAPS closes at 18:00. Miss it and the suppliers aren't paid today.</p>
              <p className="text-muted-foreground">Will the relationship manager hear about it before the client calls?</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={send} disabled={watching}>Send the payment</Button>
                <Button size="sm" variant="outline" onClick={() => setInboxOpen(true)}>
                  Open the RM's inbox{emailId && <span className="ml-1 inline-block size-2 rounded-full bg-red-600" aria-label="new mail" />}
                </Button>
                {watching && <span className="text-xs text-muted-foreground">{elapsed} s since sending</span>}
                {run?.error && <span className="text-xs text-destructive">{run.error}</span>}
              </div>
              <ol className="space-y-2 border-l pl-4">
                {LIVE_STEPS.map((s) => {
                  const at = run?.seen[s.key]
                  const active = run != null && at == null && !run.error && LIVE_STEPS.findIndex((x) => run.seen[x.key] == null) === LIVE_STEPS.findIndex((x) => x.key === s.key)
                  return (
                    <li key={s.key} className="relative">
                      <span className={cn("absolute -left-[21px] top-1.5 inline-block size-2.5 rounded-full border",
                        at != null ? "border-primary bg-primary" : active ? "animate-pulse border-primary" : "bg-background")} />
                      <p className={cn("font-medium", at == null && "text-muted-foreground")}>{s.label}{at != null && run && <span className="ml-2 text-xs font-normal text-primary">{s.key === "sent" ? "0 s" : `+${secs(at)}`}</span>}</p>
                      <p className="text-xs text-muted-foreground">{s.hint}</p>
                    </li>
                  )
                })}
              </ol>
              {done && <p className="text-xs font-medium text-primary">The RM knew in {secs(run!.seen.email)}, with the client, the amount, the time left and what to say. No batch job, no overnight report. The alert also shows on the next stop.</p>}
              {run && !watching && !done && !run.error && <p className="text-xs text-muted-foreground">Still waiting after 4 minutes; the alert will brief the RM on its next run.</p>}
            </CardContent></Card>
            <div className="flex flex-col gap-3">
              <div className="flex min-h-[260px] flex-col">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-medium">Late or failed, by scheme <span className="font-normal text-muted-foreground">- click one, or drag a box for several</span></p>
                  {sel.picked.length > 0 && <button className="text-xs text-primary underline" onClick={sel.clear}>Show all</button>}
                </div>
                <div className="flex-1">
                  <RowChart data={d.breaches} label="PAYMENT_TYPE" sel={sel} series={[{ key: "BREACHES", name: "Late or failed", color: CHART_COLORS[3] }]} />
                </div>
              </div>
              <ul className="divide-y rounded-lg border text-sm">{picked.map((r) => {
                const id = String(r.PAYMENT_TYPE)
                return (
                  <li key={id} onMouseEnter={() => sel.setHovered(id)} onMouseLeave={() => sel.setHovered(null)}
                    className={cn("flex items-center gap-3 px-3 py-2", sel.hovered === id && "bg-muted/60")}>
                    <span className="font-medium">{r.SLA_NAME}</span>
                    <span className="text-xs text-muted-foreground">limit {Number(r.MAX_PROCESSING_TIME_MS) >= 3_600_000 ? `${Number(r.MAX_PROCESSING_TIME_MS) / 3_600_000} h` : `${Number(r.MAX_PROCESSING_TIME_MS) / 1000} s`}</span>
                    <span className="ml-auto">{num(r.BREACHES)} of {num(r.PAYMENTS)}</span>
                    <span className="w-20 text-right font-medium">{gbpM(r.BREACH_VALUE_GBP)}</span>
                  </li>
                )
              })}</ul>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            How it works: payments land in open Iceberg tables ({num(ice.TABLES)} tables, {num(ice.ROWS_HELD)} rows) any engine can read. A dynamic table keeps the SLA view within {d.refresh[0]?.target_lag ?? "1 minute"} of them; a Snowflake Alert raises the operational alert and writes the RM's email. The demo inbox is a table: nothing is emailed{Number(d.added[0]?.LIVE_PAYMENTS) > 0 ? `; ${num(d.added[0]?.LIVE_PAYMENTS)} payments sent in this demo copy so far` : ""}.
          </p>
          <Sheet open={inboxOpen} onOpenChange={setInboxOpen}>
            <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-[1200px]">
              <SheetHeader className="mb-3"><SheetTitle>The relationship manager's inbox</SheetTitle></SheetHeader>
              <DemoInbox highlight={emailId ?? null} />
            </SheetContent>
          </Sheet>
        </div>
      )
    }}</StopBody>
  )
}

const limitLabel = (ms: number) => (ms >= 3_600_000 ? `${+(ms / 3_600_000).toFixed(1)} h` : ms >= 60_000 ? `${+(ms / 60_000).toFixed(1)} min` : `${+(ms / 1000).toFixed(1)} s`)

type WhatIfData = { schemes: Rows; clients: Rows; effort?: Record<string, unknown> }

function WhatIf() {
  const [speed, setSpeed] = useState(0)                       // % faster, 0-75
  const [fix, setFix] = useState(0)                           // % of failed payments prevented, 0-90
  const [factor, setFactor] = useState<Record<string, number>>({})  // per-scheme limit multiplier, 0.5-2
  // wait for the sliders to settle before asking Snowflake
  const [asked, setAsked] = useState({ speed, fix, factor })
  useEffect(() => { const t = setTimeout(() => setAsked({ speed, fix, factor }), 250); return () => clearTimeout(t) }, [speed, fix, factor])
  const base = useQuery<WhatIfData>({ queryKey: ["demo", "whatif-base"], queryFn: () => runWhatIf(0, 0, {}), staleTime: Infinity })
  const today = base.data?.schemes ?? []
  const limits = Object.fromEntries(today.filter((s) => (asked.factor[s.PAYMENT_TYPE] ?? 1) !== 1)
    .map((s) => [s.PAYMENT_TYPE, Math.round(Number(s.TODAY_MS) * asked.factor[s.PAYMENT_TYPE])]))
  const q = useQuery<WhatIfData>({
    queryKey: ["demo", "whatif", asked.speed, asked.fix, limits], queryFn: () => runWhatIf(asked.speed / 100, asked.fix / 100, limits),
    enabled: !!base.data, placeholderData: (prev) => prev, staleTime: Infinity,
  })
  if (base.isPending) return <Skeleton className="h-[420px]" />
  if (base.isError) return <EmptyState variant="error" title="Couldn't load the scenario" description={base.error.message} />
  const d = q.data ?? base.data
  const sum = (k: string) => d.schemes.reduce((a, r) => a + Number(r[k]), 0)
  const outToday = sum("OUT_TODAY"), outNew = sum("OUT_NEW")
  const valToday = sum("VALUE_TODAY_GBP"), valNew = sum("VALUE_NEW_GBP")
  const cToday = d.clients.length, cNew = d.clients.filter((c) => Number(c.OUT_NEW) > 0).length
  const freed = d.clients.filter((c) => Number(c.OUT_NEW) < Number(c.OUT_TODAY)).slice(0, 6)
  const changed = speed > 0 || fix > 0 || Object.values(factor).some((f) => f !== 1)
  const delta = (a: number, b: number) => (a === b ? "no change" : `${b < a ? "▼" : "▲"} ${num(Math.abs(a - b))} (${Math.round((100 * Math.abs(a - b)) / Math.max(a, 1))}%)`)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Payments outside SLA" value={num(outNew)} hint={changed ? `today ${num(outToday)} · ${delta(outToday, outNew)}` : "today, 12 months"} />
        <StatCard label="Value outside SLA" value={gbpM(valNew)} hint={changed ? `today ${gbpM(valToday)} · ${valNew <= valToday ? "saves" : "adds"} ${gbpM(Math.abs(valToday - valNew))}` : "money that didn't move on time"} />
        <StatCard label="Clients affected" value={num(cNew)} hint={changed ? `today ${num(cToday)} · ${delta(cToday, cNew)}` : "with at least one late or failed payment"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,2fr)_3fr]">
        <Card><CardContent className="space-y-4 p-4 text-sm">
          <div>
            <div className="flex items-center justify-between"><p className="font-medium">Stop failures before they happen</p><b className="tabular-nums">{fix}%</b></div>
            <input type="range" min={0} max={90} step={5} value={fix} onChange={(e) => setFix(Number(e.target.value))} className="w-full accent-primary" aria-label="Failures prevented" />
            <p className="text-xs text-muted-foreground">Most breaches here are failed payments, not slow ones: bad sort codes and IBANs, Confirmation of Payee mismatches, clearing timeouts, missed cut-offs. Catching them before they're sent is where the value is.</p>
          </div>
          <div>
            <div className="flex items-center justify-between"><p className="font-medium">Make every payment faster</p><b className="tabular-nums">{speed}%</b></div>
            <input type="range" min={0} max={75} step={5} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-primary" aria-label="Speed-up" />
            <p className="text-xs text-muted-foreground">Shorter processing times. Matters most if you tighten a limit below.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><p className="font-medium">Time limit by scheme</p>
              {changed && <button className="text-xs text-primary underline" onClick={() => { setSpeed(0); setFix(0); setFactor({}) }}>Reset</button>}</div>
            {today.map((s) => {
              const f = factor[s.PAYMENT_TYPE] ?? 1
              return (
                <div key={s.PAYMENT_TYPE}>
                  <div className="flex justify-between text-xs"><span>{s.SLA_NAME}</span>
                    <span className={cn("tabular-nums", f !== 1 && "font-semibold text-primary")}>{limitLabel(Number(s.TODAY_MS) * f)}{f !== 1 && <span className="font-normal text-muted-foreground"> (was {limitLabel(Number(s.TODAY_MS))})</span>}</span></div>
                  <input type="range" min={0.5} max={2} step={0.1} value={f} aria-label={`${s.SLA_NAME} limit`}
                    onChange={(e) => setFactor({ ...factor, [s.PAYMENT_TYPE]: Number(e.target.value) })} className="w-full accent-primary" />
                </div>
              )
            })}
            <p className="text-xs text-muted-foreground">Half to double today's limit. Tightening one shows where today's speed would fall short; loosening one hides lateness from the numbers, not from the client.</p>
          </div>
        </CardContent></Card>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Outside SLA by scheme, today vs what if {q.isFetching && <span className="font-normal text-muted-foreground">· updating</span>}</p>
          <div className="h-[300px]">
            <ResponsiveContainer>
              <BarChart data={d.schemes.map((s) => ({ PAYMENT_TYPE: s.PAYMENT_TYPE, Today: Number(s.OUT_TODAY), "What if": Number(s.OUT_NEW) }))} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid horizontal={false} stroke={CHART_THEME.grid} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="PAYMENT_TYPE" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => num(v)} />
                <Legend />
                <Bar dataKey="Today" fill={CHART_COLORS[3]} radius={[0, 3, 3, 0]} />
                <Bar dataKey="What if" fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {changed && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="mb-1 font-medium">{freed.length ? "Clients who would feel it most" : "No client would see fewer late payments"}</p>
              <ul className="space-y-0.5">{freed.map((c) => (
                <li key={String(c.CLIENT_NAME)} className="flex justify-between gap-2 text-xs"><span>{c.CLIENT_NAME} <span className="text-muted-foreground">· RM {c.RM_NAME}</span></span>
                  <span className="tabular-nums">{num(c.OUT_TODAY)} → <b>{num(c.OUT_NEW)}</b>{Number(c.OUT_NEW) === 0 && " · back inside SLA"}</span></li>
              ))}</ul>
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Modelled on 12 months of demo payments ({num(sum("PAYMENTS"))}), recalculated in Snowflake each time you move a slider. Same rule as the live SLA view: a payment is outside SLA if it failed or took longer than its scheme's limit.</p>
    </div>
  )
}

async function runWhatIf(speedup: number, fixFailures: number, limits: Record<string, number>): Promise<WhatIfData> {
  const r = await fetch("/api/demo/whatif", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ speedup, fixFailures, limits }) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? "Failed")
  return j
}

// Public UK enforcement cases: ENFORCEMENT in lib/regulations.ts (figures checked against each Final Notice)

function NumberInput({ label, value, onChange, prefix, suffix, step = 1, hint }: { label: string; value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; step?: number; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <span className="mt-1 flex items-center gap-1 rounded-md border px-2 py-1 focus-within:ring-2 focus-within:ring-ring">
        {prefix && <span className="text-muted-foreground">{prefix}</span>}
        <input type="number" min={0} step={step} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} className="w-full bg-transparent tabular-nums outline-none" />
        {suffix && <span className="text-muted-foreground">{suffix}</span>}
      </span>
      {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

function DoNothing() {
  const nav = useTourNav()
  const base = useQuery<WhatIfData>({ queryKey: ["demo", "whatif-base"], queryFn: () => runWhatIf(0, 0, {}), staleTime: Infinity })
  const [rate, setRate] = useState(60)                  // £ an hour, loaded cost of an operations analyst
  const [leavers, setLeavers] = useState(1)             // corporate clients lost a year to repeated breaches
  const [clientRevenue, setClientRevenue] = useState(250_000)
  const [incident, setIncident] = useState(0)           // which public case to use as "a major incident"
  const [chance, setChance] = useState(2)               // % chance a year of an incident on that scale
  if (base.isPending) return <Skeleton className="h-[420px]" />
  if (base.isError) return <EmptyState variant="error" title="Couldn't load the numbers" description={base.error.message} />
  const breaches = base.data.schemes.reduce((a, r) => a + Number(r.OUT_TODAY), 0)
  const clients = base.data.clients.length
  const alerts = Number(base.data.effort?.ALERTS ?? 0)
  const hours = Number(base.data.effort?.MEDIAN_MIN ?? 0) / 60
  const big = ENFORCEMENT[incident]
  // measured: counted or timed in the data, with one rate. estimate: not in the data; says where to confirm it
  const parts = [
    { label: "Handling late and failed payments", kind: "measured", value: breaches * hours * rate,
      how: `${num(breaches)} payments × ${hours.toFixed(1)} h each × ${gbp(rate)}/h`,
      check: `Payment count and time per case are in the data: median resolution of ${num(alerts)} payment alerts. Only the hourly rate is yours.` },
    { label: "Clients who leave", kind: "estimate", value: leavers * clientRevenue,
      how: `${num(leavers)} of ${num(clients)} affected clients × ${gbpM(clientRevenue)} revenue`,
      check: "Not in the demo data. Confirm against relationship-manager attrition and client revenue in your CRM." },
    { label: "A major incident, weighted by its chance", kind: "estimate", value: (chance / 100) * (big.fine + big.redress),
      how: `${chance}% × ${gbpM(big.fine + big.redress)} (fine and redress, ${big.firm.split(",")[0]})`,
      check: "The amount is public (Final Notice above). The chance is a judgement: take it from your operational risk scenario analysis." },
  ]
  const measured = parts.filter((p) => p.kind === "measured").reduce((a, p) => a + p.value, 0)
  const total = parts.reduce((a, p) => a + p.value, 0)
  const pillars = [
    { title: "One governed platform", text: "Data stays where it is, in open tables any engine can read. Tags, masking and row access policies follow it into every tool, agent and app, so change doesn't mean new copies to secure.", stop: "governed", link: "Governed by design" },
    { title: "Trusted, built-in AI", text: "AI runs next to the data under the same roles and policies, and every agent request and AI function call is recorded against the user and role. The audit trail regulators ask for, with nothing to build.", stop: "ai-audit", link: "Every AI call on the record" },
    { title: "Change without a big bang", text: "No overnight migration weekend. Clone production in seconds to test, add a dynamic table or an alert alongside what runs today, and switch over a piece at a time.", stop: "live", link: "A payment at risk" },
  ]
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">What IT failure has cost others</p>
        <div className="grid gap-3 md:grid-cols-2">{ENFORCEMENT.map((e) => (
          <Card key={e.firm}><CardContent className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-semibold">{e.firm}</p><span className="text-xs text-muted-foreground">{e.when}</span></div>
            <div className="flex gap-6"><div><p className="text-2xl font-semibold">{gbpM(e.fine)}</p><p className="text-xs text-muted-foreground">penalty</p></div>
              <div><p className="text-2xl font-semibold">{gbpM(e.redress)}</p><p className="text-xs text-muted-foreground">paid to customers</p></div></div>
            <p className="text-muted-foreground">{e.what}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <a href={e.url} target="_blank" rel="noreferrer" className="text-primary underline">Read the Final Notice</a>
              {e.regulations.map((id) => <Link key={id} href={`/demo/regulations#${id}`} className="text-primary underline">The related control: {regulationById(id)?.name}</Link>)}
            </div>
          </CardContent></Card>
        ))}</div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        <Card><CardContent className="space-y-3 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your assumptions</p>
          <NumberInput label="Operations cost an hour" prefix="£" value={rate} onChange={setRate} step={5} hint={`applied to the measured ${hours.toFixed(1)} h it takes to resolve each case`} />
          <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Estimates, not in the data</p>
          <NumberInput label="Corporate clients lost a year" value={leavers} onChange={setLeavers} hint={`out of ${num(clients)} clients with late or failed payments`} />
          <NumberInput label="Revenue per corporate client a year" prefix="£" value={clientRevenue} onChange={setClientRevenue} step={25_000} />
          <label className="block text-sm"><span className="font-medium">A major incident on the scale of</span>
            <select value={incident} onChange={(e) => setIncident(Number(e.target.value))} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5">
              {ENFORCEMENT.map((e, n) => <option key={e.firm} value={n}>{e.firm.split(",")[0]} ({gbpM(e.fine + e.redress)})</option>)}
            </select></label>
          <NumberInput label="Chance of that in a year" suffix="%" value={chance} onChange={(n) => setChance(Math.min(100, n))} step={1} />
        </CardContent></Card>
        <Card><CardContent className="space-y-3 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">The cost of another year of doing nothing</p>
          <div className="flex flex-wrap items-end gap-8">
            <div><p className="text-4xl font-semibold tracking-tight">{gbpM(measured)}</p><p className="text-xs text-muted-foreground">from the data alone</p></div>
            <div><p className="text-4xl font-semibold tracking-tight text-muted-foreground">{gbpM(total)}</p><p className="text-xs text-muted-foreground">with your estimates</p></div>
          </div>
          <ul className="divide-y rounded-lg border text-sm">{parts.map((p) => (
            <li key={p.label} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1">
                <p className="font-medium">{p.label} <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${p.kind === "measured" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{p.kind === "measured" ? "Measured" : "Estimate"}</span></p>
                <p className="text-xs text-muted-foreground">{p.how}</p>
                <p className="text-xs text-muted-foreground">How to confirm: {p.check}</p>
              </div>
              <div className="w-28"><div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full" style={{ width: `${total ? (100 * p.value) / total : 0}%`, background: CHART_COLORS[3] }} /></div></div>
              <span className="w-20 text-right font-medium tabular-nums">{gbpM(p.value)}</span>
            </li>
          ))}</ul>
          <p className="text-xs text-muted-foreground">The first figure only uses what the data shows: 12 months of demo payments and the time taken to resolve payment alerts. The second adds estimates that aren't in the data, each with where to check it. Not a forecast.</p>
        </CardContent></Card>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Why "too risky to change" no longer holds</p>
        <div className="grid gap-3 md:grid-cols-3">{pillars.map((p) => (
          <Card key={p.title}><CardContent className="space-y-2 p-4 text-sm">
            <p className="font-semibold">{p.title}</p>
            <p className="text-muted-foreground">{p.text}</p>
            <button className="text-xs text-primary underline" onClick={() => nav.goTo(p.stop)}>See it: {p.link}</button>
          </CardContent></Card>
        ))}</div>
      </div>
      <p className="text-base font-medium">Doing nothing has a price too. It just doesn't show up until a client calls, or the regulator does.</p>
    </div>
  )
}

// readable names for the features in USER_AI_USAGE_HISTORY (the raw name shows when there isn't one)
const AI_FEATURE: Record<string, string> = { CORTEX_CODE_SNOWSIGHT: "Cortex Code, Snowsight", CORTEX_CODE: "Cortex Code, desktop", DEMO_EXEC_ASSISTANT: "Exec assistant agent" }
const feature = (f: unknown) => AI_FEATURE[String(f)] ?? String(f)

function AiAudit() {
  const sel = useSelection()
  return (
    <StopBody stop="corporate-ai-audit">{(d) => {
      const t = d.agentTotals[0] ?? {}
      // AI use per feature (all users), for the chart; the side list shows who used the picked feature
      const sums = new Map<string, number>()
      for (const r of d.byUser) sums.set(feature(r.FEATURE), (sums.get(feature(r.FEATURE)) ?? 0) + Number(r.CREDITS))
      const features = [...sums]
        .map(([FEATURE, CREDITS]) => ({ FEATURE, CREDITS: Math.round(CREDITS * 100) / 100 }))
      const who = d.byUser.filter((r) => sel.active(feature(r.FEATURE)))
      const gatewayCalls = Number(d.gateway[0]?.CALLS ?? 0)
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Agent requests recorded" value={num(t.REQUESTS)} hint={`${num(t.USERS)} users, every one attributed`} />
            <StatCard label="Agent credits" value={Number(t.CREDITS ?? 0).toFixed(2)} hint={`${num(t.TOKENS)} tokens`} />
            <StatCard label="AI features in use" value={num(features.length)} hint="last 30 days" />
            <StatCard label="AI Gateway calls" value={num(gatewayCalls)} hint={gatewayCalls ? "each tied to a Snowflake user" : "none yet: each call will be logged to its user"} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex min-h-[320px] flex-col">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-medium">AI credits by feature, 30 days <span className="font-normal text-muted-foreground">- click one, or drag a box for several</span></p>
                {sel.picked.length > 0 && <button className="text-xs text-primary underline" onClick={sel.clear}>Show all</button>}
              </div>
              <div className="flex-1">
                <RowChart data={features} label="FEATURE" sel={sel} format={(v) => Number(v).toFixed(2)} series={[{ key: "CREDITS", name: "Credits", color: CHART_COLORS[1] }]} />
              </div>
            </div>
            <div className="flex flex-col">
              <p className="mb-1 text-sm font-medium">{sel.picked.length ? `Who used ${sel.picked.join(", ")}` : "Who used AI, by feature"}</p>
              <ul className="max-h-[360px] flex-1 divide-y overflow-y-auto rounded-lg border text-sm">{who.map((r, i) => (
                <li key={i} onMouseEnter={() => sel.setHovered(feature(r.FEATURE))} onMouseLeave={() => sel.setHovered(null)}
                  className={cn("flex items-center gap-3 px-3 py-2", sel.hovered === feature(r.FEATURE) && "bg-muted/60")}>
                  <span className="font-medium">{r.USER_NAME}</span>
                  <span className="truncate text-muted-foreground">{feature(r.FEATURE)}</span>
                  <span className="ml-auto">{Number(r.CREDITS).toFixed(3)} credits</span>
                </li>))}
              </ul>
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Every request to the executive assistant, as Snowflake recorded it</p>
            <Table bordered>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Agent</TableHead><TableHead>Model</TableHead><TableHead>Warehouse</TableHead><TableHead className="text-right">Tokens</TableHead><TableHead className="text-right">Credits</TableHead></TableRow></TableHeader>
              <TableBody>{d.agent.map((a, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap">{String(a.START_TIME).slice(0, 16)}</TableCell><TableCell>{a.USER_NAME}</TableCell><TableCell>{a.ROLE_NAME}</TableCell>
                  <TableCell>{a.AGENT_NAME}</TableCell><TableCell className="whitespace-nowrap">{a.MODEL}</TableCell><TableCell>{a.WAREHOUSE ?? "-"}</TableCell>
                  <TableCell className="text-right">{num(a.TOKENS)}</TableCell><TableCell className="text-right">{Number(a.CREDITS).toFixed(4)}</TableCell>
                </TableRow>))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">From SNOWFLAKE.ACCOUNT_USAGE (CORTEX_AGENT_USAGE_HISTORY, USER_AI_USAGE_HISTORY, AI_GATEWAY_USAGE_HISTORY), which lags by up to a few hours. Service users such as MANAGED_SERVICE_1 are apps, this one included. The agent's SQL runs under the role shown, so its masking and row access policies apply.</p>
          </div>
        </div>
      )
    }}</StopBody>
  )
}

function Governed() {
  return (
    <StopBody stop="corporate-governed">{(d) => (
      <div className="space-y-3">
        <Table bordered>
          <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Client</TableHead><TableHead>Currency</TableHead><TableHead>Type</TableHead><TableHead>IBAN, or sort code and account number</TableHead></TableRow></TableHeader>
          <TableBody>{d.accounts.map((a) => <TableRow key={a.ACCOUNT_ID}><TableCell>{a.ACCOUNT_ID}</TableCell><TableCell>{a.CLIENT_NAME}</TableCell><TableCell>{a.CURRENCY}</TableCell><TableCell>{a.ACCOUNT_TYPE}</TableCell><TableCell className="font-mono text-xs">{a.ACCOUNT_IDENTIFIER}</TableCell></TableRow>)}</TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">This page asks Snowflake for the full values. The masking policy <code>DEMO_MASK_ACCOUNT_ID</code> returns only the last four characters to the role viewing ({String(d.policy[0]?.VIEWING_ROLE ?? "")}), and it does the same in every tool, agent and app. In GOV1 attendees build tags, masking and row access policies; GOV2 proves who saw what.</p>
      </div>
    )}</StopBody>
  )
}

const CORPORATE: Stop[] = [
  { id: "payments", title: "Payments at a glance", headline: "Six schemes, a year of payments, and what's coming next",
    soWhat: "Volumes, success rates and processing times for every scheme, from Iceberg tables any engine can read. A control chart separates the weeks the calendar explains from the ones to investigate, and built-in ML forecasting shows the month ahead.", modules: ["C1", "DE1", "DE2"], render: () => <Payments /> },
  { id: "live", title: "A payment at risk", headline: "Catch a client's payment before it misses the cut-off",
    soWhat: "A stuck £250,000 CHAPS payment reaches the relationship manager in a minute or two, with the client, the money, the time left and what to say. Today it would surface in the next morning's report, after the client has called.", modules: ["DE1", "DE2", "DE3", "OPS4"], regs: ["op-res"], render: () => <LiveSla /> },
  { id: "clients", title: "Client 360", headline: "Every client's volume, success and SLA, with their relationship manager",
    soWhat: "The money at stake, client by client: failed payment value and slow processing, with the relationship manager to call. Red marks a 95th percentile over 12 seconds.", modules: ["DA1", "OPS1"], render: () => <Clients /> },
  { id: "whatif", title: "What if we fixed it?", headline: "Move the sliders: what faster payments are worth",
    soWhat: "Make slow payments faster, or change a scheme's time limit, and see payments, money and clients outside SLA recalculated across 12 months of payments. Decisions on evidence, not a spreadsheet someone built last quarter.", modules: ["DA1", "DE2"], regs: ["op-res"], render: () => <WhatIf /> },
  { id: "alerts", title: "Alerts and next best actions", headline: "What's open, how severe, and what to do",
    soWhat: "Operations alerts triaged by severity; in OPS2 AI suggests the next action for each.", modules: ["OPS2", "OPS4"], regs: ["op-res"], render: () => <Alerts /> },
  { id: "feedback", title: "What clients say", headline: "Every comment read, themed and scored by AI SQL",
    soWhat: "Payment delays dominate the complaints. Read the words behind the numbers, without anyone tagging comments by hand.", modules: ["DA2", "OPS3"], regs: ["consumer-duty"], render: () => <Feedback /> },
  { id: "governed", title: "Governed by design", headline: "Sensitive data masked by policy, everywhere",
    soWhat: "Tags and masking policies follow the data into every tool, agent and app.", modules: ["GOV1", "GOV2", "GOV3"], regs: ["uk-gdpr"], render: () => <Governed /> },
  { id: "ai-audit", title: "Every AI call on the record", headline: "Who asked which AI what, under which role, at what cost",
    soWhat: "Snowflake records every agent request and AI function call against the user and role that made it. The audit trail regulators ask for, with nothing to build.", modules: ["GOV2", "GOV3", "AI2"], regs: ["uk-gdpr", "model-risk"], render: () => <AiAudit /> },
  { id: "ask", title: "Ask the assistant", headline: "Ask anything about payments, clients and fraud",
    soWhat: "The same assistant answers corporate questions from the corporate semantic view.", modules: ["DA1", "AI1"], render: () => <AssistantChat suggestions={CORPORATE_QUESTIONS} /> },
  { id: "avoid-fine", title: "Avoiding the fine", headline: "Six regulations, the control for each, and the evidence",
    soWhat: "Operational resilience, Consumer Duty, APP scam reimbursement, anti-money laundering, UK GDPR, model risk and access to cash: what each regulator expects, the Snowflake control that meets it, live evidence from today's data, and the lab module that builds it.", modules: ["OPS4", "GOV4", "DS3"], regs: ["op-res", "consumer-duty", "app-scams", "aml", "uk-gdpr", "model-risk", "cash-access"], render: () => <AvoidingTheFine /> },
  { id: "do-nothing", title: "Doing nothing is a choice", headline: "The cost of another year of doing nothing",
    soWhat: "Data in too many systems, change that takes too long and feels too risky: so nothing changes. Banks have paid for that in fines and redress. On one trusted, governed platform with built-in AI, doing nothing stops being the safe option.", modules: ["GOV1", "GOV2", "DE1"], regs: ["op-res"], render: () => <DoNothing /> },
]

export const TOURS = { retail: { label: "Retail banking", icon: Landmark, stops: RETAIL }, corporate: { label: "Corporate banking", icon: Building2, stops: CORPORATE } }
export type TourId = keyof typeof TOURS

/** The click-through executive tour. */
export function Tour({ initialTour, initialStop }: { initialTour?: string; initialStop?: string }) {
  const startTour: TourId = initialTour === "corporate" ? "corporate" : "retail"
  const [tour, setTour] = useState<TourId>(startTour)
  const [i, setI] = useState(() => Math.max(0, TOURS[startTour].stops.findIndex((s) => s.id === initialStop)))
  const stops = TOURS[tour].stops
  const stop = stops[Math.min(i, stops.length - 1)]
  const go = (n: number) => { setI(Math.max(0, Math.min(stops.length - 1, n))); setFocus(null) }
  const [focus, setFocus] = useState<string | null>(null)
  const nav: TourNav = {
    goTo: (id, f) => { const n = stops.findIndex((s) => s.id === id); if (n >= 0) { setI(n); setFocus(f ?? null) } },
    focus, clearFocus: () => setFocus(null),
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(TOURS) as TourId[]).map((t) => {
          const Icon = TOURS[t].icon
          return <Button key={t} variant={tour === t ? "default" : "outline"} onClick={() => { setTour(t); setI(0) }}><Icon className="size-4" /> {TOURS[t].label}</Button>
        })}
        <div className="ml-auto flex items-center gap-1.5" aria-label="Tour progress">
          {stops.map((s, n) => (
            <button key={s.id} onClick={() => go(n)} title={s.title} aria-label={`Stop ${n + 1}: ${s.title}`}
              className={cn("h-2.5 rounded-full transition-all", n === i ? "w-6 bg-primary" : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/60")} />
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">{TOURS[tour].label} · {i + 1} of {stops.length} · {stop.title}</p>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{stop.headline}</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">{stop.soWhat}</p>
          </div>
          <TourNavContext.Provider value={nav}><div key={`${tour}-${stop.id}`}>{stop.render()}</div></TourNavContext.Provider>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><ModuleChips codes={stop.modules} /><RegulationChips ids={stop.regs ?? []} /></div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => go(i - 1)} disabled={i === 0}><ArrowLeft className="size-4" /> Back</Button>
              <Button onClick={() => (i === stops.length - 1 ? (setTour(tour === "retail" ? "corporate" : "retail"), setI(0)) : go(i + 1))}>
                {i === stops.length - 1 ? `On to ${tour === "retail" ? "corporate" : "retail"} banking` : "Next"} <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">All data is synthetic. The demo runs on its own copy of the lab data (BANKING_DEMO), so nothing here changes or depends on the hands-on lab.</p>
    </div>
  )
}
