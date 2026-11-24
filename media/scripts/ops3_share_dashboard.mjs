// OPS3: open the payments_ops dashboard > Share (Who has access: HOL_PARTICIPANT, Can view).
import { dashboardShareRun } from "../flows.mjs"

export const name = "ops3_share_dashboard"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = dashboardShareRun("payments_ops")
