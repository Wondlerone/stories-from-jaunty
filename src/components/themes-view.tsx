import { useEffect, useState } from "react";
import { BigButton, Page } from "@/components/bits";
import { UserButton } from "@/lib/auth/gates";
import { findThemesFn, getThemesFn } from "@/lib/stories.functions";

export function ThemesView({ onBack }: { onBack: () => void }) {
  const [body, setBody] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    let alive = true;
    void getThemesFn()
      .then((text) => {
        if (alive) setBody(text);
      })
      .catch(() => {
        if (alive) setNote("The earlier reading could not be opened.");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Page>
      <BigButton tone="quiet" onClick={onBack}>
        Back to the stories
      </BigButton>
      <h2 className="mt-6 font-display text-4xl leading-tight">What the stories share</h2>
      <p className="mt-4 text-2xl">
        This reads the words of the stories you have been sent, and sets down the
        themes they share. It does not listen to the phone again.
      </p>
      <div className="mt-6">
        <BigButton
          tone="ink"
          disabled={reading}
          onClick={() => {
            setReading(true);
            setNote(null);
            void findThemesFn()
              .then((result) => {
                if (result.ok) setBody(result.text);
                else setNote(result.error);
              })
              .catch(() => setNote("The stories could not be read just now."))
              .finally(() => setReading(false));
          }}
        >
          {reading ? "Reading the stories…" : body ? "Read them again" : "Read across the stories"}
        </BigButton>
      </div>
      {note ? (
        <p role="alert" className="mt-4 text-2xl">
          {note}
        </p>
      ) : null}
      {body ? <p className="mt-8 whitespace-pre-wrap text-2xl">{body}</p> : null}
      <div className="mt-10">
        <UserButton />
      </div>
    </Page>
  );
}
