import assert from "node:assert/strict";
import test from "node:test";
import { silenceDecision } from "./silence.ts";

const base = {
  recording: true,
  silentForMs: 0,
  heard: false,
  prompt: null as null,
  finishing: false,
};

test("stays quiet until twelve seconds", () => {
  assert.equal(silenceDecision({ ...base, silentForMs: 11_999 }), "none");
});

test("asks when nothing has been heard", () => {
  assert.equal(
    silenceDecision({ ...base, silentForMs: 12_000 }),
    "show-nothing",
  );
});

test("asks if they have finished after they have spoken", () => {
  assert.equal(
    silenceDecision({ ...base, heard: true, silentForMs: 12_000 }),
    "show-quiet",
  );
});

test("does not save an empty recording just because it is quiet", () => {
  assert.equal(
    silenceDecision({
      ...base,
      prompt: "nothing",
      silentForMs: 90_000,
    }),
    "none",
  );
});

test("saves a spoken memory after a long quiet stretch", () => {
  assert.equal(
    silenceDecision({
      ...base,
      heard: true,
      prompt: "quiet",
      silentForMs: 32_000,
    }),
    "autosave",
  );
});

test("does not nag again while the prompt is already up", () => {
  assert.equal(
    silenceDecision({
      ...base,
      heard: true,
      prompt: "quiet",
      silentForMs: 20_000,
    }),
    "none",
  );
});

test("ignores silence once they have pressed finished", () => {
  assert.equal(
    silenceDecision({
      ...base,
      heard: true,
      finishing: true,
      silentForMs: 40_000,
    }),
    "none",
  );
});
