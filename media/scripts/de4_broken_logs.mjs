// DE4: Monitoring > Spark > Batch Jobs > payments_nightly_broken (FAILED) > Logs.
import { navRun } from "../flows.mjs"

export const name = "de4_broken_logs"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = navRun("Monitoring", "Spark", { warehouse: true, open: "payments_nightly_broken", tab: "Telemetry", then: (p) => p.waitForTimeout(6000) })
