// APP0 step 1: CoCo tab > New session, with the planning prompt pasted (not sent).
import { cocoSessionRun, promptOf } from "../flows.mjs"

export const name = "app0_open_coco"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = { x: 0, y: 0, width: 1024, height: 470 }
export const run = cocoSessionRun(promptOf("app0_plan_an_app", "Plan the app"))
