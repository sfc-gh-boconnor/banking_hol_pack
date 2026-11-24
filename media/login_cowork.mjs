// CoWork (ai.snowflake.com) has its own sign-in: run once after `npm run login`.
// Opens CoWork in the recorder profile and waits until it loads (up to 5 minutes).
import { openBrowser, config } from "./lib.mjs"

const url = config.snowsightUrl.replace("app.snowflake.com", "ai.snowflake.com").replace(/\/$/, "")
const ctx = await openBrowser({ headless: false })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto(url)
console.log("Sign in to CoWork in the browser window. Waiting up to 5 minutes...")
await page.waitForURL((u) => u.hostname === "ai.snowflake.com", { timeout: 300_000 })
await page.getByRole("textbox").first().waitFor({ timeout: 300_000 })
await page.waitForTimeout(3000)
console.log("Signed in to CoWork. Session saved in media/.auth/profile.")
await ctx.close()
