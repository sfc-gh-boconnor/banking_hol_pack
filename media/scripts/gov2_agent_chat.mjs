// GOV2 step 1: AI > Agent Studio > Payments Audit Agent, with the first question filled in (not sent).
import { agentChatRun, promptOf } from "../flows.mjs"

export const name = "gov2_agent_chat"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = agentChatRun("Payments Audit Agent", promptOf("gov2_lineage_audit", "Ask the agent a few questions"))
