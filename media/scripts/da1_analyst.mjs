// DA1: AI > Analyst > BANKING_HOL.ANALYTICS > SV_CLIENT_360. Analyst now opens semantic views in a
// Workspace (the "Open semantic view in Workspaces" dialog), so the clip stops at that dialog.
import { navRun, analystDatabase, analystOpenDialog } from "../flows.mjs"

export const name = "da1_analyst"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = navRun("AI", "Analyst", { before: analystDatabase, open: "SV_CLIENT_360", then: analystOpenDialog })
