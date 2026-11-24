// DA3: AI > Agent Studio > Branch Network Advisor, with the consolidation question filled in (not sent).
import { agentChatRun, promptOf } from "../flows.mjs"

export const name = "da3_agent_chat"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = agentChatRun("Branch Network Advisor", promptOf("da3_branch_network_geo", "Ask for a consolidation plan"))
