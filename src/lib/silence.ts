export type SilencePrompt = "quiet" | "nothing";

/** How long the room must be quiet before we ask if they have finished. */
export const SILENCE_PROMPT_MS = 12_000;

/**
 * From the last speech (not from when the prompt appeared).
 * 12s brings the prompt up; another 20s of quiet saves the recording
 * so a long pause does not lose what they already said.
 */
export const SILENCE_AUTOSAVE_MS = 32_000;

/** Time-domain RMS above this counts as speech, not a quiet room. */
export const SPEECH_RMS = 0.022;

export function silenceDecision(input: {
  recording: boolean;
  silentForMs: number;
  heard: boolean;
  prompt: SilencePrompt | null;
  finishing: boolean;
}): "none" | "show-quiet" | "show-nothing" | "autosave" {
  if (!input.recording || input.finishing) return "none";
  if (
    input.prompt === "quiet" &&
    input.heard &&
    input.silentForMs >= SILENCE_AUTOSAVE_MS
  ) {
    return "autosave";
  }
  if (input.prompt === null && input.silentForMs >= SILENCE_PROMPT_MS) {
    return input.heard ? "show-quiet" : "show-nothing";
  }
  return "none";
}
