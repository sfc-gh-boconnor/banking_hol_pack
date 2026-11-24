// Reusable Snowsight steps for clip scripts. Each step highlights what it clicks, so it can
// go after mark() and appear in the clip, or before mark() as silent setup.
// Every quirk worked around here was found the hard way; see the notes on each step.
import { clickWithHighlight, highlight } from "./lib.mjs"

const pause = (page, ms) => page.waitForTimeout(ms)

// The Workspaces UI runs inside an iframe: everything in it is reached through this.
export const workspaceFrame = (page) => page.frameLocator('iframe[src*="workspaces"]')

const closeIfVisible = async (locator) => {
  if (await locator.isVisible().catch(() => false)) await locator.click()
}

// Home/CoCo is a radio toggle at the top left, not a pair of buttons.
export async function switchTo(page, mode /* "Home" | "CoCo" */) {
  const radio = page.getByRole("radio", { name: mode, exact: true })
  await radio.waitFor({ timeout: 60_000 })
  await clickWithHighlight(radio)
  if (mode === "CoCo") {
    await closeIfVisible(page.getByRole("button", { name: "Close", exact: true })) // "CoCo mode (preview)" pop-up
    await page.getByText(/how can I help\?/).first().waitFor({ timeout: 30_000 })
  }
}

// Home > Workspaces > pick a workspace. Snowsight reopens the last workspace, so this
// only uses the picker when needed. Pass { fresh: true } in setup to reset to My Workspace.
export async function openWorkspace(page, name = "banking-hol-pack", { fresh = false } = {}) {
  const ws = workspaceFrame(page)
  await clickWithHighlight(page.getByRole("link", { name: "Workspaces", exact: true }).first())
  await page.mouse.move(600, 300) // leave the left nav, or its flyout menu stays open
  const picker = ws.getByText(/^(My Workspace|banking-hol-pack)$/).first()
  await picker.waitFor({ timeout: 30_000 })
  // one-off notices that cover the file panel
  await closeIfVisible(ws.locator(":text('Go Beyond SQL with Notebooks')").locator("xpath=ancestor::*[.//button][1]").getByRole("button").first())
  await closeIfVisible(ws.locator(":text('legacy worksheets')").locator("xpath=ancestor::*[.//button][1]").getByRole("button").last())
  const target = fresh ? "My Workspace" : name
  if ((await picker.textContent()).trim() !== target) {
    await clickWithHighlight(picker)
    await pause(page, 400)
    await clickWithHighlight(ws.getByRole("option", { name: target }))
  }
  if (!fresh) await ws.getByText("vignettes", { exact: true }).first().waitFor({ timeout: 30_000 })
  return ws
}

// Close every open editor tab, so the clip doesn't show files from earlier recordings.
// Each tab's "Close <file>" button only appears on hover. Setup only, before mark().
export async function closeAllTabs(page) {
  const ws = workspaceFrame(page)
  const tabs = ws.locator('[data-action-name="EditorTab"][id^="EditorPane"]')
  for (let i = 0; i < 30 && (await tabs.count()) > 0; i++) {
    const tab = tabs.first()
    await tab.hover()
    // agent and dashboard tabs re-render on hover, so force the click and retry on the next pass
    await tab.locator("xpath=ancestor::*[@role='button'][1]").getByRole("button", { name: /^Close / })
      .click({ force: true, timeout: 5000 }).catch(() => {})
    await pause(page, 500)
  }
  if ((await tabs.count()) > 0) throw new Error("could not close all editor tabs")
}

// Collapse a folder in the file tree so the clip can show it being opened.
export async function closeFolder(page, folder, childPrefix) {
  const ws = workspaceFrame(page)
  const item = ws.getByRole("treeitem", { name: folder, exact: true })
  await item.waitFor({ timeout: 30_000 })
  const child = ws.getByRole("treeitem", { name: new RegExp(`^${childPrefix}`) })
  if (await child.isVisible().catch(() => false)) await item.click()
}

