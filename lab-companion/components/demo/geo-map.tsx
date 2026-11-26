"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { geoArea, geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo"
import { select } from "d3-selection"
import { useExternalAccess } from "@/components/lab/external-access-notice"
import { BASEMAP_INTEGRATION } from "@/lib/external-access"
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from "d3-zoom"
import { Minus, Plus, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useElementSize } from "./use-linked"

export type HexRow = { H3: string; CITY: string; GEOJSON: string } & Record<string, unknown>
export type PolyRow = { id: string; GEOJSON: string; label?: string }
export type PointRow = { LAT: number; LON: number; label?: string; id?: string }

type Props = {
  hexes: HexRow[]
  /** column on each hex to colour by */
  metric: string
  metricLabel: string
  format?: (v: number) => string
  /** diverging scale for metrics that can go negative (profit) */
  diverging?: boolean
  overlays?: PolyRow[]
  highlight?: string | null
  points?: PointRow[]
  onPointClick?: (id: string) => void
  selectedPoint?: string | null
  /** zoom to these cities' hexes */
  focusCity?: string | null
  height?: number
  /** called with the hovered hexagon's city, so a side table can highlight it */
  onHoverCity?: (city: string | null) => void
  /** scroll / drag / buttons to zoom and pan; fineHexes replace hexes once zoomed past fineAt */
  zoomable?: boolean
  fineHexes?: HexRow[]
  fineAt?: number
  onHexClick?: (row: HexRow) => void
  selectedHex?: string | null
  /** extra tooltip lines for a hovered hexagon or point */
  hexTip?: (row: HexRow) => ReactNode
  pointTip?: (id: string) => ReactNode
  /** dashed connectors drawn from a hexagon centre to points, e.g. a hexagon to its branches */
  links?: { from: [number, number]; to: [number, number]; label: string; tone: "primary" | "warn" }[]
  /** small key shown bottom left, e.g. what the link colours mean */
  legend?: ReactNode
  /** drag to draw a lasso; called with the hexagons whose centres fall inside it */
  onLasso?: (rows: HexRow[]) => void
  lassoed?: Set<string> | null
}

const W = 900

/** d3-geo wants clockwise outer rings; Snowflake GeoJSON is counter-clockwise (RFC 7946).
 *  A ring drawn the wrong way round covers the whole globe, so flip any that do. */
export function rewind(geo: any): GeoPermissibleObjects {
  const flip = (rings: number[][][]) => rings.map((r) => [...r].reverse())
  if (geo?.type === "Polygon") {
    const g = { ...geo }
    if (geoArea(g) > 2 * Math.PI) g.coordinates = flip(g.coordinates)
    return g
  }
  if (geo?.type === "MultiPolygon") {
    return { ...geo, coordinates: geo.coordinates.map((p: number[][][]) => (geoArea({ type: "Polygon", coordinates: p } as any) > 2 * Math.PI ? flip(p) : p)) }
  }
  return geo
}

function colour(t: number, diverging: boolean) {
  // t in [0, 1]; colours from the theme's chart tokens via a CSS mix
  const pct = Math.round(t * 100)
  return diverging
    ? t < 0.5
      ? `color-mix(in oklab, var(--destructive) ${Math.round((0.5 - t) * 200)}%, var(--muted))`
      : `color-mix(in oklab, var(--chart-1) ${Math.round((t - 0.5) * 200)}%, var(--muted))`
    : `color-mix(in oklab, var(--chart-1) ${pct}%, var(--muted))`
}

