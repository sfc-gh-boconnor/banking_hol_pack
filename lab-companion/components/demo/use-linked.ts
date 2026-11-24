"use client"

import { useEffect, useRef, useState } from "react"

/** Pick one or more items (click to toggle), plus the item being hovered, for linked chart + list views. */
export function useSelection<T = string>() {
  const [picked, setPicked] = useState<T[]>([])
  const [hovered, setHovered] = useState<T | null>(null)
  return {
    picked,
    hovered,
    setHovered,
    /** click picks just this one (again clears); add=true (shift or cmd click) adds or removes it */
    toggle: (v: T, add = false) => setPicked((p) => (add ? (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]) : p.length === 1 && p[0] === v ? [] : [v])),
    /** replace the selection, e.g. from a box drawn over the chart */
    setMany: (vs: T[]) => setPicked(vs),
    clear: () => setPicked([]),
    /** true when nothing is picked, or v is picked */
    active: (v: T) => !picked.length || picked.includes(v),
    isPicked: (v: T) => picked.includes(v),
  }
}

/** Width and height of an element, kept current with a ResizeObserver. */
export function useElementSize<E extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<E>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setSize((s) => (Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1 ? s : { width, height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}
