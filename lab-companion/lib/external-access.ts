/**
 * Modules that use an external access integration. Trial accounts can't create them, so
 * provisioning skips them (setup/00_admin_provision.sql) and the module page says what's affected.
 * "blocked": the module can't be done without it. "partial": one part needs it; the rest works.
 */
export type ExternalAccessNeed = {
  level: "blocked" | "partial"
  integrations: string[]
  /** what doesn't work without it, for the attendee */
  message: string
  /** only a settings note (notebook service): shown on the module page, not as a badge in module lists */
  minor?: boolean
}

const NOTEBOOK_NOTE =
  "When you create the notebook service, leave **External access integrations** empty. The module works without it."

export const EXTERNAL_ACCESS: Record<string, ExternalAccessNeed> = {
  DE3: {
    level: "blocked",
    integrations: ["HOL_NOTEBOOK_ACCESS_INTEGRATION", "HOL_PG_SECRET_INTEGRATION"],
    message: "The notebook can't install the Postgres driver or reach Snowflake Postgres, so this module can't be done here. Skip it: no other module needs it.",
  },
  GOV3: {
    level: "blocked",
    integrations: ["HOL_NOTEBOOK_ACCESS_INTEGRATION"],
    message: "The notebook can't call the AI Gateway endpoint, so this module can't be done here. Skip it: no other module needs it.",
  },
  DA3: {
    level: "partial",
    integrations: ["PYPI_ACCESS_INTEGRATION"],
    message: "The map app can't install its packages, so skip the map app step. " + NOTEBOOK_NOTE,
  },
  APP1: {
    level: "partial",
    integrations: ["PYPI_ACCESS_INTEGRATION"],
    message: "The app can only use the packages Snowflake provides. If the deploy reports a missing package, it can't be added here.",
  },
  DA1: { level: "partial", integrations: ["HOL_NOTEBOOK_ACCESS_INTEGRATION"], message: NOTEBOOK_NOTE, minor: true },
  DS1: { level: "partial", integrations: ["HOL_NOTEBOOK_ACCESS_INTEGRATION"], message: NOTEBOOK_NOTE, minor: true },
  DS2: { level: "partial", integrations: ["HOL_NOTEBOOK_ACCESS_INTEGRATION"], message: NOTEBOOK_NOTE, minor: true },
  DS4: { level: "partial", integrations: ["HOL_NOTEBOOK_ACCESS_INTEGRATION"], message: NOTEBOOK_NOTE, minor: true },
}

/** The executive demo's map tiles come through this integration; without it the map has no background. */
export const BASEMAP_INTEGRATION = "BASEMAP_ACCESS_INTEGRATION"

export const ALL_INTEGRATIONS = [
  ...new Set([...Object.values(EXTERNAL_ACCESS).flatMap((n) => n.integrations), BASEMAP_INTEGRATION]),
]

/** What's missing for a module on this account: null when nothing is, or when the account's integrations aren't known. */
export function missingAccess(code: string, available: string[] | null | undefined) {
  const need = EXTERNAL_ACCESS[code]
  if (!need || !available) return null
  const missing = need.integrations.filter((n) => !available.includes(n))
  return missing.length ? { ...need, missing } : null
}
