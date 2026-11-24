// GOV2: AI > Agent Studio > Payments Audit Agent > Monitoring tab.
import { agentTabRun } from "../flows.mjs"

export const name = "gov2_agent_monitoring"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = agentTabRun("Payments Audit Agent", "Observability")
