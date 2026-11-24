// OPS3: Snowflake CoWork > Payments Ops CoWork, with the overview prompt filled in (not sent).
import { coworkRun, promptOf } from "../flows.mjs"

export const name = "ops3_cowork"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = coworkRun("Payments Ops CoWork", promptOf("ops3_cowork_dashboards", "Open CoWork"))
