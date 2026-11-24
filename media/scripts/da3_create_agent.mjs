// DA3: + Add new > Agent > name it branch_network_advisor > Create with CoCo > paste the brief.
import { createAgentRun, promptOf } from "../flows.mjs"

export const name = "da3_create_agent"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = createAgentRun("branch_network_advisor", promptOf("da3_branch_network_geo", "Create the branch network advisor"))
