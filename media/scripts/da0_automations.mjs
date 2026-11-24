// DA0: where the report refresh lives: CoCo tab > Automations in the CoCo side nav.
import { cocoAutomationsRun } from "../flows.mjs"

export const name = "da0_automations"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = cocoAutomationsRun()
