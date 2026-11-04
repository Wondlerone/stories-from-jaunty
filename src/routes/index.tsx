import { createFileRoute } from "@tanstack/react-router";
import { Page, Wordmark } from "@/components/bits";
import { EmailGate } from "@/components/email-gate";
import { MemoryApp } from "@/components/memory-app";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending || !user) {
    return (
      <Page>
        <Wordmark />
        {isPending ? <p className="mt-8 text-2xl">One moment.</p> : <EmailGate />}
      </Page>
    );
  }
  return <MemoryApp />;
}
