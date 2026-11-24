// DE2: Catalog > Explorer > BANKING_HOL > ANALYTICS > Dynamic Tables > DT_LIVE_SLA_BREACHES > Data Preview, Lineage.
import { navRun } from "../flows.mjs"

export const name = "de2_catalog_preview"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = navRun("Catalog", "Explorer", { tree: ["BANKING_HOL", "ANALYTICS", "Dynamic tables", "DT_LIVE_SLA_BREACHES"], tab: ["Preview", "Lineage"] })
