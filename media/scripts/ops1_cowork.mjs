// OPS1: Snowflake CoWork > Corporate Payments 360, with the briefing question filled in (not sent).
import { coworkRun } from "../flows.mjs"

export const name = "ops1_cowork"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = coworkRun("Corporate Payments 360", "Brief me on the client with the most failed payment value")
