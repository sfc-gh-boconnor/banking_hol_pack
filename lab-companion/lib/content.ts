import content from "@/lib/content.generated.json"
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
}

export const USE_CASES: UseCase[] = [
  {
    id: "app-scams",
    title: "Stop APP scams and mule accounts",
    business: "Retail",
    question: "Which payments are scams, who is behind them, and which victims should we reimburse first?",
    outcome: "Unusual payments scored by a model, mule rings traced across victims, each case drafted by AI from the notes, call, police report and phishing screenshot, and outside records matched to customers.",
    roles: ["Data Scientist", "AI Builder", "Fraud investigator"],
    steps: [
      { code: "C0", why: "Tour the retail data: customers, transactions, fraud cases and SARs." },
      { code: "DS2", why: "Score every outbound payment against the customer's own normal, so investigators see the unusual ones first." },
      { code: "AI4", why: "Read the case notes, calls, police PDFs and phishing screenshots with AI SQL, and draft a reimbursement decision under the PSR rules." },
      { code: "AI5", why: "Search cases and SARs in plain English, and match names on outside records to customers despite misspellings." },
      { code: "GOV1", why: "Mask the account identifiers investigators don't need, before any of this reaches an agent or app." },
      { code: "GOV5", why: "Protect names, dates of birth, incomes and case notes by what they are, so analysts see banded values and nobody sees what they should not." },
      { code: "DE5", why: "Catalogue the police reports and phishing screenshots on the stage, and share one case folder with the reviewing team only." },
    ],
    demo: { tour: "retail", stop: "money" },
  },
  {
    id: "attrition",
    title: "Keep the customers worth keeping",
    business: "Retail",
    question: "Who is about to leave, why, and where would closing a branch push more of them out?",
    outcome: "An attrition model in the Model Registry scoring every customer, each customer's lifetime value and value at risk with a next-best offer, the reasons behind each score, what customers say on calls, and the profit at risk if each branch closed.",
    roles: ["Data Scientist", "Data Analyst", "Retail leadership"],
    steps: [
      { code: "C0", why: "Tour the retail data: monthly profit per customer, products, branches and calls." },
      { code: "DS0", why: "Learn the label, point-in-time features and the leakage traps before training anything." },
      { code: "DS1", why: "Train, track and register an attrition model, then score every customer." },
      { code: "DS4", why: "Calibrate the attrition model into real probabilities and predict each customer's margin, tracked and registered." },
      { code: "DA5", why: "Turn the predictions into lifetime value and value at risk, rank the save list by money, and pick a next-best offer." },
      { code: "DA6", why: "Compare every branch, neighbourhood and value segment with its city and the UK using level of detail metrics in a semantic view, then ask an agent." },
      { code: "DA3", why: "Which branches could close, which nearby branches absorb their customers, and how much longer each customer travels." },
      { code: "DA4", why: "Advanced: turn a real-roads drive-time matrix into the closure lookup behind the demo, and see why hexagon size matters." },
      { code: "AI4", why: "Find the reasons in customers' own words: savings rates, branch access, service." },
    ],
    demo: { tour: "retail", stop: "attrition" },
  },
  {
    id: "branch-value",
    title: "Compare every branch with its city and the UK",
    business: "Retail",
    question: "Which branches and neighbourhoods are worth more or less than their city, and how much of the UK's value at risk sits in each?",
    outcome: "One semantic view with level of detail metrics, so every branch is compared with its city and the UK the same way in SQL, Semantic Studio, CoWork and Power BI.",
    roles: ["Data Analyst", "Retail leadership"],
    steps: [
      { code: "C0", why: "Tour the retail data: customers, branches and monthly profit." },
      { code: "DS4", why: "Calibrated attrition and margin predictions for every customer." },
      { code: "DA5", why: "Lifetime value and value at risk per customer, by segment." },
      { code: "DA6", why: "Compare each branch and neighbourhood with its city and the UK in one semantic view, then ask an agent." },
    ],
    demo: { tour: "retail", stop: "attrition" },
  },
  {
    id: "corporate-360",
    title: "Corporate client 360 and payment operations",
    business: "Corporate",
    question: "Which clients' payments are failing or running slow, what are they telling us, and what should ops do next?",
    outcome: "Tested, self-refreshing payment data products, a client 360 report and agent for relationship managers, alert triage with AI next actions, and feedback themed by AI SQL.",
    roles: ["Data Engineer", "Data Analyst", "Payments Ops"],
    steps: [
      { code: "C1", why: "Explore the corporate payments data product end to end." },
      { code: "DE1", why: "Build tested, documented dbt models from the Iceberg sources." },
      { code: "DA0", why: "A live client 360 report ops and RMs filter themselves, refreshed every morning." },
      { code: "DA2", why: "One trusted definition of a client's payments health that anyone can question in plain English." },
      { code: "OPS1", why: "A client 360 agent relationship managers can ask about their own clients." },
      { code: "OPS2", why: "Triage operations alerts and let AI suggest the next action." },
      { code: "DA1", why: "Theme and score every piece of client feedback with AI SQL." },
    ],
    demo: { tour: "corporate", stop: "clients" },
  },
  {
    id: "safe-ai",
    title: "Roll out AI safely",
    business: "Every business",
    question: "How do we give every team AI on bank data without losing control of PII, access or audit?",
    outcome: "PII classified, tagged and masked; lineage and access history that prove who saw what; and every AI client governed through one gateway, with agents built on governed data only.",
    roles: ["Governance", "AI Builder", "Platform team"],
    steps: [
      { code: "C1", why: "See the data products the AI will sit on." },
      { code: "GOV1", why: "Classify, tag, mask and filter PII once, so it's enforced in every tool, agent and app." },
      { code: "AI1", why: "Build an agent whose tools answer from governed data, not from whatever it can reach." },
      { code: "GOV5", why: "One masking policy per kind of data, attached to the personal data tag, so a new column is protected the moment it is tagged." },
      { code: "GOV2", why: "Prove lineage and who accessed what, for audit." },
      { code: "DE5", why: "One inventory of every stage and registered model, with its owner and who can read it." },
      { code: "GOV3", why: "Govern every AI client and model through one gateway." },
    ],
    demo: { tour: "corporate", stop: "governed" },
  },
  {
    id: "regulation",
    title: "Prove control to the regulator",
    business: "Every business",
    question: "Could we show a regulator, today, that we stay inside impact tolerance, answer data requests on time and know every model we run?",
    outcome: "An impact tolerance alert that escalates breaches with its own history, a customer's data request answered from tagged personal data with who read it, and a model risk evidence pack from the Model Registry. Each control leaves the evidence behind.",
    roles: ["Payments Ops", "Governance", "Data Scientist", "Risk and compliance"],
    steps: [
      { code: "OPS4", why: "Operational resilience: hold each important business service's impact tolerance as data and escalate a breach with a Snowflake Alert." },
      { code: "GOV1", why: "Classify, tag and mask personal data once, so the policies follow it everywhere." },
      { code: "GOV4", why: "UK GDPR: answer a customer's request for their data from the tags, hold back financial crime records, log the due date." },
      { code: "GOV5", why: "Show the regulator that every personal column is masked by role, with a coverage report that lists any gap." },
      { code: "GOV2", why: "Prove who accessed what, from access history." },
      { code: "DE5", why: "Show every model and evidence file the bank holds, who owns it and who can read it." },
      { code: "DS4", why: "A calibrated challenger to the attrition model, and a margin model with its baseline: evidence for model risk review." },
      { code: "DS3", why: "Model risk: inventory, validation against real outcomes, champion vs challenger, model card and approval." },
      { code: "AI4", why: "APP scams and SARs: draft reimbursement decisions and check SAR narratives, with people deciding." },
    ],
    demo: { tour: "corporate", stop: "avoid-fine" },
  },
]

export const useCaseById = (id: string) => USE_CASES.find((u) => u.id === id)

