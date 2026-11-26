// Shared clip for the DA3 notebook Map chart: open da3_branch_network, find one result cell,
// then (on camera) Chart > Chart type: Map > Geo type / columns > Color by > Full screen.
// The cells come from running the module's prompts in the test account (see README).
// Snowsight's result viewer ignores synthetic clicks, so every click here is a real mouse
// move + down + up (see click()).
import { highlight } from "./lib.mjs"
import { switchTo, openWorkspace, closeAllTabs, openNotebook, workspaceFrame } from "./snowsight.mjs"

const pause = (page, ms) => page.waitForTimeout(ms)

// Hover first, then press: the viewer's tabs and dropdowns only react to a real pointer.
async function click(page, locator, { ring = true } = {}) {
  await locator.scrollIntoViewIfNeeded().catch(() => {})
  if (ring) await highlight(locator, 600)
  const box = await locator.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await pause(page, 300)
  await page.mouse.down()
  await page.mouse.up()
  await pause(page, 900)
}

// Connect the notebook to its (already created) service if it opened disconnected.
async function ensureConnected(page, ws) {
  const connected = await ws.getByText("Connected").first().waitFor({ timeout: 15_000 }).then(() => true, () => false)
  if (!connected) {
    await click(page, ws.getByRole("button", { name: "Service List dropdown button" }), { ring: false })
    await click(page, ws.getByText("Connect kernel", { exact: true }), { ring: false })
  }
  await ws.getByText("Connected").first().waitFor({ timeout: 180_000 })
}

// The chart tab nearest above the cell's name chip (every result has one, only this cell's is wanted).
async function resultsTab(page, ws, chip, testId) {
  const cb = await chip.boundingBox()
  const tabs = ws.locator(`[data-popover-id=${testId}]`)
  let best, bestGap = Infinity
  for (let i = 0; i < (await tabs.count()); i++) {
    const b = await tabs.nth(i).boundingBox()
    if (b && b.y < cb.y && cb.y - b.y < bestGap) [best, bestGap] = [tabs.nth(i), cb.y - b.y]
  }
  if (!best) {
    const all = []
    for (let i = 0; i < (await tabs.count()); i++) all.push(await tabs.nth(i).boundingBox())
    throw new Error(`no result viewer above the cell chip; chip=${JSON.stringify(cb)} tabs=${JSON.stringify(all)}`)
  }
  return best
}

// A form row in the chart panel: the dropdown button that sits next to its label.
const field = (ws, label) => ws.getByText(label, { exact: true }).first().locator("xpath=ancestor::*[.//button][1]").getByRole("button").first()

// cell: the name chip under the cell (e.g. "catchments"). act({ page, ws, click, field, pick }) is the on-camera part.
export function mapRun({ notebook = "da3_branch_network", cell, act }) {
  return async function run({ page, mark }) {
    await switchTo(page, "Home")
    // Snowsight reopens notebooks in focus mode, which hides the Workspaces picker: click Focus to leave it
    await openWorkspace(page, "banking-hol-pack").catch(async () => {
      await click(page, workspaceFrame(page).getByText("Focus", { exact: true }), { ring: false })
      await openWorkspace(page, "banking-hol-pack")
    })
    await closeAllTabs(page)
    await openNotebook(page, notebook)
    const ws = workspaceFrame(page)
    await ensureConnected(page, ws)
    await click(page, ws.getByText("Focus", { exact: true }), { ring: false })
    await pause(page, 1500)

    if (process.env.DA3_MANUAL) {
      // the user drives: just bring the window up and record until /tmp/da3_done exists
      const { existsSync, rmSync } = await import("node:fs")
      rmSync("/tmp/da3_done", { force: true })
      rmSync("/tmp/da3_start", { force: true })
      await page.bringToFront()
      while (!existsSync("/tmp/da3_start")) await pause(page, 500) // user gets the cell ready off camera
      mark()
      while (!existsSync("/tmp/da3_done")) await pause(page, 1000)
      return
    }
    // results on screen, chart reset to the plain table
    await ws.getByRole("button", { name: "Run all cells" }).click()
    const chip = ws.getByText(cell, { exact: true }).last()
    await chip.waitFor({ timeout: 30_000 })
    await chip.scrollIntoViewIfNeeded()
    await ws.locator("[data-popover-id=results-viewer-chart-tab]").first().waitFor({ timeout: 120_000 })
    await pause(page, 8000)
    await page.mouse.wheel(0, 0)
    await chip.scrollIntoViewIfNeeded()
    const chartTab = await resultsTab(page, ws, chip, "results-viewer-chart-tab")
    await click(page, chartTab, { ring: false })
    if (await field(ws, "Chart type").isVisible().catch(() => false)) {
      await click(page, field(ws, "Chart type"), { ring: false })
      await click(page, ws.getByText("Bar chart", { exact: true }).last(), { ring: false })
    }
    const tableTab = ws.getByRole("button", { name: "Table", exact: true }).last()
    await click(page, tableTab, { ring: false })
    await chip.scrollIntoViewIfNeeded()
    await pause(page, 1000)

    mark()
    const chart = await resultsTab(page, ws, chip, "results-viewer-chart-tab")
    const pick = async (label, option) => {
      await click(page, field(ws, label))
      await click(page, ws.getByText(option, { exact: true }).last())
    }
    if (!process.env.DA3_MANUAL) await click(page, chart)
    await act({ page, ws, click: (l) => click(page, l), field: (l) => field(ws, l), pick })
  }
}
