/**
 * The executive demo's tour stops, as data. A use case's `demo` link must name one of these:
 * lib/use-cases.ts skips use cases read from the repo that link to a stop this app doesn't have.
 * Keep in step with the RETAIL and CORPORATE arrays in components/demo/tour.tsx.
 */
export const DEMO_STOPS = {
  retail: ["profit", "branches", "attrition", "models", "voice", "money", "case", "names", "data-request", "cases", "ask"],
  corporate: ["payments", "live", "clients", "whatif", "alerts", "feedback", "governed", "ai-audit", "ask", "avoid-fine", "do-nothing"],
} as const

export const isDemoStop = (tour: string, stop: string) =>
  (tour === "retail" || tour === "corporate") && (DEMO_STOPS[tour] as readonly string[]).includes(stop)
