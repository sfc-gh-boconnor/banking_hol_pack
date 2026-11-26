// DA2 "Deploy your changes": Deploy opens the target and diff dialog; highlight its confirm, then cancel.
import { semanticStudioRun } from "../flows.mjs"
import { clickWithHighlight, highlight } from "../lib.mjs"

export const name = "da2_deploy"
export const viewport = { width: 1280, height: 760 }
export const outputWidth = 800
export const crop = undefined
export const run = semanticStudioRun("SV_CLIENT_360", async (page, ws) => {
  await clickWithHighlight(ws.getByRole("button", { name: "Deploy", exact: true }))
  await page.waitForTimeout(3500)
  const dlg = ws.getByRole("dialog").last()
  await dlg.waitFor({ timeout: 20_000 })
  const confirm = dlg.getByRole("button", { name: /^Deploy/ }).last()
  if (await confirm.isVisible().catch(() => false)) await highlight(confirm, 2000)
  await dlg.getByRole("button", { name: /^(Cancel|Close)$/ }).first().click().catch(() => page.keyboard.press("Escape"))
  await page.waitForTimeout(800)
})
