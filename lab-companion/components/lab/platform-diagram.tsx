import { ArrowDown, ArrowRight, ArrowLeftRight } from "lucide-react"
import type { ReactNode } from "react"
import { ModuleChips } from "@/components/lab/architecture"
import { cn } from "@/lib/utils"

type Box = { name: string; detail?: string; modules?: string[] }

function Tile({ b, tone = "default" }: { b: Box; tone?: "default" | "ice" | "gov" }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border p-2.5 shadow-sm",
        tone === "ice" && "border-[var(--sf-blue)]/60 bg-[var(--sf-blue)]/10",
        tone === "gov" && "border-white/30 bg-white/10 text-white",
        tone === "default" && "bg-card",
      )}
    >
      <div className="text-xs font-semibold leading-tight">{b.name}</div>
      {b.detail && (
        <div className={cn("text-[11px] leading-snug", tone === "gov" ? "text-white/80" : "text-muted-foreground")}>{b.detail}</div>
      )}
      {b.modules && <ModuleChips codes={b.modules} inverse={tone === "gov"} />}
    </div>
  )
}

function Layer({ title, note, children, cols = "sm:grid-cols-2 lg:grid-cols-4" }: { title: string; note: string; children: ReactNode; cols?: string }) {
  return (
    <div className="rounded-lg bg-[var(--sf-mid-blue)]/5 p-3 dark:bg-white/5">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <span className="font-heading text-xs font-black uppercase tracking-wide text-[var(--sf-mid-blue)] dark:text-[var(--sf-star-blue)]">{title}</span>
        <span className="text-[11px] text-muted-foreground">{note}</span>
      </div>
      <div className={cn("grid gap-2", cols)}>{children}</div>
    </div>
  )
}

function Side({ title, note, items, align }: { title: string; note: string; items: Box[]; align: "left" | "right" }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <div>
        <div className="font-heading text-xs font-black uppercase tracking-wide text-[var(--sf-mid-blue)] dark:text-[var(--sf-star-blue)]">{title}</div>
        <div className="text-[11px] text-muted-foreground">{note}</div>
      </div>
      {items.map((b) => <Tile key={b.name} b={b} />)}
      <div className="mt-auto hidden justify-center text-primary lg:flex" aria-hidden>
        {align === "left" ? <ArrowRight className="h-5 w-5" /> : <ArrowLeftRight className="h-5 w-5" />}
      </div>
    </div>
  )
}

const USERS: Box[] = [
  { name: "Relationship managers", detail: "client briefings and next best action" },
  { name: "Payments operations", detail: "stuck payments, SLA and alerts" },
  { name: "Analysts and data scientists", detail: "notebooks, semantic views, models" },
  { name: "Model risk and audit", detail: "evidence, lineage, model cards" },
]

const EXPERIENCE: Box[] = [
  { name: "Cortex Agents and MCP", detail: "run as the user; governed tools", modules: ["OPS1", "OPS2", "AI1", "AI2", "AI3"] },
  { name: "Snowflake CoWork", detail: "chat, dashboards, automations", modules: ["OPS3", "OPS4"] },
  { name: "Apps and reports", detail: "Streamlit, App Runtime, services", modules: ["DA0", "APP0", "APP1"] },
  { name: "Snowsight and notebooks", detail: "SQL, Python, maps, Cortex Code", modules: ["DA1", "DA3"] },
]

const INTELLIGENCE: Box[] = [
  { name: "Semantic views", detail: "one set of business definitions", modules: ["DA2", "DA6"] },
  { name: "Cortex AI SQL", detail: "text, images, PDFs in plain SQL", modules: ["AI4"] },
  { name: "Cortex Search", detail: "calls and case notes", modules: ["AI5"] },
  { name: "ML and Model Registry", detail: "train, register, monitor", modules: ["DS1", "DS2", "DS4"] },
]

const COMPUTE: Box[] = [
  { name: "Virtual warehouses", detail: "BANKING_WH; interactive warehouse for the ops floor", modules: ["DE3"] },
  { name: "Notebook and ML job pools", detail: "container compute for Python and training", modules: ["DS1"] },
  { name: "Spark on Snowflake", detail: "PySpark via Snowpark Connect", modules: ["DE4"] },
  { name: "Pipelines", detail: "dbt, dynamic tables, Pipeline Builder", modules: ["DE1", "DE2"] },
]

