// AI3: Snowflake CoWork > Payments Platform Copilot, with the two-source question filled in (not sent).
import { coworkRun } from "../flows.mjs"

export const name = "ai3_cowork"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = coworkRun("Payments Platform Copilot", "Which 3 clients have the most open critical alerts, and how could I build a dynamic table to keep that list up to date?")
