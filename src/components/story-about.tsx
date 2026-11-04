import { useEffect, useRef, useState } from "react";
import { BigButton, Page, hush, speak } from "@/components/bits";
import { micMessage } from "@/lib/use-recorder";

type Phase = "listen" | "thanks";

type RecResult = { isFinal: boolean; 0: { transcript: string } };

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<RecResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & {
    SpeechRecognition?: new () => Rec;
    webkitSpeechRecognition?: new () => Rec;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

function storyLine(said: string): string {
  const words = said.replace(/\s+/g, " ").trim().replace(/[.?!]+$/, "");
  if (/^this is a story about\b/i.test(words)) {
    return words.endsWith(".") ? words : `${words}.`;
  }
  return `This is a story about ${words}.`;
}

export function StoryAbout({
  onBack,
  onThanks,
}: {
  onBack: () => void;
  onThanks: (question: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("listen");
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const [line, setLine] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const canHear = recognitionCtor() !== null;
  const recRef = useRef<Rec | null>(null);
  const keepRef = useRef(false);
  const heardRef = useRef("");

  function stopHearing() {
    keepRef.current = false;
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  }

  useEffect(() => {
    return () => {
      keepRef.current = false;
      recRef.current?.abort();
      hush();
    };
  }, []);

  function begin() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    hush();
    setNote(null);
    heardRef.current = "";
    setLive("");
    stopHearing();
    const rec = new Ctor();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i]?.[0]?.transcript ?? "";
      }
      const cleaned = text.replace(/\s+/g, " ").trim();
      heardRef.current = cleaned;
      setLive(cleaned);
    };
    rec.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      keepRef.current = false;
      setListening(false);
      setNote(micMessage({ name: event.error === "not-allowed" ? "NotAllowedError" : event.error }));
    };
    rec.onend = () => {
      if (!keepRef.current) return;
      try {
        rec.start();
      } catch {
        keepRef.current = false;
        setListening(false);
      }
    };
    recRef.current = rec;
    keepRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      keepRef.current = false;
      setNote("This device could not hear you. Please check the microphone, then press the red Record button again.");
    }
  }

  function finishSpoken() {
    stopHearing();
    setListening(false);
    const said = heardRef.current.trim();
    if (!said) {
      setNote("I did not catch that. Please say what the story is about, then press I've finished.");
      return;
    }
    const next = storyLine(said);
    setLine(next);
    setPhase("thanks");
    speak(next);
  }

  function finishTyped() {
    const said = typed.trim();
    if (!said) return;
    const next = storyLine(said);
    setLine(next);
    setPhase("thanks");
    speak(next);
  }

  if (phase === "thanks") {
    return (
      <Page>
        <p className="text-center text-2xl font-bold">Tell me a story</p>
        <h2 className="mt-6 text-question font-bold">{line}</h2>
        <p className="mt-8 text-2xl font-bold">Now say thank you.</p>
        <div className="mt-6 flex flex-col gap-4">
          <BigButton
            tone="ink"
            onClick={() => {
              hush();
              onThanks(line);
            }}
          >
            I've said thank you
          </BigButton>
          <BigButton
            tone="quiet"
            onClick={() => {
              hush();
              setPhase("listen");
              setLive("");
              heardRef.current = "";
              setNote(null);
            }}
          >
            Say what it is about again
          </BigButton>
        </div>
      </Page>
    );
  }

  return (
    <Page
      footer={
        <div className="flex flex-col gap-4">
          {listening ? (
            <button
              type="button"
              onClick={finishSpoken}
              className="min-h-24 w-full rounded-2xl border-2 border-ink bg-ink px-5 py-5 text-3xl font-bold text-paper"
            >
              I've finished
            </button>
          ) : canHear ? (
            <button
              type="button"
              onClick={begin}
              className="relative mx-auto grid h-44 w-44 place-items-center rounded-full bg-red text-2xl font-bold text-paper"
            >
              <span className="pointer-events-none absolute inset-3 rounded-full border-4 border-paper" />
              Record
            </button>
          ) : (
            <BigButton tone="ink" disabled={typed.trim().length === 0} onClick={finishTyped}>
              This is a story about that
            </BigButton>
          )}
          {listening ? (
            <p className="text-center text-2xl">Press this when they have said what it is about.</p>
          ) : canHear ? (
            <p className="text-center text-2xl">Press once. You do not need to hold it down.</p>
          ) : null}
        </div>
      }
    >
      <BigButton
        tone="quiet"
        onClick={() => {
          stopHearing();
          hush();
          onBack();
        }}
      >
        Back to the start
      </BigButton>
      <p className="mt-6 text-center text-2xl font-bold">Tell me a story</p>
      <h2 className="mt-4 text-question font-bold">
        {canHear ? "Say what this story is about." : "What is this story about?"}
      </h2>
      {listening ? (
        <p className="mt-6 text-2xl font-bold">{live || "Listening…"}</p>
      ) : canHear ? (
        <p className="mt-6 text-2xl">
          Press the red button. They say the subject. Then press I've finished.
        </p>
      ) : (
        <label className="mt-6 block text-2xl" htmlFor="story-about">
          This browser cannot hear the words. Type what they said.
          <textarea
            id="story-about"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            rows={3}
            placeholder="the Christmas party"
            className="mt-3 w-full rounded-xl border-2 border-ink bg-paper px-4 py-3 text-2xl"
          />
        </label>
      )}
      {note ? (
        <p role="alert" className="mt-4 text-2xl">
          {note}
        </p>
      ) : null}
    </Page>
  );
}
