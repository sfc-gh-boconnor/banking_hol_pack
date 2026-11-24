import { PageHeader } from "@/components/page-header"
import { RegulationMap } from "@/components/demo/regulation"

export const dynamic = "force-dynamic"

export default function DemoRegulationsPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <PageHeader
        eyebrow="Executive demo"
        title="Avoiding the fine: regulation to control to evidence"
        description="Seven UK regulations a payments bank answers to. For each: what the regulator expects, the Snowflake control that meets it, live evidence from the demo data, where to see it in the tour, and the lab module that builds it."
      />
      <RegulationMap />
    </main>
  )
}
