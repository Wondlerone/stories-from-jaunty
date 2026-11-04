import { useEffect, useRef, useState } from "react";
import { BigButton, Page, Sheet } from "@/components/bits";
import { downloadBlob, formatLength, formatWhen, memoryFilename } from "@/lib/format-memory";
import { deleteMemory, getMemory, type MemoryMeta } from "@/lib/memory-store";

export function VaultView({
  memories,
  onBack,
  onThemes,
  onRemoved,
}: {
  memories: MemoryMeta[];
  onBack: () => void;
  onThemes: () => void;
  onRemoved: (id: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [file, setFile] = useState<{ blob: Blob; mime: string; createdAt: number } | null>(
    null,
  );
  const [playing, setPlaying] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  async function play(id: string) {
    const memory = await getMemory(id);
    if (!memory) {
      setMissing(true);
      return;
    }
    if (src) URL.revokeObjectURL(src);
    const url = URL.createObjectURL(memory.blob);
    setSrc(url);
    setFile({ blob: memory.blob, mime: memory.mime, createdAt: memory.createdAt });
    setActiveId(id);
    setPlaying(true);
    window.setTimeout(() => {
      void audioRef.current?.play();
    }, 0);
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  return (
    <Page>
      <BigButton tone="quiet" onClick={onBack}>
        Back to the start
      </BigButton>
      <h2 className="mt-6 font-display text-4xl leading-tight">Stories already told</h2>
      <p className="mt-4 text-2xl">
        These stories are kept together, not on this phone. Save a copy if you want
        a file of your own.
      </p>
      <div className="mt-6">
        <BigButton tone="brass" onClick={onThemes}>
          Read across the stories
        </BigButton>
      </div>
      {memories.length === 0 ? (
        <p className="mt-8 text-2xl">
          Nothing is saved yet. When a memory is told, it will wait here.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          {memories.map((memory) => (
            <article key={memory.id} className="rounded-2xl border-2 border-ink bg-card p-4">
              <p className="text-xl font-bold">{formatWhen(memory.createdAt)}</p>
              <h3 className="mt-2 text-2xl font-bold">{memory.questionText}</h3>
              <p className="mt-2 text-xl text-muted">
                About {formatLength(memory.durationMs)}
              </p>
              {activeId === memory.id && src ? (
                <div className="mt-4 flex flex-col gap-3">
                  <audio
                    ref={audioRef}
                    src={src}
                    onEnded={() => setPlaying(false)}
                    onPause={() => setPlaying(false)}
                    onPlay={() => setPlaying(true)}
                  />
                  <BigButton tone="ink" onClick={toggle}>
                    {playing ? "Pause" : "Play"}
                  </BigButton>
                  <BigButton
                    tone="quiet"
                    onClick={() => {
                      const audio = audioRef.current;
                      if (!audio) return;
                      audio.currentTime = 0;
                      void audio.play();
                      setPlaying(true);
                    }}
                  >
                    Play it from the start
                  </BigButton>
                </div>
              ) : (
                <div className="mt-4">
                  <BigButton tone="ink" onClick={() => void play(memory.id)}>
                    Play this memory
                  </BigButton>
                </div>
              )}
              <div className="mt-3">
                <BigButton
                  tone="quiet"
                  onClick={() => {
                    void (async () => {
                      const ready =
                        activeId === memory.id && file
                          ? file
                          : await getMemory(memory.id).then((row) =>
                              row
                                ? { blob: row.blob, mime: row.mime, createdAt: row.createdAt }
                                : null,
                            );
                      if (!ready) {
                        setMissing(true);
                        return;
                      }
                      downloadBlob(ready.blob, memoryFilename(ready.createdAt, ready.mime));
                    })();
                  }}
                >
                  Save a copy
                </BigButton>
              </div>
              <div className="mt-3">
                <BigButton tone="brass" onClick={() => setConfirmId(memory.id)}>
                  Remove from the vault
                </BigButton>
              </div>
            </article>
          ))}
        </div>
      )}
      {confirmId ? (
        <Sheet title="Remove this memory from the vault?">
          <p className="text-2xl">You cannot get it back.</p>
          <BigButton tone="ink" onClick={() => setConfirmId(null)}>
            Keep it
          </BigButton>
          <BigButton
            tone="quiet"
            onClick={() => {
              const id = confirmId;
              setConfirmId(null);
              if (activeId === id) {
                audioRef.current?.pause();
                setActiveId(null);
                setPlaying(false);
              }
              void deleteMemory(id).then(() => onRemoved(id));
            }}
          >
            Yes, remove it
          </BigButton>
        </Sheet>
      ) : null}
      {missing ? (
        <Sheet title="That recording could not be opened.">
          <BigButton tone="ink" onClick={() => setMissing(false)}>
            All right
          </BigButton>
        </Sheet>
      ) : null}
    </Page>
  );
}
