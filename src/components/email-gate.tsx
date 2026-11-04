import { useState } from "react";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";

export function EmailGate() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const address = email.trim().toLowerCase();
    if (!address.includes("@") || !address.includes(".")) {
      setNote("Type the email address, with the @ sign.");
      return;
    }
    if (password.length < 8) {
      setNote("The password needs at least 8 letters.");
      return;
    }
    setBusy(true);
    setNote(null);
    const name = address.split("@")[0] || "Stories";
    let bearer: string | null = null;
    const fetchOptions = {
      onSuccess(ctx: { response: Response }) {
        bearer = ctx.response.headers.get("set-auth-token");
      },
    };
    const result =
      mode === "up"
        ? await authClient.signUp.email({
            email: address,
            password,
            name,
            callbackURL: "/",
            fetchOptions,
          })
        : await authClient.signIn.email({
            email: address,
            password,
            callbackURL: "/",
            fetchOptions,
          });
    if (result.error) {
      setBusy(false);
      const message = result.error.message ?? "";
      setNote(
        mode === "up" && /exist/i.test(message)
          ? "That email is already in use. Press Sign in."
          : mode === "in"
            ? "That email or password was not right. Please try again."
            : "The account could not be made. Please try again.",
      );
      return;
    }
    if (bearer) {
      try {
        sessionStorage.setItem("grok-auth.bearer-token", bearer);
      } catch {
        /* the cookie is enough once this page is on the phone */
      }
    }
    window.location.assign("/");
  }

  return (
    <>
      <h2 className="mt-8 text-question font-bold">
        {mode === "in" ? "Sign in with your email." : "Make an account."}
      </h2>
      <p className="mt-4 text-2xl">
        Use an email address and a password. Sign in once on this phone, then leave it signed in.
      </p>
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="text-2xl font-bold" htmlFor="story-email">
          Email address
          <input
            id="story-email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 min-h-16 w-full rounded-2xl border-2 border-brass bg-card px-4 py-3 text-2xl"
          />
        </label>
        <label className="text-2xl font-bold" htmlFor="story-password">
          Password
          <input
            id="story-password"
            type="password"
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 min-h-16 w-full rounded-2xl border-2 border-brass bg-card px-4 py-3 text-2xl"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="min-h-16 w-full rounded-2xl border-2 border-ink bg-ink px-5 py-4 text-2xl font-bold text-paper disabled:opacity-50"
        >
          {busy ? "One moment…" : mode === "in" ? "Sign in" : "Make the account"}
        </button>
      </form>
      {note ? (
        <p role="alert" className="mt-4 text-2xl">
          {note}
        </p>
      ) : null}
      <button
        type="button"
        className="mt-6 min-h-16 w-full rounded-2xl border-2 border-brass bg-card px-5 py-4 text-2xl font-bold"
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setNote(null);
        }}
      >
        {mode === "in" ? "First time? Make an account" : "I already have an account"}
      </button>
      <p className="mt-8 text-2xl">Or, if you already use one of these:</p>
      <div className="mt-4 flex flex-col gap-4">
        {GROK_PROVIDERS.map((provider) => (
          <button
            key={provider.providerId}
            type="button"
            onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
            className="min-h-16 w-full rounded-2xl border-2 border-brass bg-card px-5 py-4 text-2xl font-bold"
          >
            Continue with {provider.label}
          </button>
        ))}
      </div>
    </>
  );
}
