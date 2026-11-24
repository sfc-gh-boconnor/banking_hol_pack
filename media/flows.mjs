// Parameterised clip flows shared by several modules. Each module's script calls one of these
// with its own object (agent, prompt, file name), so every module gets its own clip.
import { clickWithHighlight, highlight, ROOT } from "./lib.mjs"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  switchTo, openWorkspace, closeAllTabs, workspaceFrame, workspaceAdd, navTo, openListItem, openTab,
  fillChat, pasteIntoCocoSidebar, openNotebook, selectWarehouse, nameNewFile, deleteFiles,
} from "./snowsight.mjs"

const pause = (page, ms) => page.waitForTimeout(ms)

// The n-th ```prompt block under a step, read from the module README so clips paste the current text.
// promptOf("ops1_payments_360_agent", "Create the agent")
export function promptOf(moduleDir, stepPrefix, n = 0) {
  const file = path.join(ROOT, "..", moduleDir.startsWith("C") ? "core" : "vignettes", moduleDir.startsWith("C") ? `${moduleDir}_README.md` : moduleDir, ...(moduleDir.startsWith("C") ? [] : ["README.md"]))
  const text = readFileSync(file, "utf8")
  const start = text.indexOf(`### ${stepPrefix}`)
  if (start < 0) throw new Error(`${moduleDir}: no step "${stepPrefix}"`)
  const end = text.slice(start + 4).search(/\n##+ /)
  const body = end < 0 ? text.slice(start) : text.slice(start, start + 4 + end)
  const blocks = [...body.matchAll(/```prompt\n([\s\S]*?)```/g)].map((m) => m[1].trim())
  if (!blocks[n]) throw new Error(`${moduleDir} "${stepPrefix}": no prompt #${n}`)
  return blocks[n]
}

// Home/CoCo toggle > CoCo > New session > paste the module's first prompt (not sent).
export function cocoSessionRun(prompt) {
  return async ({ page, mark }) => {
    const home = page.getByRole("radio", { name: "Home", exact: true })
    await home.waitFor({ timeout: 60_000 })
    await home.click()
    await pause(page, 800)
    mark()
    await highlight(home, 500)
    await switchTo(page, "CoCo")
    // the CoCo side nav entries are links, not buttons
    await clickWithHighlight(page.getByText("New session", { exact: true }).first())
    await pause(page, 1000)
    const box = page.getByRole("textbox").first()
    await clickWithHighlight(box)
    await box.fill(prompt)
    await pause(page, 2000)
  }
}

// CoCo tab > the Automations entry in the CoCo side nav (below New session).
export function cocoAutomationsRun() {
  return async ({ page, mark }) => {
    const home = page.getByRole("radio", { name: "Home", exact: true })
    await home.waitFor({ timeout: 60_000 })
    await home.click()
    await pause(page, 800)
    mark()
    await switchTo(page, "CoCo")
    await clickWithHighlight(page.getByText("Automations", { exact: true }).first())
    await pause(page, 7000) // the list loads slowly
  }
}

// banking-hol-pack Workspace > + Add new > <entry> (Agent, Streamlit App, Semantic view, Dashboard),
// then optionally paste a prompt into the Cortex Code sidebar. Stops before anything is created
// beyond the empty file the menu makes, which the attendee would create too.
export function workspaceAddRun(entry, { workspace = "banking-hol-pack", prompt, after, sameChat = false } = {}) {
  return async ({ page, mark }) => {
    await switchTo(page, "Home")
    await openWorkspace(page, workspace, { fresh: workspace === "My Workspace" })
    await closeAllTabs(page)
    if (workspace !== "My Workspace") for (const f of CLIP_FILES) await deleteFiles(page, f)
    await workspaceFrame(page).getByRole("tree").first().hover().catch(() => {})
    await page.mouse.wheel(0, -5000)
    await pause(page, 1500)
    mark()
    await workspaceAdd(page, entry)
    if (after) await after(page)
    if (prompt) await pasteIntoCocoSidebar(page, prompt, { newChat: !sameChat })
    else await pause(page, 1500)
  }
}

// Left nav > group > item, then optionally pick a warehouse, walk the Catalog tree, open a list
// item, a tab, and fill a chat box (not sent).
export function navRun(group, item, { warehouse, before, tree, open, tab, chat, then } = {}) {
  return async ({ page, mark }) => {
    await switchTo(page, "Home")
    await pause(page, 1000)
    mark()
    await navTo(page, group, item)
    if (warehouse) await selectWarehouse(page)
    if (before) await before(page)
    if (tree) for (const t of tree) await openTreeItem(page, t)
    if (open) for (const o of [].concat(open)) await openListItem(page, o)
    if (tab) for (const t of [].concat(tab)) await openTab(page, t)
    if (chat) await fillChat(page, chat)
    if (then) await then(page)
    await pause(page, 1500)
  }
}

// Expand or open a node in the Catalog explorer tree. Labels carry counts ("ANALYTICS (23)",
// "Dynamic tables (3)"), so match the start of the text, case-insensitively.
export async function openTreeItem(page, name) {
  const item = page.getByRole("treeitem").filter({ hasText: new RegExp(`^\\s*${name}(\\s*\\(\\d+\\))?\\s*$`, "i") }).last()
  await item.waitFor({ timeout: 30_000 })
  await item.scrollIntoViewIfNeeded()
  await clickWithHighlight(item)
  await pause(page, 1500)
}

// banking-hol-pack Workspace > + Add new > Agent > name the file > Create with CoCo > paste the
// module's brief into the Cortex Code panel it opens (not sent). The agent file it creates is
// removed afterwards with `node cleanup.mjs <fileBase>`.
// Agent files earlier clips created. Create with CoCo starts a Cortex Code session that can
// re-save its file after cleanup.mjs deletes it, so every agent clip removes them all in setup.
const CLIP_FILES = ["corporate_payments_360", "payments_investigator", "payments_platform_copilot", "branch_network_advisor", "sv_client_360", "payments_ops"]

export function createAgentRun(fileBase, brief) {
  return async ({ page, mark }) => {
    await switchTo(page, "Home")
    await openWorkspace(page)
    await closeAllTabs(page)
    for (const f of CLIP_FILES) await deleteFiles(page, f)
    await workspaceFrame(page).getByRole("tree").first().hover().catch(() => {})
    await page.mouse.wheel(0, -5000) // back to the top of the file tree
    await pause(page, 1500)
    mark()
    await workspaceAdd(page, "Agent")
    await nameNewFile(page, fileBase)
    const ws = workspaceFrame(page)
    const coco = ws.getByText("Create with CoCo", { exact: true }).first()
    await coco.waitFor({ timeout: 30_000 })
    await clickWithHighlight(coco)
    await pause(page, 2500)
    await pasteIntoCocoSidebar(page, brief, { newChat: false })
  }
}

// Snowflake CoWork (ai.snowflake.com, its own sign-in: login_cowork.mjs). The nav link opens a
// new tab, which the recorder can't film, so the clip opens CoWork directly in the same page.
export const coworkUrl = (snowsightUrl) => snowsightUrl.replace("app.snowflake.com", "ai.snowflake.com").replace(/\/$/, "")

export function coworkRun(agentDisplayName, question, { deepResearch = false } = {}) {
  return async ({ page, mark }) => {
    const { config } = await import("./lib.mjs")
    await page.goto(coworkUrl(config.snowsightUrl))
    const box = page.getByRole("textbox").first()
    await box.waitFor({ timeout: 60_000 })
    await pause(page, 2000)
    // one-off "Schedule a task with Snowflake CoWork Automations" pop-up
    const later = page.getByRole("button", { name: "Try later", exact: true })
    if (await later.isVisible().catch(() => false)) await later.click()
    await pause(page, 1000)
    mark()
    // the agent picker is the button just after "+" (Add attachments or select sources), showing
    // the current agent's name; its list entries are plain text
    const plus = page.getByRole("button", { name: "Add attachments or select sources" })
    const picker = plus.locator("xpath=following::button[1]")
    if ((await picker.innerText()).trim() !== agentDisplayName) {
      await clickWithHighlight(picker)
      await pause(page, 800)
      await clickWithHighlight(page.getByText(agentDisplayName, { exact: true }).locator("visible=true").last())
      await pause(page, 1200)
    } else await highlight(picker, 1000)
    if (deepResearch) {
      await clickWithHighlight(plus)
      await pause(page, 600)
      await clickWithHighlight(page.getByRole("button", { name: "Deep Research", exact: true }))
      await pause(page, 1000)
      await page.keyboard.press("Escape") // the menu stays open over the chat box
      await pause(page, 600)
    }
    await clickWithHighlight(box)
    await box.fill(question)
    await pause(page, 2000)
  }
}

// After-steps for workspaceAddRun / navRun
export const nameAfter = (base) => (page) => nameNewFile(page, base)

// A new dashboard opens Cortex Code on a "/dashboard" chat with a Welcome tour: close the tour.
export const dashboardAfter = (base) => async (page) => {
  await nameNewFile(page, base)
  await pause(page, 4000)
  const ws = workspaceFrame(page)
  for (const fr of [ws, page]) {
    const tour = fr.locator(":text('Describe the dashboard you want')").locator("xpath=ancestor::*[.//button][1]").getByRole("button").first()
    if (await tour.isVisible().catch(() => false)) await tour.click().catch(() => {})
  }
  await pause(page, 800)
}

// The Create Streamlit form: title, query warehouse BANKING_WH; highlight Create, then Cancel.
export const streamlitForm = (title) => async (page) => {
  const ws = workspaceFrame(page)
  const form = ws.getByRole("dialog").filter({ hasText: "Create Streamlit" })
  await form.waitFor({ timeout: 30_000 })
  const t = form.getByRole("textbox").first()
  await clickWithHighlight(t)
  await t.fill(title)
  await pause(page, 600)
  const wh = form.getByText(/Select query warehouse|BANKING_WH/).first()
  await clickWithHighlight(wh)
  await pause(page, 600)
  await clickWithHighlight(ws.getByText("BANKING_WH", { exact: true }).last())
  await pause(page, 600)
  await highlight(form.getByRole("button", { name: "Create", exact: true }), 1500)
  await form.getByRole("button", { name: "Cancel", exact: true }).click()
  await pause(page, 800)
}

// Experiments: tick each run's row, then Compare.
export const compareRuns = async (page) => {
  await pause(page, 1500)
  const rows = page.getByRole("row")
  const n = await rows.count()
  for (let i = 1; i < n; i++) {
    const box = rows.nth(i).getByRole("checkbox")
    if (!(await box.count())) continue
    await highlight(rows.nth(i), 400).catch(() => {})
    await box.click({ force: true }) // the inputs are visually hidden
    await pause(page, 500)
  }
  // Compare's page shows "Error loading runs" on this account (Nov 2026): highlight it, don't open it
  const compare = page.getByRole("button", { name: /^Compare/ }).first()
  if (await compare.isVisible().catch(() => false)) await highlight(compare, 2000)
}

// Cortex Analyst lists semantic views per schema: open the database picker (it loads slowly),
// then BANKING_HOL and ANALYTICS in its two columns.
export const analystDatabase = async (page) => {
  await pause(page, 2000)
  // it remembers the last schema: nothing to pick if BANKING_HOL.ANALYTICS is already shown
  const current = page.getByText("BANKING_HOL.ANALYTICS", { exact: true }).first()
  if (await current.isVisible().catch(() => false)) {
    await highlight(current, 800)
    return
  }
  const picker = page.getByText(/^(No Database selected|BANKING_HOL)$/).last()
  await clickWithHighlight(picker)
  // the lists load slowly; BANKING_HOL is usually ticked already, so only its schema is picked
  const schema = page.getByText("ANALYTICS", { exact: true }).locator("visible=true").last()
  await schema.waitFor({ timeout: 45_000 })
  await clickWithHighlight(schema)
  await pause(page, 4000)
}

// Analyst > semantic view now opens an "Open semantic view in Workspaces" dialog (Nov 2026):
// highlight Open, then Cancel (Open would create a linked .sv.yaml in My Workspace).
export const analystOpenDialog = async (page) => {
  const dlg = page.getByRole("dialog").filter({ hasText: "Open semantic view in Workspaces" })
  await dlg.waitFor({ timeout: 30_000 })
  await pause(page, 800)
  await highlight(dlg.getByRole("button", { name: "Open", exact: true }), 1800)
  await dlg.getByRole("button", { name: "Cancel", exact: true }).click()
}

// Marketplace > Listings > "Search providers and listings" (the Discover box is an AI chat).
export const marketplaceSearch = (text) => async (page) => {
  await clickWithHighlight(page.getByText("Listings", { exact: true }).first())
  await pause(page, 3000)
  const box = page.getByPlaceholder("Search providers and listings")
  await box.waitFor({ timeout: 30_000 })
  await clickWithHighlight(box)
  await box.fill(text)
  await page.keyboard.press("Enter")
  await pause(page, 5000)
}

// AI > Agent Studio > agent > Preview tab (the chat), with a question filled in, not sent.
// Agent pages open on Overview under a one-off "Agent readiness" tour, which is closed first.
export const closeAgentTour = async (page) => {
  for (const name of ["Close", "Dismiss"]) {
    const x = page.getByRole("button", { name, exact: true }).first()
    if (await x.isVisible().catch(() => false)) await x.click().catch(() => {})
  }
  await pause(page, 600)
}

export function agentChatRun(agentDisplayName, question) {
  return navRun("AI", "Agent Studio", { open: agentDisplayName, then: async (page) => {
    await closeAgentTour(page)
    await openTab(page, "Preview")
    await fillChat(page, question)
  } })
}

export function agentTabRun(agentDisplayName, tab) {
  return navRun("AI", "Agent Studio", { open: agentDisplayName, then: async (page) => {
    await closeAgentTour(page)
    await openTab(page, tab)
    await selectWarehouse(page)
    await pause(page, 3000)
  } })
}

// APP1: My Workspace > fraud_investigator/streamlit_app.py, then one toolbar action. Run and
// Deploy are highlighted, not pressed (they start compute); Settings and Share dialogs are
// shown and closed without saving.
export function app1Run(action, { prompt } = {}) {
  return async ({ page, mark }) => {
    const ws = workspaceFrame(page)
    await switchTo(page, "Home")
    await openWorkspace(page, "My Workspace", { fresh: true })
    await closeAllTabs(page)
    await pause(page, 1000)
    mark()
    const file = ws.getByRole("treeitem").filter({ hasText: /^\s*streamlit_app\.py/ }).first()
    if (!(await file.isVisible().catch(() => false)))
      await clickWithHighlight(ws.getByRole("treeitem").filter({ hasText: /^\s*fraud_investigator/ }).first())
    await clickWithHighlight(file)
    await pause(page, 2500)
    // one-off "Go Beyond SQL with Notebooks" pop-up over the toolbar
    const tip = ws.locator(":text('Go Beyond SQL with Notebooks')").locator("xpath=ancestor::*[.//button][1]").getByRole("button").first()
    if (await tip.isVisible().catch(() => false)) await tip.click()
    await pause(page, 500)
    if (prompt) return pasteIntoCocoSidebar(page, prompt)
    const btn = ws.getByRole("button", { name: action, exact: true }).first()
    await btn.waitFor({ timeout: 30_000 })
    if (action === "Run" || action === "Deploy") return highlight(btn, 2500)
    await clickWithHighlight(btn)
    await pause(page, 2500)
    const dlg = ws.getByRole("dialog").last()
    if (action === "Settings") {
      const targets = dlg.getByRole("tab", { name: /Targets/ }).first()
      if (await targets.isVisible().catch(() => false)) await clickWithHighlight(targets)
      await pause(page, 2500)
    }
    if (action === "Share") {
      const role = dlg.getByRole("textbox").or(dlg.getByRole("combobox")).first()
      if (await role.isVisible().catch(() => false)) {
        await clickWithHighlight(role)
        await page.keyboard.type("HOL_RESTRICTED", { delay: 40 })
        await pause(page, 1500)
      }
    }
    await page.keyboard.press("Escape")
    await pause(page, 600)
  }
}

// OPS3: banking-hol-pack > payments_ops.dash (made by ops3_create_dashboard) > Share: add
// HOL_PARTICIPANT, highlight Create, then close without publishing.
export function dashboardShareRun(fileBase) {
  return async ({ page, mark }) => {
    const ws = workspaceFrame(page)
    await switchTo(page, "Home")
    await openWorkspace(page)
    await closeAllTabs(page)
    await ws.getByRole("tree").first().hover().catch(() => {})
    await page.mouse.wheel(0, 3000)
    await pause(page, 1000)
    mark()
    await clickWithHighlight(ws.getByRole("treeitem").filter({ hasText: new RegExp(`^\\s*${fileBase}`) }).first())
    await pause(page, 4000)
    // the tour from creating the dashboard can still be open
    const tour = ws.locator(":text('Describe the dashboard you want')").locator("xpath=ancestor::*[.//button][1]").getByRole("button").first()
    if (await tour.isVisible().catch(() => false)) await tour.click().catch(() => {})
    // the toolbar button is "Publish artifact" (Nov 2026; the lab text says Share)
    await clickWithHighlight(ws.getByRole("button", { name: /^(Publish artifact|Share)/ }).first())
    await pause(page, 2000)
    const dlg = ws.getByRole("dialog").last()
    const who = dlg.getByRole("textbox").or(dlg.getByRole("combobox")).first()
    if (await who.isVisible().catch(() => false)) {
      await clickWithHighlight(who)
      await page.keyboard.type("HOL_PARTICIPANT", { delay: 40 })
      await pause(page, 1500)
    }
    const create = dlg.getByRole("button", { name: /^(Create|Publish|Share)$/ }).first()
    if (await create.isVisible().catch(() => false)) await highlight(create, 1800)
    await page.keyboard.press("Escape")
    await pause(page, 600)
  }
}
