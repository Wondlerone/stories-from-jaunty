import { createFileRoute } from "@tanstack/react-router";
import { Page, Wordmark } from "@/components/bits";
import { EmailGate } from "@/components/email-gate";
import { authEnabled } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <Page>
      <Wordmark />
      {authEnabled ? <EmailGate /> : <p className="mt-6 text-2xl">Sign-in is not switched on.</p>}
    </Page>
  );
}
