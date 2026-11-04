import { useCallback, useEffect, useRef, useState } from "react";
import { BigButton, Page, Wordmark, hush } from "@/components/bits";
import { SetupView } from "@/components/setup-view";
import { StoryAbout } from "@/components/story-about";
import { TellView, type PromptImage } from "@/components/tell-view";
import { ThemesView } from "@/components/themes-view";
import { VaultView } from "@/components/vault-view";
import { downloadBlob, memoryFilename } from "@/lib/format-memory";
import {
  addImage,
  deleteImage,
  deleteQuestion,
  getMemory,
  listQuestions,
  loadLibrary,
  nextQuestionId,
  restoreSeedQuestions,
  setSkipped,
  updateImageCaption,
  upsertQuestion,
  type MemoryMeta,
  type Question,
} from "@/lib/memory-store";

type Library = {
  questions: Question[];
  memories: MemoryMeta[];
  skippedIds: string[];
  images: Record<string, PromptImage>;
};

type Screen =
  | { name: "home" }
  | { name: "tell"; questionId: string }
  | { name: "pick" }
  | { name: "saved"; memoryId: string; becauseQuiet: boolean }
  | { name: "vault" }
  | { name: "themes" }
  | { name: "about" }
  | { name: "setup" }
  | { name: "done" };

const STEPS = [
  "You will see one question. Sometimes there is a photograph to help.",
  "Press the red Record button once, then talk. You do not hold it down.",
  "Press I've finished when you are done. The story is sent to be kept.",
  "If it goes quiet, you will be asked if you have finished. You can keep talking.",
  "You can pass on a question if you have nothing to say about it.",
];

function askableQuestions(questions: Question[]) {
  return questions.filter((question) => question.text.trim().length > 0);
}

