// DS1: Machine learning > Models > RB_ATTRITION_MODEL (version, metrics, comment).
import { navRun } from "../flows.mjs"

export const name = "ds1_model_registry"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = navRun("Machine learning", "Models", { open: "RB_ATTRITION_MODEL" })
