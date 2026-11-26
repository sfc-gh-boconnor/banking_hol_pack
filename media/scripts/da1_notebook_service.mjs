// DA1 step 1: open da1_feedback_analysis and create its notebook service (see ../notebook_service.mjs).
import { notebookServiceRun } from "../notebook_service.mjs"

export const name = "da1_notebook_service"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = notebookServiceRun("da1_feedback_analysis")
