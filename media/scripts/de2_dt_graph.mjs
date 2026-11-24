// DE2: Transformation > Dynamic tables (pick BANKING_WH) > DT_RETRYABLE_SUMMARY > Graph.
import { navRun } from "../flows.mjs"

export const name = "de2_dt_graph"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = navRun("Transformation", "Dynamic tables", { warehouse: true, open: "DT_RETRYABLE_SUMMARY", tab: "Graph", then: async (p) => { const { selectWarehouse } = await import("../snowsight.mjs"); await selectWarehouse(p); await p.waitForTimeout(4000) } })
