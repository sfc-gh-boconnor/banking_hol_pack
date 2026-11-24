// AI3: + Add new > Agent > name it payments_platform_copilot > Create with CoCo > paste the brief.
import { createAgentRun, promptOf } from "../flows.mjs"

export const name = "ai3_create_agent"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = createAgentRun("payments_platform_copilot", promptOf("ai3_knowledge_extension", "Create an agent"))
