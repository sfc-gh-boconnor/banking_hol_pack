"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force"
import { select } from "d3-selection"
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type ZoomTransform } from "d3-zoom"
import { useElementSize } from "./use-linked"

export type GraphNode = { NODE_TYPE: string; NODE_ID: string; LABEL: string; DETAIL: string | null; AMOUNT_GBP: number | null }
export type GraphEdge = { SOURCE: string; TARGET: string; EDGE_TYPE: string; AMOUNT_GBP: number | null }

type SimNode = SimulationNodeDatum & GraphNode
type SimLink = { source: SimNode; target: SimNode; type: string }

const TYPE_STYLE: Record<string, { colour: string; label: string }> = {
  VICTIM: { colour: "var(--chart-1)", label: "Customer (victim)" },
  MULE: { colour: "var(--destructive)", label: "Mule account" },
  CONTROLLER: { colour: "var(--chart-5)", label: "Controller" },
  DEVICE: { colour: "var(--chart-4)", label: "Shared device" },
  CASE: { colour: "var(--chart-2)", label: "Fraud case" },
  SAR: { colour: "var(--chart-3)", label: "SAR" },
}
const W = 900, H = 560
const gbp = (v: number | null) => (v == null ? "" : `£${Math.round(v).toLocaleString("en-GB")}`)

