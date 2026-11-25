// DA1 "See every question in Monitoring": Monitoring tab > open the newest question.
import { semanticStudioRun, studioTab } from "../flows.mjs"
import { clickWithHighlight } from "../lib.mjs"

export const name = "da1_monitoring"
export const viewport = { width: 1280, height: 760 }
export const outputWidth = 800
export const crop = undefined
export const run = semanticStudioRun("SV_CLIENT_360", async (page, ws) => {
  await studioTab(page, ws, "Monitoring")
  await page.waitForTimeout(2000)
  // a Monitoring row, not the verified query of the same name in the editor on the left
  const panel = ws.getByText("Page 1", { exact: true }).locator("xpath=ancestor::*[.//*[contains(., 'Nov') or contains(., '20')]][2]")
  const row = panel.getByText(/lowest payment success rate|negative sentiment|Explain the dataset/).last()
  await clickWithHighlight(row)
  await page.waitForTimeout(3500)
})
