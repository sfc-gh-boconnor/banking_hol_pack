import { PageHeader } from "@/components/page-header"
import { Tour } from "@/components/demo/tour"

export const dynamic = "force-dynamic"

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ tour?: string; stop?: string }> }) {
  const { tour, stop } = await searchParams
  return (
    <main className="mx-auto w-full max-w-[1920px] space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <PageHeader
        eyebrow="Executive demo"
        title="Banking on one governed data platform"
        description="A click-through tour of what the lab builds, ready made: profitability and branch catchments on a map, customers about to leave, fraud rings, fuzzy name matching, case search and an assistant you can ask anything."
      />
      <Tour initialTour={tour} initialStop={stop} />
    </main>
  )
}
