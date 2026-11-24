// DA0 step 1: CoCo tab > New session, with the report prompt pasted (not sent).
import { cocoSessionRun, promptOf } from "../flows.mjs"

export const name = "da0_new_session"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = { x: 0, y: 0, width: 1024, height: 470 }
export const run = cocoSessionRun(promptOf("da0_interactive_report", "Build an interactive report"))
