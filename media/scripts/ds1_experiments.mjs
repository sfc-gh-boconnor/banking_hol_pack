// DS1: Machine learning > Experiments > RB_ATTRITION, both runs ticked, Compare.
import { navRun, compareRuns } from "../flows.mjs"

export const name = "ds1_experiments"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = navRun("Machine learning", "Experiments", { open: "RB_ATTRITION", then: compareRuns })
