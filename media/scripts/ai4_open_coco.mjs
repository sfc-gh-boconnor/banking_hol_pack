// AI4 step 1: CoCo tab > New session, with the first AI4 prompt pasted (not sent).
import { cocoSessionRun, promptOf } from "../flows.mjs"

export const name = "ai4_open_coco"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = { x: 0, y: 0, width: 1024, height: 470 }
export const run = cocoSessionRun(promptOf("ai4_aisql_customer_voice", "Meet the unstructured data"))
