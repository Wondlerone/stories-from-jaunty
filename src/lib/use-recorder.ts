import { useEffect, useRef, useState } from "react";
import { silenceDecision, SPEECH_RMS, type SilencePrompt } from "@/lib/silence";

export type Take = {
  blob: Blob;
  mime: string;
  heard: boolean;
  durationMs: number;
};

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "audio/mp4";
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function micMessage(err: unknown): string {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: string }).name)
      : "";
  const detail =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: string }).message)
      : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    if (/AVAudioSession|capture device/i.test(detail)) {
      return "The iPhone could not open the microphone. Close Safari completely, open it again, and tap Record.";
    }
    return detail
      ? `Safari did not ask. ${detail}`
      : "Safari did not ask. On the Microphone page, if this website is listed above Ask, tap Edit and delete it. Then tap Record.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found on this iPhone.";
  }
  return detail || "The recording did not start. Tap Record again.";
}

export function useRecorder(onAutoSave: (take: Take) => void) {
  const [phase, setPhase] = useState<"idle" | "opening" | "recording" | "saving">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [silencePrompt, setSilencePrompt] = useState<SilencePrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const onAutoSaveRef = useRef(onAutoSave);
  onAutoSaveRef.current = onAutoSave;

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const lastVoiceRef = useRef(0);
  const heardRef = useRef(false);
  const promptRef = useRef<SilencePrompt | null>(null);
  const finishingRef = useRef(false);
  const startingRef = useRef(false);
  const stopWaitRef = useRef<Promise<Take | null> | null>(null);
  const levelRef = useRef(0);
  const aliveRef = useRef(true);
  const ignoreSaveRef = useRef(false);

  function claim() {
    if (startingRef.current || finishingRef.current || recRef.current) return false;
    startingRef.current = true;
    return true;
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function readRms(): number {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const sample = ((data[i] ?? 128) - 128) / 128;
      sum += sample * sample;
    }
    return Math.sqrt(sum / data.length);
  }

  function finish(): Promise<Take | null> {
    const recorder = recRef.current;
    if (!recorder || recorder.state === "inactive") {
      recRef.current = null;
      stopTracks();
      if (aliveRef.current) {
        setPhase("idle");
        setError("The recording stopped before it could be kept. Tap Record and try again.");
      }
      return Promise.resolve(null);
    }
    if (stopWaitRef.current) return stopWaitRef.current;
    finishingRef.current = true;
    setPhase("saving");
    promptRef.current = null;
    setSilencePrompt(null);
    const started = startedAtRef.current;
    const spoke = heardRef.current;
    stopWaitRef.current = new Promise((resolve) => {
      recorder.onstop = () => {
        const mime = recorder.mimeType || pickMime() || "audio/mp4";
        const blob = new Blob(chunksRef.current, { type: mime });
        stopTracks();
        recRef.current = null;
        stopWaitRef.current = null;
        finishingRef.current = false;
        if (aliveRef.current) {
          setPhase("idle");
          setLevel(0);
        }
        resolve({
          blob,
          mime,
          heard: spoke,
          durationMs: Date.now() - started,
        });
      };
      try {
        recorder.stop();
      } catch {
        stopTracks();
        recRef.current = null;
        stopWaitRef.current = null;
        finishingRef.current = false;
        if (aliveRef.current) {
          setPhase("idle");
          setError("The recording could not be kept. Tap Record and try again.");
        }
        resolve(null);
      }
    });
    return stopWaitRef.current;
  }

  async function start(alreadyAsked?: Promise<MediaStream>, audioCtx?: AudioContext | null) {
    if (!startingRef.current && !claim()) return;
    if (typeof MediaRecorder === "undefined" || (!alreadyAsked && !navigator.mediaDevices?.getUserMedia)) {
      startingRef.current = false;
      setError("This browser cannot record.");
      setPhase("idle");
      return;
    }
    setError(null);
    let pending: Promise<MediaStream>;
    try {
      pending = alreadyAsked ?? navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      startingRef.current = false;
      setBlocked(true);
      setError(micMessage(err));
      setPhase("idle");
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await pending;
      } catch (err) {
        if (!aliveRef.current) return;
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name: string }).name)
            : "";
        if (name === "NotAllowedError" || name === "SecurityError") setBlocked(true);
        setError(micMessage(err));
        setPhase("idle");
        return;
      }
      if (!aliveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (!aliveRef.current || finishingRef.current) return;
          recRef.current = null;
          stopTracks();
          setPhase("idle");
          setError("The microphone stopped. Tap Record and try again.");
        };
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickMime();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (!aliveRef.current || finishingRef.current) return;
        recRef.current = null;
        stopTracks();
        setPhase("idle");
        setError("The recording stopped. Tap Record and try again.");
      };
      recorder.start();
      recRef.current = recorder;

      const now = Date.now();
      startedAtRef.current = now;
      lastVoiceRef.current = now;
      heardRef.current = false;
      promptRef.current = null;
      levelRef.current = 0;
      ignoreSaveRef.current = false;
      setHeard(false);
      setSilencePrompt(null);
      setElapsedMs(0);
      setLevel(0);
      setPhase("recording");

      try {
        const ctx = audioCtx ?? new AudioContext();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") void ctx.resume();
        const source = ctx.createMediaStreamSource(stream.clone());
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch {
        analyserRef.current = null;
      }

      timerRef.current = window.setInterval(() => {
        if (recorder.state !== "recording" || finishingRef.current) return;
        const tick = Date.now();
        setElapsedMs(tick - startedAtRef.current);
        const rms = readRms();
        levelRef.current = rms > levelRef.current ? rms : levelRef.current * 0.82;
        setLevel(Math.min(1, levelRef.current * 14));
        const meterDeaf = !analyserRef.current || ctxRef.current?.state === "suspended";
        if (meterDeaf) {
          if (!heardRef.current && tick - startedAtRef.current > 1000) {
            heardRef.current = true;
            setHeard(true);
          }
        } else if (rms > SPEECH_RMS) {
          lastVoiceRef.current = tick;
          if (!heardRef.current) {
            heardRef.current = true;
            setHeard(true);
          }
          if (promptRef.current) {
            promptRef.current = null;
            setSilencePrompt(null);
          }
        }
        const decision = silenceDecision({
          recording: true,
          silentForMs: tick - lastVoiceRef.current,
          heard: heardRef.current,
          prompt: promptRef.current,
          finishing: finishingRef.current,
        });
        if (decision === "show-quiet" || decision === "show-nothing") {
          promptRef.current = decision === "show-quiet" ? "quiet" : "nothing";
          setSilencePrompt(promptRef.current);
        } else if (decision === "autosave") {
          void finish().then((take) => {
            if (take && !ignoreSaveRef.current) onAutoSaveRef.current(take);
          });
        }
      }, 120);
    } catch {
      stopTracks();
      recRef.current = null;
      setPhase("idle");
      setError("This phone could not start recording. Please press Record again.");
    } finally {
      startingRef.current = false;
    }
  }

  function stillTalking() {
    lastVoiceRef.current = Date.now();
    promptRef.current = null;
    setSilencePrompt(null);
  }

  async function discard() {
    ignoreSaveRef.current = true;
    if (stopWaitRef.current) {
      await stopWaitRef.current;
      return;
    }
    if (recRef.current && recRef.current.state !== "inactive") {
      await finish();
      return;
    }
    stopTracks();
    if (aliveRef.current) {
      setPhase("idle");
      setSilencePrompt(null);
      setLevel(0);
    }
  }

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      ignoreSaveRef.current = true;
      const recorder = recRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.onstop = null;
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
      stopTracks();
    };
  }, []);

  return {
    phase,
    elapsedMs,
    level,
    heard,
    silencePrompt,
    error,
    blocked,
    claim,
    clearError: () => setError(null),
    start,
    finish,
    stillTalking,
    discard,
  };
}
