import { useEffect, useState } from "react";
import { BigButton, Page } from "@/components/bits";
import { UserButton } from "@/lib/auth/gates";
import type { Question } from "@/lib/memory-store";
import type { PromptImage } from "@/components/tell-view";

export function SetupView({
  questions,
  images,
  onBack,
  onText,
  onAddFiles,
  onCaption,
  onRemoveImage,
  onMoveImage,
  onMoveQuestion,
  onDeleteQuestion,
  onAddQuestionText,
  onRestore,
  restoreNote,
}: {
  questions: Question[];
  images: Record<string, PromptImage>;
  onBack: () => void;
  onText: (id: string, text: string) => void;
  onAddFiles: (id: string, files: File[]) => Promise<void>;
  onCaption: (imageId: string, caption: string) => void;
  onRemoveImage: (questionId: string, imageId: string) => void;
  onMoveImage: (questionId: string, imageId: string, direction: -1 | 1) => void;
  onMoveQuestion: (id: string, toIndex: number) => void;
  onDeleteQuestion: (id: string) => void;
  onAddQuestionText: (text: string) => void;
  onRestore: () => void;
  restoreNote: string | null;
}) {
  const [ordering, setOrdering] = useState(false);
  return (
    <Page>
      <BigButton tone="quiet" onClick={onBack}>
        Back to the start
      </BigButton>
      <h2 className="mt-6 font-display text-4xl leading-tight">Arrange the questions</h2>
      {ordering ? (
        <OrderList
          questions={questions}
          onMove={onMoveQuestion}
          onDone={() => setOrdering(false)}
        />
      ) : (
        <>
          <p className="mt-4 text-2xl">
            These are for the people who played the clubs. Write a question in plain words.
            Add a photograph if it will help. They see one question at a time.
          </p>
          <div className="mt-6">
            <BigButton tone="brass" onClick={() => setOrdering(true)}>
              Change the order
            </BigButton>
          </div>
          <PromptBox onAdd={onAddQuestionText} />
          <div className="mt-8 flex flex-col gap-8">
            {questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                question={question}
                index={index}
                images={images}
                onText={onText}
                onAddFiles={onAddFiles}
                onCaption={onCaption}
                onRemoveImage={onRemoveImage}
                onMoveImage={onMoveImage}
                onDeleteQuestion={onDeleteQuestion}
              />
            ))}
          </div>
          <div className="mt-10 flex flex-col gap-4 border-t-2 border-ink pt-6">
            <BigButton tone="brass" onClick={onRestore}>
              Put the original questions back
            </BigButton>
            {restoreNote ? <p className="text-2xl">{restoreNote}</p> : null}
            <BigButton tone="quiet" onClick={onBack}>
              Back to the start
            </BigButton>
            <div className="mt-6">
              <UserButton />
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

function OrderList({
  questions,
  onMove,
  onDone,
}: {
  questions: Question[];
  onMove: (id: string, toIndex: number) => void;
  onDone: () => void;
}) {
  return (
    <>
      <p className="mt-4 text-2xl">
        The question at the top is the one they hear first. Move a line, then press Done.
      </p>
      <div className="mt-6">
        <BigButton tone="ink" onClick={onDone}>
          Done
        </BigButton>
      </div>
      <ol className="mt-6 flex flex-col gap-4">
        {questions.map((question, index) => {
          const line = question.text.replace(/\s+/g, " ").trim();
          const short = line.length > 90 ? `${line.slice(0, 87)}…` : line;
          return (
            <li key={question.id} className="rounded-2xl border-2 border-brass bg-card p-4">
              <p className="text-2xl font-bold">
                {index + 1}. {short}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <BigButton tone="quiet" disabled={index === 0} onClick={() => onMove(question.id, 0)}>
                  To the top
                </BigButton>
                <BigButton
                  tone="quiet"
                  disabled={index === questions.length - 1}
                  onClick={() => onMove(question.id, questions.length - 1)}
                >
                  To the bottom
                </BigButton>
                <BigButton
                  tone="quiet"
                  disabled={index === 0}
                  onClick={() => onMove(question.id, index - 1)}
                >
                  Up
                </BigButton>
                <BigButton
                  tone="quiet"
                  disabled={index === questions.length - 1}
                  onClick={() => onMove(question.id, index + 1)}
                >
                  Down
                </BigButton>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-6">
        <BigButton tone="ink" onClick={onDone}>
          Done
        </BigButton>
      </div>
    </>
  );
}

function PromptBox({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="mt-6 rounded-2xl border-2 border-ink bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;
        onAdd(trimmed);
        setText("");
      }}
    >
      <label className="block text-2xl font-bold" htmlFor="new-question">
        Show me a question
      </label>
      <textarea
        id="new-question"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="I want the memory ball back."
        className="mt-3 w-full rounded-xl border-2 border-ink bg-paper px-4 py-3 text-2xl"
      />
      <div className="mt-4">
        <button
          type="submit"
          disabled={text.trim().length === 0}
          className="min-h-16 w-full rounded-2xl border-2 border-ink bg-ink px-5 py-4 text-2xl font-bold text-paper disabled:opacity-50"
        >
          Add this question
        </button>
      </div>
    </form>
  );
}

function QuestionCard({
  question,
  index,
  images,
  onText,
  onAddFiles,
  onCaption,
  onRemoveImage,
  onMoveImage,
  onDeleteQuestion,
}: {
  question: Question;
  index: number;
  images: Record<string, PromptImage>;
  onText: (id: string, text: string) => void;
  onAddFiles: (id: string, files: File[]) => Promise<void>;
  onCaption: (imageId: string, caption: string) => void;
  onRemoveImage: (questionId: string, imageId: string) => void;
  onMoveImage: (questionId: string, imageId: string, direction: -1 | 1) => void;
  onDeleteQuestion: (id: string) => void;
}) {
  const [text, setText] = useState(question.text);
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (text !== question.text) onText(question.id, text);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [text, question.id, question.text, onText]);

  return (
    <article className="rounded-2xl border-2 border-ink bg-card p-4">
      <p className="text-xl font-bold">Question {index + 1}</p>
      <label className="mt-3 block text-xl" htmlFor={`q-${question.id}`}>
        The words after “Show me a question”
        <textarea
          id={`q-${question.id}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder="I want the memory ball back."
          className="mt-2 w-full rounded-xl border-2 border-ink bg-paper px-4 py-3 text-2xl"
        />
      </label>
      <div className="mt-4 flex flex-col gap-4">
        {question.imageIds.map((imageId, imageIndex) => {
          const image = images[imageId];
          if (!image) return null;
          return (
            <div key={imageId} className="border border-line bg-paper p-3">
              <img
                src={image.url}
                alt={image.caption || "Photograph added to this question"}
                className="max-h-64 w-full object-contain"
              />
              <label className="mt-3 block text-xl" htmlFor={`cap-${imageId}`}>
                Words under this picture, if you want
                <input
                  id={`cap-${imageId}`}
                  defaultValue={image.caption}
                  onBlur={(event) => onCaption(imageId, event.target.value)}
                  placeholder="For example: the concert room"
                  className="mt-2 w-full rounded-xl border-2 border-ink bg-card px-4 py-3 text-2xl"
                />
              </label>
              {question.imageIds.length > 1 ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <BigButton
                    tone="quiet"
                    disabled={imageIndex === 0}
                    onClick={() => onMoveImage(question.id, imageId, -1)}
                  >
                    Show earlier
                  </BigButton>
                  <BigButton
                    tone="quiet"
                    disabled={imageIndex === question.imageIds.length - 1}
                    onClick={() => onMoveImage(question.id, imageId, 1)}
                  >
                    Show later
                  </BigButton>
                </div>
              ) : null}
              <div className="mt-3">
                <BigButton tone="quiet" onClick={() => onRemoveImage(question.id, imageId)}>
                  Remove this photograph
                </BigButton>
              </div>
            </div>
          );
        })}
      </div>
      <label className="relative mt-4 flex min-h-16 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-brass bg-brass-soft px-5 py-4 text-center text-2xl font-bold">
        <input
          type="file"
          accept="image/*"
          multiple
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => {
            const input = event.target;
            const picked = Array.from(input.files ?? []);
            if (picked.length === 0) return;
            setAdding(true);
            setPhotoNote(null);
            void (async () => {
              const copies: File[] = [];
              for (const file of picked) {
                const bytes = await file.arrayBuffer();
                copies.push(new File([bytes], file.name, { type: file.type }));
              }
              input.value = "";
              await onAddFiles(question.id, copies);
            })()
              .then(() => setAdding(false))
              .catch(() => {
                input.value = "";
                setAdding(false);
                setPhotoNote("That photograph could not be added. Please try again.");
              });
          }}
        />
        {adding ? "Adding the photograph…" : "Add a photograph"}
      </label>
      {photoNote ? (
        <p role="alert" className="mt-3 text-2xl">
          {photoNote}
        </p>
      ) : null}
      <div className="mt-4">
        {confirm ? (
          <div className="rounded-2xl border-2 border-ink p-4">
            <p className="text-2xl font-bold">Remove this question?</p>
            <p className="mt-2 text-2xl">
              The photographs on it will be removed too. Memories already in the vault
              will stay.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <BigButton tone="ink" onClick={() => setConfirm(false)}>
                Keep this question
              </BigButton>
              <BigButton tone="quiet" onClick={() => onDeleteQuestion(question.id)}>
                Yes, remove it
              </BigButton>
            </div>
          </div>
        ) : (
          <BigButton tone="quiet" onClick={() => setConfirm(true)}>
            Remove this question
          </BigButton>
        )}
      </div>
    </article>
  );
}
