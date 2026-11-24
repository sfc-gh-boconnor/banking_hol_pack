// OPS2: + Add new > Streamlit App (the create form), then the Alert Triage prompt in the Cortex Code sidebar.
import { workspaceAddRun, promptOf, streamlitForm } from "../flows.mjs"

export const name = "ops2_create_streamlit"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = workspaceAddRun("Streamlit App", { after: streamlitForm("Alert Triage"), prompt: promptOf("ops2_alert_triage", "Optional: hand it") })
