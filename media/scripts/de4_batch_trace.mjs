// DE4: Monitoring > Spark > Batch Jobs > payments_nightly > Trace.
import { navRun } from "../flows.mjs"

export const name = "de4_batch_trace"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = navRun("Monitoring", "Spark", { warehouse: true, open: "payments_nightly", tab: "Telemetry", then: (p) => p.waitForTimeout(6000) })
