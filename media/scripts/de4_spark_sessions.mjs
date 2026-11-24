// DE4: Monitoring > Spark (pick BANKING_WH) > Spark Sessions.
import { navRun } from "../flows.mjs"

export const name = "de4_spark_sessions"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = navRun("Monitoring", "Spark", { warehouse: true, tab: "Spark Sessions" })
