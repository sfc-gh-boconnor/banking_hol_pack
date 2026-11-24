// AI3: Marketplace > Snowflake Marketplace, searched for Cortex Knowledge Extension.
import { navRun, marketplaceSearch } from "../flows.mjs"

export const name = "ai3_marketplace"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = navRun("Marketplace", "Snowflake Marketplace", { then: marketplaceSearch("Cortex Knowledge Extension") })
