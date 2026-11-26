// DA2 "Score it with an evaluation run": Evaluations > Create evaluation run > name da2_baseline,
// metric version v3, select all verified queries. Highlights Run evaluation, then cancels.
import { semanticStudioRun, studioTab } from "../flows.mjs"
import { clickWithHighlight, highlight } from "../lib.mjs"

export const name = "da2_evaluation"
export const viewport = { width: 1280, height: 760 }
export const outputWidth = 800
export const crop = undefined
export const run = semanticStudioRun("SV_CLIENT_360", async (page, ws) => {
  await studioTab(page, ws, "Evaluations")
  await clickWithHighlight(ws.getByRole("button", { name: "Create evaluation run" }))
  const dlg = ws.getByRole("dialog").filter({ hasText: "Create evaluation run" })
  await dlg.waitFor({ timeout: 20_000 })
  await page.waitForTimeout(800)
  const name = dlg.getByRole("textbox").first()
  await clickWithHighlight(name)
  await name.fill("da2_baseline")
  // Metric version: v1 is the default but its judge model has reached end of life
  await clickWithHighlight(dlg.getByText(/^v1$/).first())
  await page.waitForTimeout(800)
  await clickWithHighlight(ws.getByText(/^v3$/).last())
  await page.waitForTimeout(800)
  await clickWithHighlight(dlg.getByText("Select all", { exact: true }))
  await page.waitForTimeout(800)
  await highlight(dlg.getByRole("button", { name: "Run evaluation" }), 2000)
  await dlg.getByRole("button", { name: "Cancel", exact: true }).click()
  await page.waitForTimeout(800)
})
