// DA2 "Find your way around the semantic view": Visual (PAYMENTS dimensions and metrics),
// Diagram, YAML, back to Visual, then the four side-panel tabs.
import { semanticStudioRun, studioTab } from "../flows.mjs"
import { clickWithHighlight } from "../lib.mjs"

export const name = "da2_studio_tour"
export const viewport = { width: 1280, height: 760 }
export const outputWidth = 800
export const crop = undefined
export const run = semanticStudioRun("SV_CLIENT_360", async (page, ws) => {
  const payments = ws.getByText("PAYMENTS", { exact: true }).first()
  await payments.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  // the Dimensions and Metrics rows straight after the PAYMENTS heading
  const section = payments.locator("xpath=ancestor::*[.//*[normalize-space()='Metrics']][1]")
  await clickWithHighlight(section.getByText("Dimensions", { exact: true }).first())
  await page.waitForTimeout(1500)
  await clickWithHighlight(section.getByText("Metrics", { exact: true }).first())
  await page.waitForTimeout(2000)
  await clickWithHighlight(ws.getByRole("radio", { name: "Diagram" }))
  await page.waitForTimeout(3500)
  await clickWithHighlight(ws.getByRole("radio", { name: "YAML" }))
  await page.waitForTimeout(2500)
  await clickWithHighlight(ws.getByRole("radio", { name: "Visual" }))
  await page.waitForTimeout(1500)
  for (const t of ["Suggestions", "Playground", "Monitoring", "Evaluations"]) await studioTab(page, ws, t)
})
