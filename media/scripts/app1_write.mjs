// APP1: My Workspace > fraud_investigator > streamlit_app.py > Write.
import { app1Run, promptOf } from "../flows.mjs"

export const name = "app1_write"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = app1Run("Write", { prompt: promptOf("app1_fraud_investigator_app", "Write the app") })
