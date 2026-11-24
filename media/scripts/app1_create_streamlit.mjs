// APP1 step 1: My Workspace > + Add new > Streamlit App, titled fraud_investigator (the form is cancelled).
import { workspaceAddRun, streamlitForm } from "../flows.mjs"

export const name = "app1_create_streamlit"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = workspaceAddRun("Streamlit App", { workspace: "My Workspace", after: streamlitForm("fraud_investigator") })
