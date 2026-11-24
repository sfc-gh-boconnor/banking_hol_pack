// DA3: + Add new > Streamlit App (the create form), then the map-app prompt in the Cortex Code sidebar.
import { workspaceAddRun, promptOf, streamlitForm } from "../flows.mjs"

export const name = "da3_create_streamlit"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = workspaceAddRun("Streamlit App", { after: streamlitForm("Branch network map"), prompt: promptOf("da3_branch_network_geo", "Build the branch network map app") })
