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
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function micMessage(err: unknown): string {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: string }).name)
      : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "I cannot hear you yet. If you are asked, press Allow, then press the red Record button again. If you are not asked, the microphone is switched off.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found on this device.";
  }
  return "This device could not hear you. Please check the microphone, then press the red Record button again.";
}

export function useRecorder(onAutoSave: (take: Take) => void) {
  const [phase, setPhase] = useState<"idle" | "recording" | "saving">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [silencePrompt, setSilencePrompt] = useState<SilencePrompt | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!recorder || recorder.state === "inactive") return Promise.resolve(null);
    if (stopWaitRef.current) return stopWaitRef.current;
    finishingRef.current = true;
    setPhase("saving");
    promptRef.current = null;
    setSilencePrompt(null);
    const started = startedAtRef.current;
    const spoke = heardRef.current;
    stopWaitRef.current = new Promise((resolve) => {
      recorder.onstop = () => {
        const mime = recorder.mimeType || "audio/webm";
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
        if (aliveRef.current) setPhase("idle");
        resolve(null);
      }
    });
    return stopWaitRef.current;
  }

  async function start() {
    setError(null);
    if (startingRef.current || finishingRef.current || recRef.current) return;
    startingRef.current = true;
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError(
          "I cannot hear you from here. Please ask someone to help, then press the red Record button again.",
        );
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch (err) {
        setError(micMessage(err));
        return;
      }
      if (!aliveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickMime();
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(250);
      recRef.current = recorder;

      try {
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch {
        analyserRef.current = null;
      }

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

      timerRef.current = window.setInterval(() => {
        if (recorder.state !== "recording" || finishingRef.current) return;
        const tick = Date.now();
        setElapsedMs(tick - startedAtRef.current);
        const rms = readRms();
        levelRef.current = rms > levelRef.current ? rms : levelRef.current * 0.82;
        setLevel(Math.min(1, levelRef.current * 14));
        if (rms > SPEECH_RMS) {
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
    clearError: () => setError(null),
    start,
    finish,
    stillTalking,
    discard,
  };
}
