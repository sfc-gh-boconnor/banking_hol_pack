// Remove files that clip recordings create in the Workspace: node cleanup.mjs <prefix> [prefix...]
import { openBrowser, config } from "./lib.mjs"
import { openWorkspace, deleteFiles, workspaceFrame } from "./snowsight.mjs"

const ctx = await openBrowser({ headless: true, viewport: { width: 1024, height: 640 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto(config.snowsightUrl)
await openWorkspace(page)
try { for (const p of process.argv.slice(2)) await deleteFiles(page, p) } catch (e) { await page.screenshot({ path: "/tmp/cleanup_fail.png" }); console.log("FAIL", e.message.split("\n").slice(0,3).join(" ")) }
await page.mouse.wheel(0, 3000); await page.waitForTimeout(800)
const left = (await workspaceFrame(page).getByRole("treeitem").allInnerTexts()).map((s) => s.trim())
console.log("left:", left.filter((n) => process.argv.slice(2).some((p) => n.startsWith(p))))
await page.waitForTimeout(8000) // let the Workspace save the deletes before the browser closes
await page.screenshot({ path: "/tmp/cleanup_end.png" })
await ctx.close()
