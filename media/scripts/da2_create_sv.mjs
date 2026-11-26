// DA2: + Add new > Semantic view > name it sv_client_360, then the brief in the Cortex Code sidebar.
import { workspaceAddRun, promptOf, nameAfter } from "../flows.mjs"

export const name = "da2_create_sv"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = workspaceAddRun("Semantic view", { after: nameAfter("sv_client_360"), prompt: promptOf("da2_semantic_view_analyst", "Write the bank's definitions once") })