// Open a file: expand its folder if needed, then click the file.
export async function openFile(page, folder, filePrefix) {
  const ws = workspaceFrame(page)
  const file = ws.getByRole("treeitem", { name: new RegExp(`^${filePrefix}`) })
  if (!(await file.isVisible().catch(() => false)))
    await clickWithHighlight(ws.getByRole("treeitem", { name: folder, exact: true }))
  await clickWithHighlight(file)
}

// Open a starter notebook in notebooks/ and wait for its service controls.
export async function openNotebook(page, notebookName) {
  await openFile(page, "notebooks", notebookName)
  await workspaceFrame(page).getByRole("button", { name: "Service List dropdown button" }).waitFor({ timeout: 30_000 })
  await pause(page, 1500)
}

// Single-choice dropdown in a form, e.g. pickOption(page, form, "Compute pool", /^NOTEBOOK_POOL/).
// Fields are found by aria-label: the accessible name also includes the current value, and
// each field has a "<label> help" icon button whose name starts the same way.
export async function pickOption(page, form, label, option) {
  const field = form.locator(`button[aria-label="${label}"]`)
  await field.scrollIntoViewIfNeeded()
  await pause(page, 300)
  await clickWithHighlight(field)
  await clickWithHighlight(workspaceFrame(page).getByRole("option", { name: option }))
  await pause(page, 500)
}

// Multi-select dropdown (e.g. External access integrations). Each click toggles, and
// Escape, Tab or a click outside clears the choice, so: click the option at most once,
// close the list by force-clicking the field (an overlay covers it), then check it stuck.
export async function pickMulti(page, form, label, optionText) {
  const field = form.locator(`button[aria-label="${label}"]`)
  const option = workspaceFrame(page).getByRole("option", { name: new RegExp(`^${optionText}`) })
  const chosen = async () => (await field.textContent()).includes(optionText)
  await field.scrollIntoViewIfNeeded()
  await clickWithHighlight(field)
  await pause(page, 400) // the list animates open; earlier clicks are dropped
  if (!(await chosen()) && (await option.isVisible())) {
    await clickWithHighlight(option)
    await pause(page, 600)
  }
  if (await option.isVisible()) {
    await field.click({ force: true })
    await pause(page, 500)
  }
  if (!(await chosen())) throw new Error(`${label}: ${optionText} not selected`)
}

// The notebook's "Connect your notebook" form: service dropdown (next to the status dot)
// > Create new service > Service settings. Fills the lab's settings, highlights
// Create and connect, then cancels unless { create: true } (which starts the compute pool).
export async function createNotebookService(page, {
  pool = /^NOTEBOOK_POOL/,
  idle = /^1 hour$/,
  integration = "HOL_NOTEBOOK_ACCESS_INTEGRATION",
  create = false,
} = {}) {
  const ws = workspaceFrame(page)
  await clickWithHighlight(ws.getByRole("button", { name: "Service List dropdown button" }))
  await clickWithHighlight(ws.getByText("Create new service", { exact: true }))
  const form = ws.locator("[role=dialog]").filter({ hasText: "Connect your notebook" })
  await form.getByText("Service name", { exact: true }).waitFor({ timeout: 30_000 })
  await pause(page, 1000)

  await clickWithHighlight(form.getByText("Service settings", { exact: true }).first()) // collapsed by default
  await form.getByText("Compute pool", { exact: true }).first().scrollIntoViewIfNeeded()
  await pickOption(page, form, "Compute pool", pool)
  await pickOption(page, form, "Idle timeout", idle)
  await pickMulti(page, form, "External access integrations", integration)

  const go = form.getByRole("button", { name: "Create and connect" })
  if (create) return clickWithHighlight(go)
  await highlight(go, 1800)
  await form.getByRole("button", { name: "Cancel" }).click()
}

