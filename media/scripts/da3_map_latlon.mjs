// DA3 step "Map the branch network": the network results > Chart > Map > Lat / Lon > Color by SITE > Full screen.
// Manual mode: set DA3_MANUAL=1 and the script waits (while recording) until /tmp/da3_done exists.
import { existsSync, rmSync } from "node:fs"
import { mapRun } from "../map_flow.mjs"

export const name = "da3_map_latlon"
export const viewport = { width: 1280, height: 800 }
export const outputWidth = 800
export const crop = undefined
export const run = mapRun({
  cell: "network",
  act: async ({ page, ws, click, field, pick }) => {
    if (process.env.DA3_MANUAL) {
      rmSync("/tmp/da3_done", { force: true })
      await page.bringToFront()
      await page.evaluate(() => alert("Your turn: draw the map (Chart > Chart type: Map...). Click OK first.")).catch(() => {})
      while (!existsSync("/tmp/da3_done")) await page.waitForTimeout(1000)
      return
    }
    await pick("Chart type", "Map")
    await click(field("Geo type"))
    await click(ws.getByText("Lat / Lon", { exact: true }).last())
    await pick("Color by", "SITE")
    await click(ws.getByRole("button", { name: "Full screen" }).first())
  },
})
