// OPS3: + Add new > Dashboard > name it payments_ops, then the build prompt in the Cortex Code sidebar.
import { workspaceAddRun, promptOf, dashboardAfter } from "../flows.mjs"

export const name = "ops3_create_dashboard"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = workspaceAddRun("Dashboard", { after: dashboardAfter("payments_ops"), sameChat: true, prompt: promptOf("ops3_cowork_dashboards", "Build an AI dashboard") })
