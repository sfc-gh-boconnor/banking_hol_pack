// OPS3: CoWork > + > Deep Research, with the Logistics question filled in (not sent).
import { coworkRun, promptOf } from "../flows.mjs"

export const name = "ops3_deep_research"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = coworkRun("Payments Ops CoWork", promptOf("ops3_cowork_dashboards", "Investigate with Deep Research"), { deepResearch: true })
