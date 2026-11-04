import { useEffect, useRef, useState } from "react";
import { BigButton, hush, Page, Sheet, speak } from "@/components/bits";
import { formatClock } from "@/lib/format-memory";
import { saveMemory, type Question } from "@/lib/memory-store";
import { useRecorder, type Take } from "@/lib/use-recorder";

export type PromptImage = { id: string; url: string; caption: string };

const BAR_GATES = [0.12, 0.28, 0.45, 0.62, 0.8];
const BAR_HEIGHTS = ["h-3", "h-5", "h-8", "h-10", "h-12"];

function takeIsEmpty(take: Take) {
  return !take.heard && take.blob.size < 1200;
}

export function TellView({
  question,
  place,
  total,
  images,
  onBack,
  onPass,
  onChoose,
  onSaved,
}: {
  question: Question;
  place: number;
  total: number;
  images: PromptImage[];
  onBack: () => void;
  onPass: () => void;
  onChoose: () => void;
  onSaved: (memoryId: string, becauseQuiet: boolean) => void;
}) {
  const [picture, setPicture] = useState(0);
  const [held, setHeld] = useState<Take | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [intent, setIntent] = useState<"back" | "pass" | "choose" | null>(null);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const savedOnce = useRef(false);
  const persistRef = useRef<(take: Take, becauseQuiet: boolean) => Promise<void>>(
    async () => {},
  );

  const recorder = useRecorder((take) => {
    void persistRef.current(take, true);
  });

  const dirty = recorder.phase !== "idle" || held !== null || saving;

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  async function persist(take: Take, becauseQuiet: boolean) {
    if (takeIsEmpty(take)) {
      setEmpty(true);
      setHeld(null);
      return;
    }
    if (savedOnce.current) return;
    savedOnce.current = true;
    setSaving(true);
    setSaveError(null);
    setHeld(take);
    setEmpty(false);
    try {
      const id = crypto.randomUUID();
      await saveMemory({
        id,
        questionId: question.id,
        questionText: question.text,
        createdAt: Date.now(),
        durationMs: take.durationMs,
        mime: take.mime,
        blob: take.blob,
      });
      setHeld(null);
      onSaved(id, becauseQuiet);
    } catch {
      savedOnce.current = false;
      setSaving(false);
      setSaveError(
        "This was not sent. Please stay on this page and press I've finished again. It is not kept on this phone.",
      );
    }
  }

  persistRef.current = persist;

  function run(next: "back" | "pass" | "choose") {
    hush();
    if (next === "back") onBack();
    if (next === "pass") onPass();
    if (next === "choose") onChoose();
  }

  function request(next: "back" | "pass" | "choose") {
    if (dirty) {
      setConfirmDrop(false);
      setIntent(next);
      return;
    }
    run(next);
  }

  async function onFinish() {
    hush();
    const take = held ?? (await recorder.finish());
    if (!take) return;
    await persist(take, false);
  }

  async function throwAway() {
    setIntent(null);
    setConfirmDrop(false);
    const going = intent;
    await recorder.discard();
    setHeld(null);
    savedOnce.current = false;
    if (going) run(going);
  }

  const current = images[picture];
  const recording = recorder.phase === "recording" || recorder.phase === "saving";

  return (
    <Page
      footer={
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {recorder.silencePrompt === "quiet" ? (
            <div className="rounded-2xl border-2 border-ink bg-card p-4">
              <p className="text-3xl font-bold">It's gone quiet.</p>
              <p className="mt-2 text-2xl">
                Have you finished? If you are still thinking, press I'm still talking,
                or just carry on. I've finished saves it.
              </p>
              <div className="mt-4">
                <BigButton tone="brass" onClick={recorder.stillTalking}>
                  I'm still talking
                </BigButton>
              </div>
            </div>
          ) : null}
          {recorder.silencePrompt === "nothing" ? (
            <div className="rounded-2xl border-2 border-ink bg-card p-4">
              <p className="text-3xl font-bold">I haven't heard anything yet.</p>
              <p className="mt-2 text-2xl">
                Just start talking. You do not need to press Record again.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                <BigButton tone="brass" onClick={recorder.stillTalking}>
                  I'm ready to talk
                </BigButton>
              </div>
            </div>
          ) : null}
          {recorder.error ? (
            <p role="alert" className="rounded-2xl border-2 border-ink bg-brass-soft p-4 text-2xl">
              {recorder.error}
            </p>
          ) : null}
          {saveError ? (
            <p role="alert" className="rounded-2xl border-2 border-ink bg-brass-soft p-4 text-2xl">
              {saveError}
            </p>
          ) : null}
          {empty ? (
            <p role="alert" className="rounded-2xl border-2 border-ink bg-brass-soft p-4 text-2xl">
              I didn't catch any words. Press Record and try again, or leave this question.
            </p>
          ) : null}
          {recording || held ? (
            <>
              <div className="flex items-center gap-4">
                <span className="relative grid h-14 w-14 shrink-0 place-items-center">
                  <span className="listen-ring absolute inset-0 rounded-full bg-red" />
                  <span className="h-8 w-8 rounded-full bg-red" />
                </span>
                <p className="text-2xl font-bold">
                  {recorder.phase === "saving" || saving
                    ? "Saving"
                    : recorder.level > 0.18
                      ? "I can hear you"
                      : "Recording"}
                </p>
                <p className="ml-auto text-3xl font-bold tabular-nums">
                  {formatClock(recorder.elapsedMs)}
                </p>
              </div>
              {recorder.silencePrompt ? null : (
                <div className="flex h-12 items-end justify-center gap-2" aria-hidden="true">
                  {BAR_GATES.map((gate, index) => (
                    <span
                      key={gate}
                      className={`w-3 rounded-sm ${recorder.level >= gate ? "bg-red" : "bg-line"} ${BAR_HEIGHTS[index]}`}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                disabled={saving || recorder.phase === "saving"}
                onClick={() => void onFinish()}
                className="min-h-24 w-full rounded-2xl border-2 border-ink bg-ink px-5 py-5 text-3xl font-bold text-paper disabled:opacity-50"
              >
                {saving || recorder.phase === "saving" ? "Saving…" : "I've finished"}
              </button>
              <p className="text-center text-xl">This sends the recording to be kept.</p>
              {recorder.silencePrompt === "nothing" ? (
                <BigButton
                  tone="quiet"
                  onClick={() => {
                    void (async () => {
                      await recorder.discard();
                      onPass();
                    })();
                  }}
                >
                  I'd rather not answer this one
                </BigButton>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  hush();
                  setEmpty(false);
                  recorder.clearError();
                  void recorder.start();
                }}
                className="relative mx-auto grid h-44 w-44 place-items-center rounded-full bg-red text-2xl font-bold text-paper"
              >
                <span className="pointer-events-none absolute inset-3 rounded-full border-4 border-paper" />
                Record
              </button>
              <p className="text-center text-2xl">
                Press once. You do not need to hold it down.
              </p>
              <BigButton tone="quiet" onClick={() => request("pass")}>
                I'd rather not answer this one
              </BigButton>
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <BigButton tone="quiet" onClick={() => request("back")}>
          Back to the start
        </BigButton>
        <p className="text-center text-2xl font-bold">Show me a question</p>
        <p className="text-center text-xl">
          Question {place} of {total}
        </p>
      </div>
      <h2 className="mt-4 text-question font-bold">{question.text}</h2>
      {current ? (
        <figure className="mx-auto mt-6 max-w-xl border border-line bg-card p-3">
          <img
            src={current.url}
            alt={current.caption || "A photograph to help with this question"}
            className="max-h-72 w-full bg-brass-soft object-contain"
          />
          {current.caption ? (
            <figcaption className="mt-3 text-center text-2xl">{current.caption}</figcaption>
          ) : null}
        </figure>
      ) : (
        <p className="mt-6 text-2xl">
          There is no photograph with this question. Just say what you remember.
        </p>
      )}
      {images.length > 1 ? (
        <div className="mt-4">
          <p className="text-center text-2xl font-bold">
            Picture {picture + 1} of {images.length}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <BigButton
              tone="quiet"
              disabled={picture === 0}
              onClick={() => setPicture((value) => Math.max(0, value - 1))}
            >
              Previous picture
            </BigButton>
            <BigButton
              tone="quiet"
              disabled={picture >= images.length - 1}
              onClick={() => setPicture((value) => Math.min(images.length - 1, value + 1))}
            >
              Next picture
            </BigButton>
          </div>
        </div>
      ) : null}
      {recording ? null : (
        <div className="mt-6 flex flex-col gap-3">
          <BigButton
            tone="brass"
            onClick={() => speak([question.text, current?.caption].filter(Boolean).join(". "))}
          >
            Read this question to me
          </BigButton>
          <BigButton tone="quiet" onClick={() => request("choose")}>
            Choose a different question
          </BigButton>
        </div>
      )}
      {intent && !confirmDrop ? (
        <Sheet title="This memory has not been saved.">
          <p className="text-2xl">
            Stay here if you are still talking. Or press I've finished and it will be
            sent to be kept.
          </p>
          <BigButton
            tone="ink"
            onClick={() => {
              setIntent(null);
            }}
          >
            Stay here
          </BigButton>
          <BigButton
            tone="quiet"
            onClick={() => {
              setIntent(null);
              void onFinish();
            }}
          >
            I've finished — save this
          </BigButton>
          <BigButton tone="brass" onClick={() => setConfirmDrop(true)}>
            Throw this recording away
          </BigButton>
        </Sheet>
      ) : null}
      {intent && confirmDrop ? (
        <Sheet title="Throw this recording away?">
          <p className="text-2xl">It cannot be got back.</p>
          <BigButton tone="ink" onClick={() => setConfirmDrop(false)}>
            Keep it
          </BigButton>
          <BigButton tone="quiet" onClick={() => void throwAway()}>
            Yes, throw it away
          </BigButton>
        </Sheet>
      ) : null}
    </Page>
  );
}
