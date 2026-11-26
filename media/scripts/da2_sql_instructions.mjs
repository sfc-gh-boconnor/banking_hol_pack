// DA2 "Write down the bank's rules": Custom instructions > SQL generation > edit > paste the rules
// from the README. Highlights the save tick, then closes with X so the file isn't changed.
import { semanticStudioRun, promptOf } from "../flows.mjs"
import { clickWithHighlight, highlight } from "../lib.mjs"

export const name = "da2_sql_instructions"
export const viewport = { width: 1280, height: 760 }
export const outputWidth = 800
export const crop = undefined
export const run = semanticStudioRun("SV_CLIENT_360", async (page, ws) => {
  const rules = promptOf("da2_semantic_view_analyst", "Write down the bank's rules")
  await ws.getByText("SQL generation", { exact: true }).first().hover()
  await clickWithHighlight(ws.getByRole("button", { name: "Edit SQL generation" }))
  await page.waitForTimeout(1200)
  const box = ws.getByRole("textbox").filter({ hasText: "" }).locator("visible=true").last()
  const editor = ws.locator("textarea:visible").last()
  const target = (await editor.isVisible().catch(() => false)) ? editor : box
  await clickWithHighlight(target)
  await target.fill(rules)
  await page.waitForTimeout(1500)
  // the edit box has an X (discard) and a tick (save) at its top right
  const panel = target.locator("xpath=ancestor::*[.//*[normalize-space()='SQL generation']][1]")
  const buttons = panel.getByRole("button")
  const n = await buttons.count()
  if (n >= 2) await highlight(buttons.nth(n - 1), 1800)
  if (n >= 2) await buttons.nth(n - 2).click()
  else await page.keyboard.press("Escape")
  await page.waitForTimeout(800)
})
