"use client"

import { useRef, useState, type ReactNode } from "react"
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { CHART_THEME } from "@/components/chart-utils"

type Row = Record<string, unknown>
export type Sel = {
  active: (v: string) => boolean; toggle: (v: string, add?: boolean) => void; setMany: (vs: string[]) => void; clear: () => void
  hovered: string | null; setHovered: (v: string | null) => void
}

const fade = (on: boolean, hot: boolean) => (hot ? 1 : on ? 0.9 : 0.25)
const MARKS = new Set(["path", "rect", "circle", "text", "tspan"])

/**
 * Selection for a chart of evenly spaced categories:
 * click a bar (or its label) to pick just that one, click it again or click empty space to show all,
 * drag a box across bars to pick several. Categories are found from their position, so any chart works.
 */
export function BoxSelect({ items, axis, inset, sel, children }: {
  items: string[]; axis: "x" | "y"; inset: { start: number; end: number }; sel: Sel; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const start = useRef<[number, number] | null>(null)
  const [box, setBox] = useState<[number, number, number, number] | null>(null)

  const local = (ev: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect()
    return [ev.clientX - r.left, ev.clientY - r.top]
  }
  /** indexes of the categories whose band overlaps [a, b] along the category axis */
  const bands = (a: number, b: number) => {
    const r = ref.current!.getBoundingClientRect()
    const len = (axis === "x" ? r.width : r.height) - inset.start - inset.end
    const w = len / Math.max(items.length, 1)
    const [lo, hi] = [Math.min(a, b) - inset.start, Math.max(a, b) - inset.start]
    return items.filter((_, i) => i * w < hi && (i + 1) * w > lo)
  }

  return (
    <div ref={ref} className="relative h-full touch-none select-none"
      onPointerDown={(ev) => { if (ev.button) return; start.current = local(ev); ref.current!.setPointerCapture(ev.pointerId) }}
      onPointerMove={(ev) => {
        if (!start.current) return
        const [x, y] = local(ev), [x0, y0] = start.current
        if (box || Math.hypot(x - x0, y - y0) > 6) setBox([Math.min(x, x0), Math.min(y, y0), Math.abs(x - x0), Math.abs(y - y0)])
      }}
      onPointerUp={(ev) => {
        const s = start.current
        start.current = null
        if (!s) return
        const [x, y] = local(ev)
        if (box) {
          setBox(null)
          const picked = axis === "x" ? bands(s[0], x) : bands(s[1], y)
          if (picked.length) sel.setMany(picked); else sel.clear()
          return
        }
        // a click: on a mark picks its category, on empty space shows everything
        const hit = document.elementFromPoint(ev.clientX, ev.clientY)
        const item = hit && MARKS.has(hit.tagName.toLowerCase()) && hit.closest(".recharts-wrapper") ? bands(axis === "x" ? x : y, axis === "x" ? x : y)[0] : undefined
        if (item) sel.toggle(item, ev.shiftKey || ev.metaKey || ev.ctrlKey); else sel.clear()
      }}>
      {children}
      {box && <div className="pointer-events-none absolute rounded-sm border border-primary bg-primary/10" style={{ left: box[0], top: box[1], width: box[2], height: box[3] }} />}
    </div>
  )
}

/** Minimal column chart: no axes or grid, value labels on top, category under each bar. Click or box-select to pick, hover to link. */
export function ColumnChart({ data, x, y, color, sel, format = (v) => Number(v).toLocaleString("en-GB"), colors }: {
  data: Row[]; x: string; y: string; color: string; sel: Sel; format?: (v: unknown) => string; colors?: Record<string, string>
}) {
  return (
    <BoxSelect items={data.map((r) => String(r[x]))} axis="x" inset={{ start: 8, end: 8 }} sel={sel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, left: 8, bottom: 4 }} barCategoryGap="22%" accessibilityLayer={false} className="[&_*]:outline-none">
          <XAxis dataKey={x} axisLine={false} tickLine={false} tick={{ ...CHART_THEME.tick, fontSize: 12 }} interval={0} />
          <YAxis hide domain={[0, "dataMax"]} />
          <Bar dataKey={y} radius={[6, 6, 0, 0]} isAnimationActive={false} className="cursor-pointer"
            onMouseEnter={(d) => sel.setHovered(String((d as unknown as { payload: Row }).payload[x]))} onMouseLeave={() => sel.setHovered(null)}>
            {data.map((r) => {
              const k = String(r[x])
              return <Cell key={k} fill={colors?.[k] ?? color} fillOpacity={fade(sel.active(k), sel.hovered === k)} />
            })}
            <LabelList dataKey={y} position="top" formatter={format} style={{ fontSize: 13, fontWeight: 600, fill: "var(--foreground)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </BoxSelect>
  )
}

/** Minimal horizontal bars: names on the left, values at the bar end, no axes or grid. Optional second series stacked. */
export function RowChart({ data, label, series, sel, format = (v) => Number(v).toLocaleString("en-GB") }: {
  data: Row[]; label: string; series: { key: string; name: string; color: string }[]; sel: Sel; format?: (v: unknown) => string
}) {
  const last = series.length - 1
  return (
    <BoxSelect items={data.map((r) => String(r[label]))} axis="y" inset={{ start: 4, end: 4 }} sel={sel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }} barCategoryGap="28%" accessibilityLayer={false} className="[&_*]:outline-none">
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey={label} width={150} axisLine={false} tickLine={false} interval={0}
            tick={(t) => {
              const { x, y } = t as { x: number; y: number }
              const v = String(t.payload.value)
              return (
                <text x={x - 6} y={y} dy={4} textAnchor="end" fontSize={12} className="cursor-pointer"
                  onMouseEnter={() => sel.setHovered(v)} onMouseLeave={() => sel.setHovered(null)}
                  fill={sel.active(v) ? "var(--foreground)" : CHART_THEME.tick.fill} fillOpacity={sel.active(v) ? 1 : 0.5}>{v}</text>
              )
            }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="s" isAnimationActive={false} className="cursor-pointer"
              radius={i === last ? [0, 6, 6, 0] : 0}
              onMouseEnter={(d) => sel.setHovered(String((d as unknown as { payload: Row }).payload[label]))} onMouseLeave={() => sel.setHovered(null)}>
              {data.map((r) => {
                const k = String(r[label])
                return <Cell key={k} fill={s.color} fillOpacity={fade(sel.active(k), sel.hovered === k)} />
              })}
              <LabelList dataKey={s.key} position={series.length > 1 ? "insideLeft" : "right"}
                formatter={(v: unknown) => (Number(v) > 0 ? format(v) : "")}
                style={{ fontSize: 12, fontWeight: 600, fill: series.length > 1 ? "#fff" : "var(--foreground)" }} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </BoxSelect>
  )
}

/** A small legend, since the charts have no axes */
export function Swatches({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((i) => <span key={i.name} className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full" style={{ background: i.color }} />{i.name}</span>)}
    </div>
  )
}