const DATA: Box[] = [
  { name: "Open Iceberg tables", detail: "RAW_DATA: read-only, readable by other engines", modules: ["C0", "C1"] },
  { name: "Data products", detail: "ANALYTICS marts and DP_* Iceberg products", modules: ["DE1", "DA5"] },
  { name: "Snowflake Postgres mirror", detail: "operational events kept current as Iceberg", modules: ["DE3"] },
  { name: "Stages and registries", detail: "evidence files, models, notebooks, app artefacts under the same roles", modules: ["DE5", "DS1"] },
]

const GOVERN: Box[] = [
  { name: "Access: roles", detail: "HOL_ADMIN owns the data and platform. HOL_PARTICIPANT reads RAW_DATA and builds in a personal database. HOL_RESTRICTED sees masked data", modules: ["GOV1", "GOV5"] },
  { name: "Protect: masking and tags", detail: "masking policies by role, personal data tags, network rules and policies on every egress and ingress", modules: ["GOV1", "GOV4", "GOV5"] },
  { name: "Trust: lineage and audit", detail: "lineage, access history, AI observability traces", modules: ["GOV2", "GOV3"] },
  { name: "AI and requests", detail: "model access via roles, AI Gateway, data subject requests", modules: ["GOV4"] },
]

export function PlatformDiagram() {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {USERS.map((b) => <Tile key={b.name} b={b} />)}
      </div>
      <ArrowDown className="mx-auto h-5 w-5 text-primary" aria-hidden />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)]">
        <Side
          align="left"
          title="Sources"
          note="Land once, no copies"
          items={[
            { name: "Bank systems", detail: "payments, clients, retail, calls, complaints", modules: ["C0"] },
            { name: "Operational Postgres", detail: "live payment events", modules: ["DE3"] },
            { name: "Marketplace", detail: "Snowflake Docs extension", modules: ["AI3"] },
            { name: "OpenRouteService", detail: "routing in Snowflake for drive times", modules: ["DA4"] },
          ]}
        />

        <div className="rounded-xl border-2 border-[var(--sf-blue)] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-heading text-sm font-black uppercase tracking-wide text-[var(--sf-mid-blue)] dark:text-[var(--sf-star-blue)]">Snowflake AI Data Cloud</span>
            <span className="text-[11px] text-muted-foreground">One governed platform: data, compute and AI together</span>
          </div>
          <div className="space-y-2">
            <Layer title="Experience" note="Where people and agents use it">{EXPERIENCE.map((b) => <Tile key={b.name} b={b} />)}</Layer>
            <Layer title="Intelligence" note="Business meaning and AI on the same data">{INTELLIGENCE.map((b) => <Tile key={b.name} b={b} />)}</Layer>
            <Layer title="Compute" note="Elastic engines, one copy of the data">{COMPUTE.map((b) => <Tile key={b.name} b={b} />)}</Layer>
            <Layer title="Storage" note="Open table format, no lock-in">{DATA.map((b, i) => <Tile key={b.name} b={b} tone={i < 3 ? "ice" : "default"} />)}</Layer>
          </div>
          <div className="mt-3 rounded-lg bg-[var(--sf-mid-blue)] p-3 text-white">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
              <span className="font-heading text-xs font-black uppercase tracking-wide">Snowflake Horizon Catalog</span>
              <span className="text-[11px] text-white/80">Governance applied once, enforced in every layer above, including AI answers</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{GOVERN.map((b) => <Tile key={b.name} b={b} tone="gov" />)}</div>
          </div>
        </div>

        <Side
          align="right"
          title="Open ecosystem"
          note="Iceberg keeps the data portable"
          items={[
            { name: "Other engines", detail: "Spark, Trino, Flink and others read the same Iceberg tables" },
            { name: "BI and AI tools", detail: "connect with the same roles and policies" },
            { name: "Partners and regulators", detail: "governed sharing without copying" },
          ]}
        />
      </div>
    </div>
  )
}
