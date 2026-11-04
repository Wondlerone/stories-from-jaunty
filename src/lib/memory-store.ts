import type { SeedQuestion } from "@/data/seed-questions";
import {
  addImageFn,
  deleteImageFn,
  deleteMemoryFn,
  deleteQuestionFn,
  getMemoryAudioFn,
  loadLibraryFn,
  restoreSeedsFn,
  saveMemoryFn,
  setSkippedFn,
  updateCaptionFn,
  upsertQuestionFn,
} from "@/lib/stories.functions";

export type Question = SeedQuestion;

export type StoredImage = {
  id: string;
  blob: Blob;
  mime: string;
  caption: string;
};

export type MemoryRecord = {
  id: string;
  questionId: string;
  questionText: string;
  createdAt: number;
  durationMs: number;
  mime: string;
  blob: Blob;
};

export type MemoryMeta = Omit<MemoryRecord, "blob">;

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function loadLibrary(): Promise<{
  questions: Question[];
  memories: MemoryMeta[];
  skippedIds: string[];
  images: StoredImage[];
}> {
  const library = await loadLibraryFn();
  return {
    questions: library.questions,
    memories: library.memories.map(({ transcript: _transcript, ...memory }) => memory),
    skippedIds: library.skippedIds,
    images: library.images.map((image) => ({
      id: image.id,
      mime: image.mime,
      caption: image.caption,
      blob: base64ToBlob(image.dataBase64, image.mime),
    })),
  };
}

export async function listQuestions(): Promise<Question[]> {
  return (await loadLibrary()).questions;
}

export async function upsertQuestion(question: Question): Promise<void> {
  await upsertQuestionFn({ data: question });
}

export async function deleteQuestion(id: string): Promise<void> {
  await deleteQuestionFn({ data: id });
}

export async function addImage(file: Blob, mime: string): Promise<StoredImage> {
  const id = crypto.randomUUID();
  const type = mime || file.type || "image/jpeg";
  await addImageFn({ data: { id, mime: type, dataBase64: await blobToBase64(file) } });
  return { id, blob: file, mime: type, caption: "" };
}

export async function updateImageCaption(id: string, caption: string): Promise<void> {
  await updateCaptionFn({ data: { id, caption } });
}

export async function deleteImage(id: string): Promise<void> {
  await deleteImageFn({ data: id });
}

export async function getMemory(id: string): Promise<MemoryRecord | null> {
  const row = await getMemoryAudioFn({ data: id });
  if (!row) return null;
  return {
    id: row.id,
    questionId: "",
    questionText: row.questionText,
    createdAt: row.createdAt,
    durationMs: row.durationMs,
    mime: row.mime,
    blob: base64ToBlob(row.audioBase64, row.mime),
  };
}

export async function saveMemory(memory: MemoryRecord): Promise<void> {
  await saveMemoryFn({
    data: {
      id: memory.id,
      questionId: memory.questionId,
      questionText: memory.questionText,
      createdAt: memory.createdAt,
      durationMs: memory.durationMs,
      mime: memory.mime,
      audioBase64: await blobToBase64(memory.blob),
    },
  });
}

export async function deleteMemory(id: string): Promise<void> {
  await deleteMemoryFn({ data: id });
}

export async function getSkipped(): Promise<string[]> {
  return (await loadLibrary()).skippedIds;
}

export async function setSkipped(ids: string[]): Promise<void> {
  await setSkippedFn({ data: ids });
}

export async function restoreSeedQuestions(): Promise<number> {
  return restoreSeedsFn();
}

export function nextQuestionId(
  questions: Question[],
  answeredIds: Set<string>,
  skippedIds: string[],
  afterId: string | null,
): string | null {
  const skipped = new Set(skippedIds);
  const open = questions.filter(
    (question) => !answeredIds.has(question.id) && !skipped.has(question.id),
  );
  if (open.length === 0) return null;
  if (!afterId) return open[0]?.id ?? null;
  const index = questions.findIndex((question) => question.id === afterId);
  const later = questions
    .slice(index + 1)
    .find((question) => open.some((item) => item.id === question.id));
  return later?.id ?? open[0]?.id ?? null;
}
