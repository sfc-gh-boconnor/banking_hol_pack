// AI1: AI > Agent Studio > Payments Investigator playground, with the first question filled in (not sent).
import { agentChatRun, promptOf } from "../flows.mjs"

export const name = "ai1_playground"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = agentChatRun("Payments Investigator", promptOf("ai1_agent_tools", "Test it on a real payment"))