/** SVG choropleth of H3 hexagons, with optional catchment polygons and points. Esri Light Gray basemap tiles load straight from the browser. */
export function GeoMap({ hexes, metric, metricLabel, format = (v) => v.toLocaleString("en-GB"), diverging = false,
  overlays = [], highlight, points = [], onPointClick, selectedPoint, focusCity, height = 520, onHoverCity,
  zoomable = false, fineHexes, fineAt = 2.5, onHexClick, selectedHex, hexTip, pointTip, links = [], legend, onLasso, lassoed }: Props) {
  const [hover, setHover] = useState<HexRow | null>(null)
  // no basemap integration (a trial): the tiles can't load, so say why the background is blank
  const access = useExternalAccess()
  const noTiles = Array.isArray(access.data) && !access.data.includes(BASEMAP_INTEGRATION)
  const [hoverPoint, setHoverPoint] = useState<PointRow | null>(null)
  const [mouse, setMouse] = useState<[number, number] | null>(null)
  // lasso: points of the shape being drawn, in SVG pixels
  const [lasso, setLasso] = useState<[number, number][] | null>(null)
  // fill the space we're given: the drawing uses the box's real size (height is the minimum)
  const [box, size] = useElementSize()
  const Wd = Math.round(size.width) || W, Hd = Math.round(size.height) || height

  // zoom and pan: d3-zoom drives a transform that rescales the projection, so tiles re-fetch at the right level
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomer = useMemo(() => d3zoom<SVGSVGElement, unknown>().scaleExtent([1, 12]), [])
  const [t, setT] = useState<ZoomTransform>(zoomIdentity)
  useEffect(() => {
    if (!zoomable || !svgRef.current) return
    const sel = select(svgRef.current)
    zoomer.extent([[0, 0], [Wd, Hd]]).translateExtent([[-Wd, -Hd], [2 * Wd, 2 * Hd]]).on("zoom", (e) => setT(e.transform))
    sel.call(zoomer)
    return () => { sel.on(".zoom", null) }
  }, [zoomable, zoomer, Wd, Hd])
  // a new area (another city) starts unzoomed
  const areaKey = hexes.length ? hexes[0].CITY : ""
  useEffect(() => { if (svgRef.current) select(svgRef.current).call(zoomer.transform, zoomIdentity) }, [areaKey, zoomer])
  const zoomBy = (k: number) => svgRef.current && select(svgRef.current).call(zoomer.scaleBy, k)
  const fine = zoomable && !!fineHexes?.length && t.k >= fineAt
  const shown = fine ? fineHexes! : hexes

  const baseShapes = useMemo(() => hexes.map((h) => ({ row: h, geo: rewind(JSON.parse(h.GEOJSON)) })), [hexes])
  const fineShapes = useMemo(() => (fineHexes ?? []).map((h) => ({ row: h, geo: rewind(JSON.parse(h.GEOJSON)) })), [fineHexes])
  const shapes = fine ? fineShapes : baseShapes
  const overlayShapes = useMemo(() => overlays.map((o) => ({ ...o, geo: rewind(JSON.parse(o.GEOJSON)) })), [overlays])

  // the fit is always from the base hexagons, so switching resolution doesn't move the map
  const fitted = useMemo(() => {
    const inFocus = focusCity ? baseShapes.filter((s) => s.row.CITY === focusCity) : baseShapes
    const fc = { type: "FeatureCollection", features: (inFocus.length ? inFocus : baseShapes).map((s) => ({ type: "Feature", geometry: s.geo, properties: {} })) }
    const p = geoMercator().fitExtent([[10, 10], [Wd - 10, Hd - 10]], fc as unknown as GeoPermissibleObjects)
    return { scale: p.scale(), translate: p.translate() }
  }, [baseShapes, focusCity, Wd, Hd])
  const { path, project, projection } = useMemo(() => {
    const projection = geoMercator().scale(fitted.scale * t.k).translate([fitted.translate[0] * t.k + t.x, fitted.translate[1] * t.k + t.y])
    return { path: geoPath(projection), project: (lon: number, lat: number) => projection([lon, lat]), projection }
  }, [fitted, t])

  // Web Mercator basemap tiles (keyless Esri Light Gray Canvas; Carto now needs an API key) lined up with the d3 projection (world width = 2*pi*scale px)
  const tiles = useMemo(() => {
    const s = projection.scale(), [tx, ty] = projection.translate()
    const world = 2 * Math.PI * s
    const z = Math.max(0, Math.min(16, Math.round(Math.log2(world / 256))))
    const n = 2 ** z, ts = world / n
    const x0 = tx - world / 2, y0 = ty - world / 2
    const out: { key: string; href: string; labels: string; x: number; y: number; size: number }[] = []
    for (let i = Math.floor(-x0 / ts); i <= Math.floor((Wd - x0) / ts); i++) {
      for (let j = Math.max(0, Math.floor(-y0 / ts)); j <= Math.min(n - 1, Math.floor((Hd - y0) / ts)); j++) {
        const xi = ((i % n) + n) % n
        out.push({ key: `${z}/${i}/${j}`, href: `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${j}/${xi}`, labels: `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/${z}/${j}/${xi}`, x: x0 + i * ts, y: y0 + j * ts, size: ts })
      }
    }
    return out
  }, [projection, Wd, Hd])

  // Name the focused city at the centre of its hexagons (Esri's label layer drops big-city names once zoomed in)
  const cityLabels = useMemo(() => {
    if (!focusCity) return []
    const acc = new Map<string, { x: number; y: number; n: number }>()
    for (const s of shapes.filter((s) => s.row.CITY === focusCity)) {
      const [x, y] = path.centroid(s.geo)
      if (!Number.isFinite(x)) continue
      const c = acc.get(s.row.CITY) ?? { x: 0, y: 0, n: 0 }
      acc.set(s.row.CITY, { x: c.x + x, y: c.y + y, n: c.n + 1 })
    }
    return [...acc].map(([city, c]) => ({ city, x: c.x / c.n, y: c.y / c.n }))
  }, [shapes, path, focusCity])

  const values = shown.map((h) => Number(h[metric] ?? 0))
  const lo = Math.min(...values), hi = Math.max(...values)
  // clip to the 2nd-98th percentile so a few extreme hexes don't wash out the map
  const sorted = [...values].sort((a, b) => a - b)
  const p = (q: number) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0
  const [a, b] = diverging ? [-Math.max(Math.abs(p(0.02)), Math.abs(p(0.98))), Math.max(Math.abs(p(0.02)), Math.abs(p(0.98)))] : [p(0.02), p(0.98)]
  const scale = (v: number) => Math.min(1, Math.max(0, (v - a) / ((b - a) || 1)))

  return (
    <div ref={box} className="relative h-full" style={{ minHeight: height }}
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMouse([e.clientX - r.left, e.clientY - r.top]) }}
      onMouseLeave={() => setMouse(null)}>
      {noTiles && (
        <div className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
          Map background unavailable: this account has no external access
        </div>
      )}
      <svg ref={svgRef} width={Wd} height={Hd} viewBox={`0 0 ${Wd} ${Hd}`}
        onMouseDown={onLasso ? (e) => { if (e.button !== 0) return; const r = e.currentTarget.getBoundingClientRect(); setLasso([[e.clientX - r.left, e.clientY - r.top]]) } : undefined}
        onMouseMove={onLasso ? (e) => { if (!lasso) return; const r = e.currentTarget.getBoundingClientRect(); setLasso([...lasso, [e.clientX - r.left, e.clientY - r.top]]) } : undefined}
        onMouseUp={onLasso ? () => {
          const pts = lasso; setLasso(null)
          // a click, not a drag: leave hexagon clicks alone
          if (!pts || pts.length < 4) return
          const inside = (x: number, y: number) => {
            let c = false
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
              const [xi, yi] = pts[i], [xj, yj] = pts[j]
              if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
            }
            return c
          }
          onLasso(shapes.filter((s) => { const [x, y] = path.centroid(s.geo); return Number.isFinite(x) && inside(x, y) }).map((s) => s.row))
        } : undefined} className={cn("absolute inset-0 h-full w-full select-none overflow-hidden rounded-lg border bg-muted/30", zoomable && "cursor-grab active:cursor-grabbing", onLasso && "cursor-crosshair")} role="img" aria-label={`Map of ${metricLabel}`}>
        <g pointerEvents="none">
          {tiles.map((t) => <image key={t.key} href={t.href} x={t.x} y={t.y} width={t.size + 0.5} height={t.size + 0.5} preserveAspectRatio="none" />)}
        </g>
        {shapes.map(({ row, geo }) => (
          <path key={row.H3} d={path(geo) ?? ""} fill={colour(scale(Number(row[metric] ?? 0)), diverging)}
            fillOpacity={lassoed?.size ? (lassoed.has(row.H3) ? 0.9 : 0.25) : 0.72}
            stroke={lassoed?.has(row.H3) ? "var(--foreground)" : "var(--background)"} strokeWidth={lassoed?.has(row.H3) ? 1 : 0.3}
            className="cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => onHexClick?.(row)}
            onMouseEnter={() => { setHover(row); onHoverCity?.(row.CITY) }} onMouseLeave={() => { setHover(null); onHoverCity?.(null) }} />
        ))}
        {overlayShapes.map((o) => (
          <path key={o.id} d={path(o.geo) ?? ""} fill={o.id === highlight ? "color-mix(in oklab, var(--chart-3) 30%, transparent)" : "none"}
            stroke={o.id === highlight ? "var(--chart-3)" : "var(--chart-2)"} strokeWidth={o.id === highlight ? 2 : 0.8}
            strokeOpacity={o.id === highlight ? 1 : 0.6} pointerEvents="none" />
        ))}
        <g pointerEvents="none">
          {tiles.map((t) => <image key={t.key} href={t.labels} x={t.x} y={t.y} width={t.size + 0.5} height={t.size + 0.5} preserveAspectRatio="none" />)}
        </g>
        {/* links run from the selected hexagon's centre to a branch; the label and a ring sit at the branch end */}
        {links.map((l, i) => {
          const a = project(l.from[0], l.from[1]), b = project(l.to[0], l.to[1])
          if (!a || !b) return null
          const c = l.tone === "warn" ? "var(--destructive)" : "var(--chart-3)"
          const right = b[0] >= a[0]
          return (
            <g key={i} pointerEvents="none">
              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--background)" strokeWidth={5} strokeLinecap="round" />
              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={c} strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={b[0]} cy={b[1]} r={11} fill="none" stroke={c} strokeWidth={2.5} />
              <text x={b[0] + (right ? 15 : -15)} y={b[1] + 4} textAnchor={right ? "start" : "end"} className="text-[12px] font-semibold" fill={c}
                stroke="var(--background)" strokeWidth={3.5} paintOrder="stroke">{l.label}</text>
            </g>
          )
        })}
        {selectedHex && (() => {
          const s = shapes.find((x) => x.row.H3 === selectedHex)
          if (!s) return null
          const [x, y] = path.centroid(s.geo)
          if (!Number.isFinite(x)) return null
          return (
            <g pointerEvents="none">
              <path d={path(s.geo) ?? ""} fill="none" stroke="var(--background)" strokeWidth={6} />
              <path d={path(s.geo) ?? ""} fill="none" stroke="var(--foreground)" strokeWidth={3} />
              <circle cx={x} cy={y} r={3.5} fill="var(--foreground)" />
              <text x={x} y={y - 12} textAnchor="middle" className="fill-foreground text-[12px] font-semibold" stroke="var(--background)" strokeWidth={3.5} paintOrder="stroke">Selected neighbourhood</text>
            </g>
          )
        })()}
        {cityLabels.map((l) => (
          <text key={l.city} x={l.x} y={l.y - 14} textAnchor="middle" pointerEvents="none"
            className="fill-foreground text-[22px] font-semibold" stroke="var(--background)" strokeWidth={3} paintOrder="stroke">{l.city}</text>
        ))}
        {points.map((pt, i) => {
          const xy = project(pt.LON, pt.LAT)
          if (!xy) return null
          const sel = pt.id && pt.id === selectedPoint
          return (
            <circle key={pt.id ?? i} cx={xy[0]} cy={xy[1]} r={sel ? 7 : onPointClick ? 4.5 : 2.2}
              fill={sel ? "var(--chart-3)" : onPointClick ? "var(--foreground)" : "var(--destructive)"} stroke="var(--background)" strokeWidth={1}
              className={cn(onPointClick && "cursor-pointer")} onClick={() => pt.id && onPointClick?.(pt.id)}
              onMouseEnter={() => setHoverPoint(pt)} onMouseLeave={() => setHoverPoint(null)} />
          )
        })}
        {lasso && lasso.length > 1 && (
          <polygon points={lasso.map((p) => p.join(",")).join(" ")} fill="color-mix(in oklab, var(--chart-3) 15%, transparent)"
            stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />
        )}
      </svg>
      <div className="absolute bottom-1.5 right-2 rounded bg-background/80 px-1.5 text-[10px] text-muted-foreground">
        Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors
      </div>
      {/* legend, top left */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-background/90 px-3 py-2 text-xs shadow-sm">
        <div className="text-muted-foreground">
          {metricLabel}: {format(lo)} to {format(hi)}
          {zoomable && fineHexes?.length ? <> · {fine ? "neighbourhood hexagons" : "zoom in for neighbourhoods"}</> : null}
        </div>
      </div>
      {legend && (
        <div className="pointer-events-none absolute bottom-6 left-3 rounded-md border bg-background/90 px-3 py-2 text-xs shadow-sm">{legend}</div>
      )}
      {zoomable && (
        <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-md border bg-background/90 shadow-sm">
          <button type="button" aria-label="Zoom in" className="p-1.5 hover:bg-muted" onClick={() => zoomBy(1.6)}><Plus className="h-4 w-4" /></button>
          <button type="button" aria-label="Zoom out" className="border-t p-1.5 hover:bg-muted" onClick={() => zoomBy(1 / 1.6)}><Minus className="h-4 w-4" /></button>
          <button type="button" aria-label="Reset view" className="border-t p-1.5 hover:bg-muted" onClick={() => svgRef.current && select(svgRef.current).call(zoomer.transform, zoomIdentity)}><RotateCcw className="h-4 w-4" /></button>
        </div>
      )}
      {/* tooltip, follows the pointer: a branch takes priority over the hexagon under it */}
      {mouse && (hoverPoint || hover) && (
        <div className="pointer-events-none absolute z-10 max-w-[260px] rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(mouse[0] + 14, Wd - 270), top: Math.min(mouse[1] + 14, Hd - 120) }}>
          {hoverPoint ? (
            <div className="space-y-0.5">
              <div className="font-semibold">{hoverPoint.label}</div>
              {hoverPoint.id && pointTip?.(hoverPoint.id)}
            </div>
          ) : hover ? (
            <div className="space-y-0.5">
              <div className="font-medium">{hover.CITY}</div>
              <div>{metricLabel}: <span className="font-semibold">{format(Number(hover[metric] ?? 0))}</span></div>
              {"CUSTOMERS" in hover && <div className="text-muted-foreground">{Number(hover.CUSTOMERS).toLocaleString("en-GB")} customers</div>}
              {hexTip?.(hover)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
