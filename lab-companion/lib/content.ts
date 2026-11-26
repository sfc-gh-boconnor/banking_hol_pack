import content from "@/lib/content.generated.json"
import useCasesJson from "@/lib/use-cases.json"
import { CHECKS } from "@/lib/checks"

/** One step of a module. prompt is pasted into Cortex Code; sql is a small snippet to run. */
export type Step = {
  title: string
  body: string
  where: string
  prompt: string
  sql: string
  expect: string
  checkId: string
  /** Where the prompt is pasted when it isn't the Cortex Code sidebar */
  pasteInto: string
  /** Optional short clip of the UI clicks, a file in public/media (e.g. "de1_dbt_build.mp4") */
  media?: string
  /** Caption for the clip */
  mediaCaption?: string
}

export type Module = {
  code: string
  title: string
  persona: string
  minutes: number | null
  prerequisites: string
  /** Non-empty when the module can be skipped: the reason shown to attendees */
  optional: string
  question: string
  build: string[]
  steps: Step[]
  check: string
  note: string
  kind: "core" | "vignette"
  track?: string
  sqlPath: string
  sql: string
}

export type CatchUp = { name: string; sqlPath: string; sql: string }

export const MODULES = content.modules as Module[]
export const CATCHUPS = content.catchups as CatchUp[]
// Architecture: lanes from core/architecture.json, talking points from core/C2_data_product_tour.md
export type ArchItem = { name: string; detail: string; modules: string[] }
export type ArchLane = { lane: string; icon: string; summary: string; items: ArchItem[] }
export const ARCHITECTURE = content.architecture as {
  lanes: ArchLane[]
  governance: { name: string; icon: string; detail: string; modules: string[] }
  intro: string
  points: { title: string; body: string }[]
}

/** Persona pathways: the order attendees work through vignettes (see pathways/README.md). */
export const PATHWAYS: Record<string, { blurb: string; modules: string[] }> = {
  "Data Engineer": { blurb: "Autonomous data engineering and real-time analytics: Iceberg sources to tested, self-scheduling data products with dbt, Pipeline Builder and dynamic tables, then streaming payments served by an interactive warehouse, and PySpark pipelines run and monitored on Snowflake with no cluster.", modules: ["C0", "C1", "DE1", "DE2", "DE3", "DE4", "DE5", "GOV2"] },
  "Data Analyst": { blurb: "An interactive client 360 report refreshed every morning, AI SQL on client feedback, a trusted semantic view anyone can query in plain English, drive-time catchment analysis on the retail branch network, customer lifetime value with next-best offers, and Tableau-style level of detail metrics in a semantic view.", modules: ["C0", "C1", "DA0", "DA1", "DA2", "DA3", "DA4", "DA5", "DA6"] },
  "Payments Ops": { blurb: "A client 360 agent, alert triage with AI next actions, complaint themes, and CoWork charts, research, automations, documents and AI dashboards - low code.", modules: ["C0", "C1", "OPS1", "OPS2", "OPS3", "OPS4", "DA1"] },
  "Data Scientist": { blurb: "Retail banking ML: a data scientist's tour of labels, features and leakage, then an attrition model, its calibration and a customer margin model, and a fraud anomaly model, built with Cortex Code in notebooks, tracked in experiments and registered in the Model Registry.", modules: ["DS0", "DS1", "DS4", "DS2", "DS3", "AI4"] },
  "AI Builder": { blurb: "Build the semantic view your agents use, then agents with custom tools, a governed MCP server, Marketplace knowledge, AI SQL on call transcripts and financial crime evidence, and Cortex Search.", modules: ["C0", "C1", "DA2", "AI1", "AI3", "AI2", "AI4", "AI5"] },
  "App Builder": { blurb: "Plan an app with Cortex Code, then build, preview, deploy and share a fraud investigator Streamlit app from your own workspace. No Git account or install needed.", modules: ["C0", "APP0", "APP1"] },
  "Governance": { blurb: "Data and AI governance: classify, tag, mask and filter PII, prove lineage and who accessed what, then govern every AI client through one gateway.", modules: ["C0", "C1", "GOV1", "GOV2", "GOV3", "GOV4", "GOV5", "AI3"] },
}

export const moduleByCode = (code: string) => MODULES.find((m) => m.code === code)
export const checkIds = (code: string) => (CHECKS[code] ?? []).map((c) => c.id)

/** One step of a use case: a module, and what it contributes to the outcome. */
export type UseCaseStep = { code: string; why: string }

/**
 * Use-case pathways: one business outcome end to end, across roles. Senior attendees
 * follow the whole story; a team can split the steps by role. demoStop deep-links to
 * the finished result in the executive demo (/demo?tour=...&stop=...).
 */
export type UseCase = {
  id: string
  title: string
  business: "Retail" | "Corporate" | "Every business"
  question: string
  outcome: string
  roles: string[]
  steps: UseCaseStep[]
  demo: { tour: "retail" | "corporate"; stop: string }
  /** ISO date the use case was added: recent ones show a New badge */
  addedOn: string
  /** Sourced reasons it matters now, from the hol-banking-usecases research */
  whyNow?: { text: string; source: { label: string; url: string }; published: string; read: string }[]
}

/**
 * Built into the app: the fallback when the account's copy of the repo can't be read.
 * lib/use-cases.ts reads the same file from the repo at runtime, so installed labs get new
 * use cases without a redeploy (see setup/00_admin_provision.sql, REFRESH_LAB_CONTENT_TASK).
 */
export const BUILT_IN_USE_CASES = useCasesJson as UseCase[]

/** Built-in only: server pages use getUseCases() from lib/use-cases.ts for the live list. */
export const builtInUseCaseById = (id: string) => BUILT_IN_USE_CASES.find((u) => u.id === id)

