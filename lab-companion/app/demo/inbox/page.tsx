import { PageHeader } from "@/components/page-header"
import { DemoInbox } from "@/components/demo/inbox"

export const dynamic = "force-dynamic"

export default function DemoInboxPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <PageHeader
        eyebrow="Executive demo"
        title="The relationship manager's inbox"
        description="Emails a Snowflake Alert writes when a client's payment is at risk. A demo mailbox: every name and address is invented and nothing is ever sent."
      />
      <DemoInbox />
    </main>
  )
}
