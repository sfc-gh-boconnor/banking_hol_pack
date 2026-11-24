"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Database, KeyRound, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DATA_PRODUCTS, JOIN_KEYS } from "@/lib/data-map"
import { ArchitectureFlow } from "@/components/lab/architecture"

const fmt = (n: number) => n.toLocaleString("en-GB")

function ModuleTags({ codes }: { codes: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {codes.map((c) => (
        <Link key={c} href={`/module/${c}`} className="rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10">
          {c}
        </Link>
      ))}
    </div>
  )
}


/** The Data map: architecture, every data product with live row counts, and the keys that join them. */
export function DataMap() {
  const live = useQuery<{ counts: Record<string, number | null> }>({
    queryKey: ["data-map"],
    retry: 1,
    queryFn: async () => {
      const r = await fetch("/api/data-map")
      if (!r.ok) throw new Error("Failed")
      return r.json()
    },
  })
  const count = (name: string, fallback: number) => {
    const c = live.data?.counts[name]
    return c == null ? null : c ?? fallback
  }
  const exists = (name: string) => !live.data || name in live.data.counts

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>How it fits together</CardTitle>
          <CardDescription>Data flows left to right, from source to action. Each box shows the modules that work there.</CardDescription>
        </CardHeader>
        <CardContent>
          <ArchitectureFlow compact />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm">Data products</h2>
        <p className="text-xs text-muted-foreground">
          {live.isSuccess ? "Row counts are live from your account." : live.isError ? "Live counts unavailable: showing counts from a freshly built account." : "Loading live row counts..."}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {DATA_PRODUCTS.map((p) => (
            <Card key={p.id} className="border-t-4 border-t-primary">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" aria-hidden />{p.name}</CardTitle>
                  <Badge variant="outline">{p.business}</Badge>
                </div>
                <CardDescription className="font-mono text-[11px]">{p.schema}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-relaxed">{p.summary}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left"><th className="py-1.5 pr-2 font-semibold">Table</th><th className="py-1.5 pr-2 font-semibold">One row is</th><th className="py-1.5 text-right font-semibold">Rows</th></tr>
                    </thead>
                    <tbody>
                      {p.tables.map((t) => {
                        const short = t.name.split(".").pop() as string
                        const n = live.data ? count(t.name.includes(".") ? t.name : short, t.rows) : t.rows
                        return (
                          <tr key={t.name} className="border-b last:border-0">
                            <td className="py-1.5 pr-2 font-mono">{t.name}</td>
                            <td className="py-1.5 pr-2 text-muted-foreground">{t.grain}</td>
                            <td className="py-1.5 text-right tabular-nums">{!exists(t.name.includes(".") ? t.name : short) ? <span className="text-muted-foreground">built in the lab</span> : n == null ? "view" : fmt(n)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs"><span className="font-semibold">Also works for:</span> {p.alsoWorksFor}</p>
                <ModuleTags codes={p.modules} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" aria-hidden />Keys that join the data</CardTitle>
          <CardDescription>There are no declared foreign keys: these are the joins to use.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b text-left"><th className="py-1.5 pr-2 font-semibold">From</th><th className="py-1.5 pr-2 font-semibold">To</th><th className="py-1.5 font-semibold">Gives you</th></tr></thead>
            <tbody>
              {JOIN_KEYS.map((k) => (
                <tr key={k.from} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 font-mono">{k.from}</td>
                  <td className="py-1.5 pr-2 font-mono">{k.to}</td>
                  <td className="py-1.5 text-muted-foreground">{k.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