/** Force-directed fraud network: victims, mule accounts, controllers, devices, cases and SARs. */
export function NetworkGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [, setLaidOut] = useState(0)
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)
  const [selected, setSelected] = useState<SimNode | null>(null)
  const [hover, setHover] = useState<SimNode | null>(null)
  const [lassoMode, setLassoMode] = useState(false)
  const [lassoPath, setLassoPath] = useState<[number, number][] | null>(null)
  const pathRef = useRef<[number, number][] | null>(null)  // the live path, so fast pointer events don't read stale state
  const [lassoed, setLassoed] = useState<Set<string> | null>(null)
  const lassoRef = useRef(false)
  lassoRef.current = lassoMode
  const fitRef = useRef<ZoomTransform>(zoomIdentity)
  const animRef = useRef<number>(0)
  // the view fills its box; the layout itself stays in a fixed W x H space
  const [box, size] = useElementSize()
  const VW = Math.round(size.width) || W, VH = Math.round(size.height) || H

  /** Transform that frames these nodes, capped so a small group doesn't zoom in absurdly far */
  const fit = (ns: SimNode[], maxK: number) => {
    const xs = ns.map((n) => n.x ?? 0), ys = ns.map((n) => n.y ?? 0)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const k = Math.min(maxK, 0.8 * Math.min(VW / Math.max(x1 - x0, 1), VH / Math.max(y1 - y0, 1)))
    return zoomIdentity.translate(VW / 2, VH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2)
  }

  /** Ease the view to a transform over ~600ms */
  const zoomTo = (to: ZoomTransform) => {
    const svg = svgRef.current, z = zoomRef.current
    if (!svg || !z) return
    cancelAnimationFrame(animRef.current)
    const from = zoomTransform(svg), start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 600), e = 1 - Math.pow(1 - p, 3)
      const lerp = (a: number, b: number) => a + (b - a) * e
      select(svg).call(z.transform, zoomIdentity.translate(lerp(from.x, to.x), lerp(from.y, to.y)).scale(lerp(from.k, to.k)))
      if (p < 1) animRef.current = requestAnimationFrame(step)
    }
    animRef.current = requestAnimationFrame(step)
  }

  const { simNodes, simLinks } = useMemo(() => {
    const byId = new Map<string, SimNode>()
    for (const n of nodes) if (!byId.has(n.NODE_ID)) byId.set(n.NODE_ID, { ...n })
    const links: SimLink[] = []
    for (const e of edges) {
      const s = byId.get(e.SOURCE), t = byId.get(e.TARGET)
      if (s && t) links.push({ source: s, target: t, type: e.EDGE_TYPE })
    }
    return { simNodes: [...byId.values()], simLinks: links }
  }, [nodes, edges])

  useEffect(() => {
    if (!svgRef.current) return
    // plain drag pans; Shift+drag or Lasso mode draws a selection instead
    const z = zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 6])
      .filter((ev) => ev.type === "wheel" || (!lassoRef.current && !ev.shiftKey && !ev.button))
      .on("zoom", (ev) => setTransform(ev.transform))
    zoomRef.current = z
    select(svgRef.current).call(z)
  }, [])

  // Lay the graph out once, up front, then fit it to the frame
  useEffect(() => {
    const sim = forceSimulation(simNodes)
      .force("link", forceLink<SimNode, SimLink>(simLinks).id((d) => d.NODE_ID).distance((l) => (l.type === "PAID" ? 35 : 55)).strength(0.7))
      .force("charge", forceManyBody().strength((d) => ((d as SimNode).NODE_TYPE === "MULE" ? -220 : -30)))
      .force("collide", forceCollide<SimNode>().radius((d) => radius(d) + 2))
      .force("x", forceX(W / 2).strength(0.06))
      .force("y", forceY(H / 2).strength(0.06))
      .stop()
    for (let i = 0; i < 300; i++) sim.tick()
    if (simNodes.length && svgRef.current && zoomRef.current) {
      fitRef.current = fit(simNodes, 4)
      select(svgRef.current).call(zoomRef.current.transform, fitRef.current)
    }
    setLaidOut((n) => n + 1)
  }, [simNodes, simLinks])

  const neighbours = useMemo(() => {
    if (!selected) return null
    const s = new Set<string>([selected.NODE_ID])
    for (const l of simLinks) {
      if (l.source.NODE_ID === selected.NODE_ID) s.add(l.target.NODE_ID)
      if (l.target.NODE_ID === selected.NODE_ID) s.add(l.source.NODE_ID)
    }
    return s
  }, [selected, simLinks])

  // What's highlighted: a lasso selection, or the clicked node and its neighbours
  const focus = lassoed ?? neighbours

  // Zoom to the focus; back out to the whole network when cleared. Refit when the box changes size.
  useEffect(() => {
    if (simNodes.length) fitRef.current = fit(simNodes, 4)
    if (!focus) { zoomTo(fitRef.current); return }
    zoomTo(fit(simNodes.filter((n) => focus.has(n.NODE_ID)), 3.5))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, VW, VH])

  /** Pointer position in view coordinates */
  const toView = (ev: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const r = ev.currentTarget.getBoundingClientRect()
    return [((ev.clientX - r.left) / r.width) * VW, ((ev.clientY - r.top) / r.height) * VH]
  }
  const onPointerDown = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!(lassoMode || ev.shiftKey) || ev.button) return
    ev.currentTarget.setPointerCapture(ev.pointerId)
    pathRef.current = [toView(ev)]
    setLassoPath(pathRef.current)
  }
  const onPointerMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!pathRef.current) return
    pathRef.current = [...pathRef.current, toView(ev)]
    setLassoPath(pathRef.current)
  }
  const onPointerUp = () => {
    const path = pathRef.current
    pathRef.current = null
    setLassoPath(null)
    if (!path || path.length <= 4) return
    // compare in screen space: project each node with the current view
    const inside = simNodes.filter((n) => pointInPolygon(transform.apply([n.x ?? 0, n.y ?? 0]), path)).map((n) => n.NODE_ID)
    if (inside.length) { setSelected(null); setLassoed(new Set(inside)) }
  }
  const clearAll = () => { setSelected(null); setLassoed(null) }

  const lassoSummary = useMemo(() => {
    if (!lassoed) return null
    const ns = simNodes.filter((n) => lassoed.has(n.NODE_ID))
    const of = (t: string) => ns.filter((n) => n.NODE_TYPE === t)
    const sum = (xs: SimNode[]) => xs.reduce((a, n) => a + (n.AMOUNT_GBP ?? 0), 0)
    return { total: ns.length, mules: of("MULE"), victims: of("VICTIM"), controllers: of("CONTROLLER").length,
      devices: of("DEVICE").length, cases: of("CASE"), sars: of("SAR").length, received: sum(of("MULE")), paid: sum(of("VICTIM")) }
  }, [lassoed, simNodes])

  const degree = (id: string) => simLinks.filter((l) => l.source.NODE_ID === id || l.target.NODE_ID === id).length
  const tip = hover ? transform.apply([hover.x ?? 0, hover.y ?? 0]) : null

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div ref={box} className="relative h-full min-h-[560px]">
        <div className="absolute right-3 top-3 z-10 flex gap-1">
          <button onClick={() => setLassoMode((v) => !v)} aria-pressed={lassoMode}
            className={`rounded-md border px-2.5 py-1 text-xs shadow-sm ${lassoMode ? "border-primary bg-primary text-primary-foreground" : "bg-background/90 hover:bg-muted"}`}>
            Lasso{lassoMode ? " on" : ""}
          </button>
          {(lassoed || selected) && <button onClick={clearAll} className="rounded-md border bg-background/90 px-2.5 py-1 text-xs shadow-sm hover:bg-muted">Clear</button>}
        </div>
        <svg ref={svgRef} width={VW} height={VH} viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="Fraud network graph"
          className={`absolute inset-0 h-full w-full touch-none rounded-lg border bg-muted/30 ${lassoMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <g transform={transform.toString()}>
            {simLinks.map((l, i) => {
              const dim = focus && !(focus.has(l.source.NODE_ID) && focus.has(l.target.NODE_ID))
              return <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
                stroke={l.type === "MOVED_ON" ? "var(--chart-5)" : l.type === "SAME_DEVICE" ? "var(--chart-4)" : "var(--muted-foreground)"}
                strokeOpacity={dim ? 0.08 : 0.45} strokeWidth={l.type === "MOVED_ON" ? 2 : 1} strokeDasharray={l.type === "SAME_DEVICE" ? "3 3" : undefined} />
            })}
            {simNodes.map((n) => {
              const dim = focus && !focus.has(n.NODE_ID)
              return (
                <circle key={n.NODE_ID} cx={n.x} cy={n.y} r={radius(n)} fill={TYPE_STYLE[n.NODE_TYPE]?.colour ?? "var(--muted-foreground)"}
                  fillOpacity={dim ? 0.15 : 0.95} stroke={selected?.NODE_ID === n.NODE_ID ? "var(--foreground)" : "var(--background)"}
                  strokeWidth={selected?.NODE_ID === n.NODE_ID ? 2.5 : 1} className="cursor-pointer"
                  onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
                  onClick={(ev) => { ev.stopPropagation(); setLassoed(null); setSelected(selected?.NODE_ID === n.NODE_ID ? null : n) }} />
              )
            })}
            {simNodes.filter((n) => n.NODE_TYPE === "MULE" || n.NODE_TYPE === "CONTROLLER").map((n) => (
              <text key={`t-${n.NODE_ID}`} x={(n.x ?? 0) + radius(n) + 3} y={(n.y ?? 0) + 4 / transform.k} fontSize={12 / transform.k} fill="var(--foreground)" pointerEvents="none">{n.LABEL}</text>
            ))}
          </g>
          {lassoPath && lassoPath.length > 1 && (
            <polygon points={lassoPath.map((p) => p.join(",")).join(" ")} fill="color-mix(in oklab, var(--primary) 12%, transparent)"
              stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" />
          )}
        </svg>
        {hover && tip && (
          <div className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
            style={{ left: `${(tip[0] / VW) * 100}%`, top: `calc(${(tip[1] / VH) * 100}% - ${radius(hover) * transform.k + 6}px)` }}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="inline-block size-2 rounded-full" style={{ background: TYPE_STYLE[hover.NODE_TYPE]?.colour }} />{TYPE_STYLE[hover.NODE_TYPE]?.label}
            </div>
            <div className="font-medium">{hover.LABEL}</div>
            {hover.DETAIL && <div className="text-muted-foreground">{hover.DETAIL}</div>}
            {hover.AMOUNT_GBP != null && <div>{hover.NODE_TYPE === "MULE" ? "Received" : hover.NODE_TYPE === "CASE" ? "Loss" : "Amount"}: <b>{gbp(hover.AMOUNT_GBP)}</b></div>}
            <div className="text-muted-foreground">{degree(hover.NODE_ID)} connection{degree(hover.NODE_ID) === 1 ? "" : "s"} · click to focus</div>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-md border bg-background/90 px-3 py-2 text-xs">
          {Object.entries(TYPE_STYLE).map(([k, s]) => (
            <span key={k} className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full" style={{ background: s.colour }} />{s.label}</span>
          ))}
        </div>
      </div>
      <div className="rounded-lg border p-4 text-sm">
        {lassoSummary ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lasso selection</p>
            <p className="text-base font-semibold">{lassoSummary.total} nodes</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
              {lassoSummary.mules.length > 0 && <><dt className="text-muted-foreground">Mule accounts</dt><dd className="text-right font-medium">{lassoSummary.mules.length}</dd></>}
              {lassoSummary.received > 0 && <><dt className="text-muted-foreground">Received by mules</dt><dd className="text-right font-medium">{gbp(lassoSummary.received)}</dd></>}
              {lassoSummary.victims.length > 0 && <><dt className="text-muted-foreground">Victims</dt><dd className="text-right font-medium">{lassoSummary.victims.length}</dd></>}
              {lassoSummary.paid > 0 && <><dt className="text-muted-foreground">Paid by victims</dt><dd className="text-right font-medium">{gbp(lassoSummary.paid)}</dd></>}
              {lassoSummary.controllers > 0 && <><dt className="text-muted-foreground">Controllers</dt><dd className="text-right font-medium">{lassoSummary.controllers}</dd></>}
              {lassoSummary.devices > 0 && <><dt className="text-muted-foreground">Shared devices</dt><dd className="text-right font-medium">{lassoSummary.devices}</dd></>}
              {lassoSummary.cases.length > 0 && <><dt className="text-muted-foreground">Fraud cases</dt><dd className="text-right font-medium">{lassoSummary.cases.length}</dd></>}
              {lassoSummary.sars > 0 && <><dt className="text-muted-foreground">SARs filed</dt><dd className="text-right font-medium">{lassoSummary.sars}</dd></>}
            </dl>
            {lassoSummary.mules.length > 0 && <p className="text-xs text-muted-foreground">{lassoSummary.mules.map((m) => m.LABEL).join(", ")}</p>}
            <button className="text-xs text-primary underline" onClick={clearAll}>Clear selection and zoom out</button>
          </div>
        ) : selected ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{TYPE_STYLE[selected.NODE_TYPE]?.label}</p>
            <p className="text-base font-semibold">{selected.LABEL}</p>
            {selected.DETAIL && <p className="text-muted-foreground">{selected.DETAIL}</p>}
            {selected.AMOUNT_GBP != null && <p>{selected.NODE_TYPE === "MULE" ? "Received" : selected.NODE_TYPE === "CASE" ? "Loss" : "Amount"}: <b>{gbp(selected.AMOUNT_GBP)}</b></p>}
            <p className="text-muted-foreground">{(neighbours?.size ?? 1) - 1} direct connections</p>
            <button className="text-xs text-primary underline" onClick={() => setSelected(null)}>Clear selection and zoom out</button>
          </div>
        ) : (
          <div className="space-y-2 text-muted-foreground">
            <p className="font-medium text-foreground">Click any node</p>
            <p>Red hubs are mule accounts receiving from many victims. Thick purple lines show money moved on to a controller; dashed lines show accounts logging in from the same device.</p>
            <p>Hover for details. Scroll to zoom, drag to pan. Hold Shift and drag (or switch on Lasso) to draw round a group and total it.</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Ray casting: is the point inside the polygon? */
function pointInPolygon([x, y]: [number, number], poly: [number, number][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function radius(n: GraphNode) {
  if (n.NODE_TYPE === "MULE") return 9 + Math.min(10, Math.sqrt((n.AMOUNT_GBP ?? 0) / 3000))
  if (n.NODE_TYPE === "CONTROLLER") return 11
  if (n.NODE_TYPE === "DEVICE") return 6
  if (n.NODE_TYPE === "CASE" || n.NODE_TYPE === "SAR") return 4.5
  return 4
}
