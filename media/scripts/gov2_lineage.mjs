// GOV2: Catalog > Explorer > BANKING_HOL > RAW_DATA > Tables > PAYMENTS > Lineage.
import { navRun } from "../flows.mjs"

export const name = "gov2_lineage"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = navRun("Catalog", "Explorer", { tree: ["BANKING_HOL", "RAW_DATA", "Tables", "PAYMENTS"], tab: "Lineage" })
