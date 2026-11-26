// DA2 "Ask it a question in the Playground": Playground tab > type the question (highlights Run, not pressed).
import { semanticStudioRun, studioTab } from "../flows.mjs"
import { clickWithHighlight, highlight } from "../lib.mjs"

const QUESTION = "Which clients have negative sentiment and a success rate below 96%?"

export const name = "da2_playground"
export const viewport = { width: 1280, height: 760 }
export const outputWidth = 800
export const crop = undefined
export const run = semanticStudioRun("SV_CLIENT_360", async (page, ws) => {
  await studioTab(page, ws, "Playground")
  const box = ws.getByPlaceholder("Enter prompt")
  await clickWithHighlight(box)
  await box.fill(QUESTION)
  await page.waitForTimeout(800)
  await highlight(ws.getByRole("button", { name: "Run" }).last(), 1800)
})
