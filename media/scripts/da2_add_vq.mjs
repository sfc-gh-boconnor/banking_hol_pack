// DA2 "Save the checked answer as a verified query": Verified queries > + > question >
// Generate SQL highlighted (not pressed), then the X discards it.
import { semanticStudioRun } from "../flows.mjs"
import { clickWithHighlight, highlight } from "../lib.mjs"

const QUESTION = "Which clients have negative sentiment and a success rate below 96%?"

export const name = "da2_add_vq"
export const viewport = { width: 1280, height: 760 }
export const outputWidth = 800
export const crop = undefined
export const run = semanticStudioRun("SV_CLIENT_360", async (page, ws) => {
  const add = ws.getByRole("button", { name: "Add Verified queries" })
  await add.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  await clickWithHighlight(add)
  await page.waitForTimeout(1200)
  const q = ws.getByPlaceholder(/Ask the way someone would/)
  await clickWithHighlight(q)
  await q.fill(QUESTION)
  await page.waitForTimeout(800)
  await highlight(ws.getByRole("button", { name: "Generate SQL" }), 1500)
  await highlight(ws.getByRole("button", { name: "Run", exact: true }).first(), 1000)
  // close the form without saving: the X next to the save tick in "Add verified query"
  const form = q.locator("xpath=ancestor::*[.//*[normalize-space()='Add verified query']][1]")
  await form.getByRole("button").first().click().catch(() => page.keyboard.press("Escape"))
  await page.waitForTimeout(800)
})
