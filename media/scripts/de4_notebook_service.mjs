// DE4 step 1: open de4_spark_on_snowflake and its notebook service form (see ../notebook_service.mjs).
import { notebookServiceRun } from "../notebook_service.mjs"

export const name = "de4_notebook_service"
export const viewport = { width: 1024, height: 640 }
export const outputWidth = 720
export const crop = undefined
export const run = notebookServiceRun("de4_spark_on_snowflake")
