// OPS1: + Add new > Agent > name it corporate_payments_360 > Create with CoCo > paste the brief.
import { createAgentRun, promptOf } from "../flows.mjs"

export const name = "ops1_create_agent"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = createAgentRun("corporate_payments_360", promptOf("ops1_payments_360_agent", "Create the agent"))