// Left nav > group > item, e.g. navTo(page, "Monitoring", "Spark"). Groups open a flyout on
// hover (not click); items without a flyout (Workspaces, Marketplace) pass item = undefined.
// Nav labels as of Nov 2026: AI > Agent Studio | Analyst | Snowflake CoWork; Machine learning >
// Models | Experiments; Monitoring > Spark; Catalog > Explorer; Transformation > Dynamic tables.
export async function navTo(page, group, item) {
  const link = page.getByRole("link", { name: group, exact: true }).first()
  await link.waitFor({ timeout: 60_000 })
  await highlight(link, 500)
  if (!item) {
    await link.click()
  } else {
    await link.hover()
    // flyout entries are links on Home but role=option inside Workspaces: match the visible text
    const entry = page.locator("a").filter({ hasText: new RegExp(`^\\s*${item}\\s*(PREVIEW)?\\s*$`) }).first()
    await entry.waitFor({ timeout: 10_000 })
    await clickWithHighlight(entry)
  }
  await page.mouse.move(700, 350) // leave the nav so its flyout closes
  await pause(page, 2500)
  // One-off "New updates" tour (first visit to Agent Studio): Skip it
  const skip = page.getByRole("button", { name: "Skip", exact: true })
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
    await pause(page, 800)
  }
}

// Pages such as Monitoring > Spark and Dynamic tables show nothing until a warehouse is picked
// ("No active warehouse selected"): top-right Select warehouse > BANKING_WH.
export async function selectWarehouse(page, warehouse = "BANKING_WH") {
  // "Select warehouse" button, or a warehouse chip already showing another name (e.g. a stale warehouse from an earlier run)
  const btn = page.getByRole("button", { name: "Select warehouse", exact: true })
    .or(page.getByRole("button", { name: /_WH$/ }).filter({ hasNotText: warehouse })).first()
  if (!(await btn.isVisible().catch(() => false))) return
  await clickWithHighlight(btn)
  await pause(page, 800)
  // some pages pick a default warehouse straight from the button (agent Observability): the list may not open
  const opt = page.getByText(warehouse, { exact: true }).locator("visible=true").last()
  if (await opt.isVisible().catch(() => false)) await clickWithHighlight(opt).catch(() => {})
  await pause(page, 3000)
}

// Name the file a "+ Add new" entry just created. The rename box selects only "Untitled",
// so type the base name (e.g. "corporate_payments_360"), not the extension.
export async function nameNewFile(page, baseName) {
  await pause(page, 800)
  await page.keyboard.type(baseName, { delay: 40 })
  await pause(page, 500)
  await page.keyboard.press("Enter")
  await pause(page, 2500)
}

// Delete top-level Workspace files whose names start with prefix (right-click > Delete > confirm).
// Setup/cleanup only: clips create the same files an attendee would, so remove them afterwards.
export async function deleteFiles(page, prefix) {
  const ws = workspaceFrame(page)
  // The file tree renders only rows in view: scroll it to the bottom, where top-level files are
  const tree = ws.getByRole("tree").first()
  for (let i = 0; i < 10; i++) {
    await tree.hover().catch(() => {})
    await page.mouse.wheel(0, 3000)
    await pause(page, 600)
    // tree items have no accessible name: match their text
    const item = ws.getByRole("treeitem").filter({ hasText: new RegExp(`^\\s*${prefix}`) }).first()
    if (!(await item.count())) return
    // the row can vanish mid-step (just deleted, or re-rendered): retry on the next pass
    if (!(await item.click({ button: "right", timeout: 5000 }).then(() => true).catch(() => false))) continue
    await pause(page, 500)
    await ws.getByText("Delete", { exact: true }).last().click({ timeout: 5000 }).catch(() => {})
    await pause(page, 600)
    // "Delete this file?" confirmation (dashboards, shared files): in the frame or the page
    await pause(page, 600)
    await ws.getByRole("button", { name: "Delete", exact: true }).last().click({ timeout: 3000 }).catch(() => {})
    await pause(page, 1200)
  }
}

