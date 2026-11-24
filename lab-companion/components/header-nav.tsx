"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

// Top-level sections, in the order attendees need them: the labs first, then the big picture,
// then the detail behind it, then the facilitator's demo.
const SECTIONS = [
  { href: "/", label: "Labs", match: (p: string) => p === "/" || p.startsWith("/module") || p.startsWith("/usecase") },
  { href: "/architecture", label: "Architecture", match: (p: string) => p.startsWith("/architecture") },
  { href: "/data", label: "Data map", match: (p: string) => p.startsWith("/data") },
  { href: "/demo", label: "Executive demo", match: (p: string) => p.startsWith("/demo") },
]

/** HeaderNav: the section tabs in the top bar; the current section is highlighted. */
export function HeaderNav() {
  const path = usePathname() ?? "/"
  return (
    <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
      {SECTIONS.map((s) => {
        const active = s.match(path)
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 font-heading text-xs font-extrabold uppercase tracking-wide text-white hover:bg-white/15",
              active && "bg-white text-[var(--sf-mid-blue)] hover:bg-white",
            )}
          >
            {s.label}
          </Link>
        )
      })}
    </nav>
  )
}
