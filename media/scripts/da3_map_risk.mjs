// DA3: the risk_map results > Chart > Chart type: Map > Geo type > Color by. Recorded by hand (DA3_MANUAL=1, see ../map_flow.mjs).
import { mapRun } from "../map_flow.mjs"

export const name = "da3_map_risk"
export const viewport = { width: 1280, height: 800 }
export const outputWidth = 800
export const crop = undefined
export const run = mapRun({ cell: "risk_map", act: async () => {} })
