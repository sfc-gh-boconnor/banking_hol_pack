// GOV2: the daily access check lives under CoCo tab > Automations.
import { cocoAutomationsRun } from "../flows.mjs"

export const name = "gov2_automations"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = cocoAutomationsRun()
