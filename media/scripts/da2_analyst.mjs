// DA2 "Open it in Semantic Studio": Home > AI > Analyst > BANKING_HOL.ANALYTICS > SV_CLIENT_360,
// then pick banking-hol-pack in "Open semantic view in Workspaces" (highlights Open, then cancels).
import { navRun, analystDatabase, analystOpenIn } from "../flows.mjs"

export const name = "da2_analyst"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = navRun("AI", "Analyst", { before: analystDatabase, open: "SV_CLIENT_360", then: analystOpenIn("banking-hol-pack") })
