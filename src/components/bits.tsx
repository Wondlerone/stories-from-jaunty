import type { ReactNode } from "react";

type Tone = "ink" | "quiet" | "brass";

const tones: Record<Tone, string> = {
  ink: "bg-ink text-paper border-2 border-ink",
  quiet: "bg-card text-ink border-2 border-ink",
  brass: "bg-brass-soft text-ink border-2 border-brass",
};

export function BigButton({
  children,
  onClick,
  tone = "ink",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-16 w-full rounded-2xl px-5 py-4 text-center text-2xl font-bold disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export function Wordmark() {
  return (
    <header className="border-y-4 border-double border-ink py-6 text-center text-ink">
      <h1>
        <span className="block font-display text-2xl">Stories from</span>
        <span className="display-heavy mt-1 block font-display text-6xl leading-none md:text-7xl">
          Jaunty
        </span>
        <span className="mt-3 block text-balance font-display text-3xl leading-tight">
          and Other Notable Addresses
        </span>
      </h1>
    </header>
  );
}

export function Page({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-5 pt-4">
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">{children}</div>
      {footer ? <div className="dock -mx-5">{footer}</div> : null}
    </main>
  );
}

export function Sheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-xl rounded-2xl border-2 border-ink bg-card p-6 text-ink"
      >
        <h2 className="text-question font-bold">{title}</h2>
        <div className="mt-4 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

function britishVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((item) => item.lang === "en-GB") ??
    voices.find((item) => item.lang.startsWith("en")) ??
    null
  );
}

export function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const say = () => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 0.92;
    const voice = britishVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  };
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      say();
    };
    return;
  }
  say();
}

export function hush() {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}
