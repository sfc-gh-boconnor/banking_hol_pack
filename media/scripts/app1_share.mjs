// APP1: My Workspace > fraud_investigator > streamlit_app.py > Share.
import { app1Run } from "../flows.mjs"

export const name = "app1_share"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = app1Run("Share")