async function preparePhoto(file: File): Promise<{ blob: Blob; mime: string } | null> {
  const name = file.name.toLowerCase();
  const looksImage =
    file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/.test(name);
  if (!looksImage) return null;
  const mime = file.type || "image/jpeg";
  if (file.size < 900_000 && mime.startsWith("image/") && !/heic|heif/.test(mime)) {
    return { blob: file, mime };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      const timer = window.setTimeout(() => reject(new Error("slow")), 4000);
      el.onload = () => {
        window.clearTimeout(timer);
        resolve(el);
      };
      el.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("decode"));
      };
      el.src = url;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    const scale = longest > 1600 ? 1600 / longest : 1;
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, mime };
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.82),
    );
    if (!blob) return { blob: file, mime };
    return { blob, mime: "image/jpeg" };
  } catch {
    return { blob: file, mime };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function MemoryApp() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [restoreNote, setRestoreNote] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);
  const libraryRef = useRef<Library | null>(null);
  libraryRef.current = library;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const library = await loadLibrary();
        if (!alive) return;
        const images: Record<string, PromptImage> = {};
        for (const image of library.images) {
          const url = URL.createObjectURL(image.blob);
          urlsRef.current.push(url);
          images[image.id] = { id: image.id, url, caption: image.caption };
        }
        setLibrary({
          questions: library.questions,
          memories: library.memories,
          skippedIds: library.skippedIds,
          images,
        });
      } catch {
        if (alive) {
          setProblem(
            "The stories could not be opened. Please sign in again.",
          );
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  const onText = useCallback((id: string, text: string) => {
    setLibrary((current) => {
      if (!current) return current;
      const questions = current.questions.map((question) =>
        question.id === id ? { ...question, text } : question,
      );
      const next = questions.find((question) => question.id === id);
      if (next) void upsertQuestion(next);
      return { ...current, questions };
    });
  }, []);

  function openQuestion(id: string) {
    const current = libraryRef.current;
    if (!current) return;
    hush();
    const skippedIds = current.skippedIds.filter((skipped) => skipped !== id);
    if (skippedIds.length !== current.skippedIds.length) {
      void setSkipped(skippedIds);
      const next = { ...current, skippedIds };
      libraryRef.current = next;
      setLibrary(next);
    }
    setScreen({ name: "tell", questionId: id });
  }

  function goHome() {
    hush();
    setScreen({ name: "home" });
  }

  if (problem) {
    return (
      <Page>
        <Wordmark />
        <p role="alert" className="mt-8 text-2xl">
          {problem}
        </p>
      </Page>
    );
  }

  if (!library || screen.name === "home") {
    const count = library?.memories.length ?? null;
    return (
      <Page>
        <Wordmark />
        <p className="mt-6 text-2xl">
          Press the red button, talk, then press I've finished. The story is sent to
          be kept. It is not kept on this phone.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          <BigButton
            tone="ink"
            disabled={!library}
            onClick={() => {
              if (!library) return;
              const open = nextQuestionId(
                askableQuestions(library.questions),
                new Set(library.memories.map((memory) => memory.questionId)),
                library.skippedIds,
                null,
              );
              setScreen(open ? { name: "tell", questionId: open } : { name: "done" });
            }}
          >
            {library ? "Show me a question" : "One moment"}
          </BigButton>
          <BigButton
            tone="quiet"
            disabled={!library}
            onClick={() => setScreen({ name: "about" })}
          >
            Tell me a story
          </BigButton>
        </div>
        <p className="mt-4 text-2xl">
          Tell me a story: they say what it is about. You say thank you. Then they
          answer that.
        </p>
        <h2 className="mt-8 text-2xl font-bold">How to tell a story</h2>
        <ol className="mt-4 flex flex-col gap-4">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-4 text-2xl">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-ink text-xl font-bold">
                {index + 1}
              </span>
              <span className="pt-2">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-8 border-t-2 border-line pt-6">
          <BigButton
            tone="brass"
            disabled={!library}
            onClick={() => setScreen({ name: "setup" })}
          >
            Arrange the questions
          </BigButton>
          <div className="mt-4">
            <BigButton
              tone="quiet"
              disabled={!library}
              onClick={() => setScreen({ name: "vault" })}
            >
              {count && count > 0 ? `Stories already told — ${count}` : "Stories already told"}
            </BigButton>
          </div>
        </div>
      </Page>
    );
  }

  const askable = askableQuestions(library.questions);
  const answered = new Set(library.memories.map((memory) => memory.questionId));

  if (screen.name === "tell") {
    const question = askable.find((item) => item.id === screen.questionId);
    if (!question) {
      return (
        <Page>
          <p className="text-2xl">That question is not here any more.</p>
          <div className="mt-4">
            <BigButton tone="ink" onClick={goHome}>
              Back to the start
            </BigButton>
          </div>
        </Page>
      );
    }
    const place = askable.findIndex((item) => item.id === question.id) + 1;
    const images = question.imageIds
      .map((id) => library.images[id])
      .filter((image): image is PromptImage => Boolean(image));
    return (
      <TellView
        key={question.id}
        question={question}
        place={place}
        total={askable.length}
        images={images}
        onBack={goHome}
        onChoose={() => setScreen({ name: "pick" })}
        onPass={() => {
          const skippedIds = library.skippedIds.includes(question.id)
            ? library.skippedIds
            : [...library.skippedIds, question.id];
          void setSkipped(skippedIds);
          const nextLibrary = { ...library, skippedIds };
          libraryRef.current = nextLibrary;
          setLibrary(nextLibrary);
          const next = nextQuestionId(askable, answered, skippedIds, question.id);
          setScreen(next ? { name: "tell", questionId: next } : { name: "done" });
        }}
        onSaved={(memoryId, becauseQuiet) => {
          void loadLibrary().then((fresh) => {
            setLibrary((current) => (current ? { ...current, memories: fresh.memories } : current));
            setScreen({ name: "saved", memoryId, becauseQuiet });
          });
        }}
      />
    );
  }

  if (screen.name === "pick") {
    return (
      <Page>
        <BigButton tone="quiet" onClick={goHome}>
          Back to the start
        </BigButton>
        <h2 className="mt-6 font-display text-4xl leading-tight">All the questions</h2>
        <p className="mt-4 text-2xl">Press one to talk about it.</p>
        <div className="mt-6 flex flex-col gap-4">
          {askable.map((question, index) => {
            const saved = library.memories.filter(
              (memory) => memory.questionId === question.id,
            ).length;
            const aside = library.skippedIds.includes(question.id) && saved === 0;
            return (
              <button
                key={question.id}
                type="button"
                onClick={() => openQuestion(question.id)}
                className="rounded-2xl border-2 border-ink bg-card px-4 py-4 text-left"
              >
                <span className="block text-xl font-bold">Question {index + 1}</span>
                <span className="mt-1 block text-2xl">{question.text}</span>
                {saved > 0 ? (
                  <span className="mt-2 block text-xl text-muted">
                    {saved === 1 ? "Already in the vault" : `${saved} memories in the vault`}
                  </span>
                ) : null}
                {aside ? (
                  <span className="mt-2 block text-xl text-muted">Set aside</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Page>
    );
  }

  if (screen.name === "saved") {
    const memory = library.memories.find((item) => item.id === screen.memoryId);
    const next = memory
      ? nextQuestionId(askable, answered, library.skippedIds, memory.questionId)
      : null;
    const aside = askable.filter(
      (question) => library.skippedIds.includes(question.id) && !answered.has(question.id),
    );
    return (
      <Page>
        <h2 className="font-display text-4xl leading-tight">Saved in the vault.</h2>
        {screen.becauseQuiet ? (
          <p className="mt-4 text-2xl">
            It had gone quiet, so this was saved for you. It is not lost.
          </p>
        ) : (
          <p className="mt-4 text-2xl">It has been sent. It is not kept on this phone.</p>
        )}
        <div className="mt-6 flex flex-col gap-4">
          {memory ? <SavedPlayer memoryId={memory.id} /> : (
            <p className="text-2xl">Looking for the recording…</p>
          )}
          {next ? (
            <BigButton tone="ink" onClick={() => openQuestion(next)}>
              Next question
            </BigButton>
          ) : aside.length > 0 ? (
            <BigButton tone="ink" onClick={() => openQuestion(aside[0]!.id)}>
              Try one I set aside
            </BigButton>
          ) : (
            <BigButton tone="ink" onClick={() => setScreen({ name: "done" })}>
              That's all the questions
            </BigButton>
          )}
          <BigButton tone="quiet" onClick={() => setScreen({ name: "vault" })}>
            Stories already told
          </BigButton>
          <BigButton tone="quiet" onClick={goHome}>
            That's enough for today
          </BigButton>
        </div>
        {memory ? (
          <p className="mt-6 text-2xl">{memory.questionText}</p>
        ) : null}
      </Page>
    );
  }

  if (screen.name === "done") {
    const aside = askable.filter(
      (question) => library.skippedIds.includes(question.id) && !answered.has(question.id),
    );
    return (
      <Page>
        <h2 className="font-display text-4xl leading-tight">
          {aside.length > 0 ? "A few questions were set aside." : "You've been through the questions."}
        </h2>
        <p className="mt-4 text-2xl">
          {aside.length > 0
            ? "You can try one of them, or leave them. Everything you did say is in the vault."
            : "Everything you said is in the vault."}
        </p>
        <div className="mt-6 flex flex-col gap-4">
          {aside.length > 0 ? (
            <BigButton tone="ink" onClick={() => openQuestion(aside[0]!.id)}>
              Try one I set aside
            </BigButton>
          ) : null}
          <BigButton tone="quiet" onClick={() => setScreen({ name: "pick" })}>
            Choose a question
          </BigButton>
          <BigButton tone="quiet" onClick={() => setScreen({ name: "vault" })}>
            Stories already told
          </BigButton>
          <BigButton tone="brass" onClick={goHome}>
            That's enough for today
          </BigButton>
        </div>
      </Page>
    );
  }

  if (screen.name === "themes") {
    return <ThemesView onBack={() => setScreen({ name: "vault" })} />;
  }

  if (screen.name === "about") {
    return (
      <StoryAbout
        onBack={goHome}
        onThanks={(text) => {
          void (async () => {
            const current = libraryRef.current;
            if (!current) return;
            const order =
              current.questions.reduce((max, question) => Math.max(max, question.order), 0) + 1;
            const question: Question = {
              id: crypto.randomUUID(),
              text,
              order,
              imageIds: [],
            };
            await upsertQuestion(question);
            const updated = { ...current, questions: [...current.questions, question] };
            libraryRef.current = updated;
            setLibrary(updated);
            setScreen({ name: "tell", questionId: question.id });
          })();
        }}
      />
    );
  }

  if (screen.name === "vault") {
    return (
      <VaultView
        memories={library.memories}
        onBack={goHome}
        onThemes={() => setScreen({ name: "themes" })}
        onRemoved={(id) => {
          setLibrary((current) =>
            current
              ? { ...current, memories: current.memories.filter((memory) => memory.id !== id) }
              : current,
          );
        }}
      />
    );
  }

  return (
    <SetupView
      questions={library.questions}
      images={library.images}
      restoreNote={restoreNote}
      onBack={goHome}
      onText={onText}
      onAddFiles={async (id, files) => {
        const current = libraryRef.current;
        if (!current) throw new Error("not ready");
        const question = current.questions.find((item) => item.id === id);
        if (!question) throw new Error("missing question");
        const imageIds = [...question.imageIds];
        const images = { ...current.images };
        let added = 0;
        for (const file of files) {
          const prepared = await preparePhoto(file);
          if (!prepared) continue;
          const stored = await addImage(prepared.blob, prepared.mime);
          const url = URL.createObjectURL(stored.blob);
          urlsRef.current.push(url);
          imageIds.push(stored.id);
          images[stored.id] = { id: stored.id, url, caption: "" };
          added += 1;
        }
        if (added === 0) throw new Error("no photograph");
        const next = { ...question, imageIds };
        await upsertQuestion(next);
        const questions = current.questions.map((item) => (item.id === id ? next : item));
        const updated = { ...current, questions, images };
        libraryRef.current = updated;
        setLibrary(updated);
      }}
      onCaption={(imageId, caption) => {
        void updateImageCaption(imageId, caption);
        setLibrary((current) => {
          if (!current?.images[imageId]) return current;
          return {
            ...current,
            images: {
              ...current.images,
              [imageId]: { ...current.images[imageId], caption },
            },
          };
        });
      }}
      onRemoveImage={(questionId, imageId) => {
        void (async () => {
          const current = libraryRef.current;
          if (!current) return;
          const question = current.questions.find((item) => item.id === questionId);
          if (!question) return;
          const next = {
            ...question,
            imageIds: question.imageIds.filter((item) => item !== imageId),
          };
          await upsertQuestion(next);
          await deleteImage(imageId);
          const preview = current.images[imageId];
          if (preview) URL.revokeObjectURL(preview.url);
          const images = { ...current.images };
          delete images[imageId];
          const updated = {
            ...current,
            images,
            questions: current.questions.map((item) => (item.id === questionId ? next : item)),
          };
          libraryRef.current = updated;
          setLibrary(updated);
        })();
      }}
      onMoveImage={(questionId, imageId, direction) => {
        void (async () => {
          const current = libraryRef.current;
          if (!current) return;
          const question = current.questions.find((item) => item.id === questionId);
          if (!question) return;
          const index = question.imageIds.indexOf(imageId);
          const swap = index + direction;
          if (index < 0 || swap < 0 || swap >= question.imageIds.length) return;
          const imageIds = [...question.imageIds];
          const moved = imageIds[index];
          const other = imageIds[swap];
          if (!moved || !other) return;
          imageIds[index] = other;
          imageIds[swap] = moved;
          const next = { ...question, imageIds };
          await upsertQuestion(next);
          const updated = {
            ...current,
            questions: current.questions.map((item) => (item.id === questionId ? next : item)),
          };
          libraryRef.current = updated;
          setLibrary(updated);
        })();
      }}
      onMoveQuestion={(id, toIndex) => {
        void (async () => {
          const current = libraryRef.current;
          if (!current) return;
          const index = current.questions.findIndex((item) => item.id === id);
          if (index < 0 || toIndex < 0 || toIndex >= current.questions.length || toIndex === index) {
            return;
          }
          const reordered = [...current.questions];
          const removed = reordered.splice(index, 1)[0];
          if (!removed) return;
          reordered.splice(toIndex, 0, removed);
          const questions = reordered.map((question, order) => ({
            ...question,
            order: order + 1,
          }));
          for (const question of questions) await upsertQuestion(question);
          const updated = { ...current, questions };
          libraryRef.current = updated;
          setLibrary(updated);
        })();
      }}
      onDeleteQuestion={(id) => {
        void (async () => {
          const current = libraryRef.current;
          if (!current) return;
          const question = current.questions.find((item) => item.id === id);
          await deleteQuestion(id);
          const images = { ...current.images };
          for (const imageId of question?.imageIds ?? []) {
            const preview = images[imageId];
            if (preview) URL.revokeObjectURL(preview.url);
            delete images[imageId];
          }
          const skippedIds = current.skippedIds.filter((skipped) => skipped !== id);
          await setSkipped(skippedIds);
          const updated = {
            ...current,
            images,
            skippedIds,
            questions: current.questions.filter((item) => item.id !== id),
          };
          libraryRef.current = updated;
          setLibrary(updated);
        })();
      }}
      onAddQuestionText={(text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        void (async () => {
          const current = libraryRef.current;
          if (!current) return;
          const order =
            current.questions.reduce((max, question) => Math.max(max, question.order), 0) + 1;
          const question: Question = {
            id: crypto.randomUUID(),
            text: trimmed,
            order,
            imageIds: [],
          };
          await upsertQuestion(question);
          const updated = { ...current, questions: [...current.questions, question] };
          libraryRef.current = updated;
          setLibrary(updated);
        })();
      }}
      onRestore={() => {
        void (async () => {
          const added = await restoreSeedQuestions();
          const questions = await listQuestions();
          setLibrary((current) => (current ? { ...current, questions } : current));
          setRestoreNote(
            added === 0
              ? "The original questions are already here."
              : added === 1
                ? "Put 1 question back."
                : `Put ${added} questions back.`,
          );
        })();
      }}
    />
  );
}

function SavedPlayer({ memoryId }: { memoryId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [missing, setMissing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<{ blob: Blob; mime: string; createdAt: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let url = "";
    void getMemory(memoryId).then((memory) => {
      if (!alive) return;
      if (!memory) {
        setMissing(true);
        return;
      }
      url = URL.createObjectURL(memory.blob);
      fileRef.current = {
        blob: memory.blob,
        mime: memory.mime,
        createdAt: memory.createdAt,
      };
      setSrc(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [memoryId]);

  if (missing) return <p className="mt-4 text-2xl">The recording could not be opened.</p>;
  if (!src) return <p className="mt-4 text-2xl">Getting the recording ready…</p>;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <audio
        ref={audioRef}
        src={src}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <BigButton
        tone="ink"
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) void audio.play();
          else audio.pause();
        }}
      >
        {playing ? "Pause" : "Play it back"}
      </BigButton>
      <BigButton
        tone="quiet"
        onClick={() => {
          const file = fileRef.current;
          if (!file) return;
          downloadBlob(file.blob, memoryFilename(file.createdAt, file.mime));
        }}
      >
        Save a copy
      </BigButton>
    </div>
  );
}