// Workspace "+ Add new" menu > entry, e.g. "Agent", "Streamlit App", "Semantic view", "Dashboard".
// "Add new" is plain text (not a button), and its entries are list items, not menu items.
export async function workspaceAdd(page, entry) {
  const ws = workspaceFrame(page)
  await clickWithHighlight(ws.getByText("Add new", { exact: true }).first())
  await pause(page, 600)
  const item = ws.getByText(entry, { exact: true }).last()
  await item.waitFor({ timeout: 10_000 })
  await clickWithHighlight(item)
  await pause(page, 1500)
}

// Click a row in a Snowsight list page by its visible name (agents, models, jobs, dynamic tables...).
// List pages are role=row grids whose cells hold the name with other text (e.g. "Anonymous | payments_nightly").
export async function openListItem(page, text) {
  const esc = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  // cells run together with no spaces, so match the element whose own text is the name
  // (or ends with it, as in Spark's "Anonymous | payments_nightly"), inside a grid row
  await page.getByRole("row").nth(1).waitFor({ timeout: 30_000 }).catch(() => {}) // list loaded
  const cell = page.getByRole("row").getByText(new RegExp(`(^|\\| )${esc}$`)).first()
  const item = (await cell.count()) ? cell : page.getByText(text, { exact: true }).first()
  await item.waitFor({ timeout: 30_000 })
  await clickWithHighlight(item)
  await pause(page, 3000)
}

// Click a tab on an object page (Lineage, Graph, Trace, Logs, Monitoring...).
export async function openTab(page, name) {
  const tab = page.getByRole("tab", { name, exact: true }).or(page.getByRole("button", { name, exact: true })).first()
  await tab.waitFor({ timeout: 30_000 })
  await clickWithHighlight(tab)
  await pause(page, 2500)
}

// Fill (never send) a chat box: agent Preview, CoWork, Analyst. Some are textareas, some are
// contenteditable divs (no textbox role), so try both; insertText behaves like a paste.
export async function fillChat(page, text, frame = page) {
  // hidden chat boxes (the CoCo panel) are in the DOM too: take the last visible one
  const boxes = frame.locator("textarea:visible, input[type=text]:visible, [contenteditable=true]:visible")
  await boxes.first().waitFor({ timeout: 30_000 })
  const box = boxes.last()
  await clickWithHighlight(box)
  if (await box.evaluate((el) => el.isContentEditable && el.tagName !== "TEXTAREA")) await page.keyboard.insertText(text)
  else await box.fill(text)
  await pause(page, 2000)
}

// Cortex Code sidebar (round button, bottom right) > New chat > paste a prompt (not sent).
// { newChat: false } when the panel is already open on the right chat (e.g. after Create with CoCo).
export async function pasteIntoCocoSidebar(page, prompt, { newChat: startNew = true } = {}) {
  const panelBox = page.getByPlaceholder(/^(Ask, build|Add a follow up)/).or(page.getByRole("textbox", { name: /Ask, build|Add a follow up/ })).first()
  if (!(startNew === false && (await panelBox.isVisible().catch(() => false)))) {
    await clickWithHighlight(page.getByRole("button", { name: "Open or move CoCo" }))
    await pause(page, 1200)
  }
  const newChat = page.getByRole("button", { name: "New chat" }) // it reopens the last chat
  if (startNew && (await newChat.isVisible().catch(() => false))) {
    await clickWithHighlight(newChat)
    await pause(page, 800)
  }
  const box = page.getByPlaceholder(/^(Ask, build|Add a follow up)/).or(page.getByRole("textbox", { name: /Ask, build|Add a follow up/ })).first()
  await box.waitFor({ timeout: 30_000 })
  await closeIfVisible(page.getByRole("button", { name: "Close", exact: true })) // one-off tip
  await clickWithHighlight(box)
  await box.fill(prompt) // attendees paste, so it appears all at once
  await pause(page, 2000)
}
