// AI1: + Add new > Agent > name it payments_investigator > Create with CoCo > paste the brief.
import { createAgentRun, promptOf } from "../flows.mjs"

export const name = "ai1_create_agent"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = createAgentRun("payments_investigator", promptOf("ai1_agent_tools", "Create the agent"))
