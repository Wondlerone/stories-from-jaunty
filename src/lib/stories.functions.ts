import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { RETIRED_QUESTION_IDS, SEED_QUESTIONS } from "@/data/seed-questions";

type QuestionRow = {
  id: string;
  text: string;
  sort_order: number;
  image_ids: string;
};

type ImageRow = {
  id: string;
  mime: string;
  caption: string;
  data_base64: string;
};

type MemoryRow = {
  id: string;
  question_id: string;
  question_text: string;
  created_ms: number;
  duration_ms: number;
  mime: string;
  transcript: string | null;
};

export type LibraryDto = {
  questions: { id: string; text: string; order: number; imageIds: string[] }[];
  images: { id: string; mime: string; caption: string; dataBase64: string }[];
  memories: {
    id: string;
    questionId: string;
    questionText: string;
    createdAt: number;
    durationMs: number;
    mime: string;
    transcript: string | null;
  }[];
  skippedIds: string[];
};

function parseIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function transcribe(audioBase64: string, mime: string): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  const bytes = Buffer.from(audioBase64, "base64");
  const form = new FormData();
  form.append("model", "grok-voice-transcribe-2.0");
  const ext = mime.includes("mp4") || mime.includes("aac") ? "m4a" : "webm";
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime || "audio/webm" }), `story.${ext}`);
  const res = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { text?: string };
  const text = body.text?.trim();
  return text ? text : null;
}

export const loadLibraryFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LibraryDto> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const userId = context.userId;
    const retired = new Set(RETIRED_QUESTION_IDS);
    const held = await sql<{ id: string; image_ids: string }>`
      select id, image_ids from questions where user_id = ${userId}
    `;
    let removedAudience = 0;
    for (const row of held) {
      if (!retired.has(row.id) || parseIds(row.image_ids).length > 0) continue;
      await sql`delete from questions where id = ${row.id} and user_id = ${userId}`;
      removedAudience += 1;
    }
    const count = await sql<{ n: number }>`
      select count(*)::int as n from questions where user_id = ${userId}
    `;
    const remaining = Number(count[0]?.n ?? 0);
    if (remaining === 0 || removedAudience > 0) {
      const present = await sql<{ id: string }>`
        select id from questions where user_id = ${userId}
      `;
      const have = new Set(present.map((row) => row.id));
      for (const question of SEED_QUESTIONS) {
        if (have.has(question.id)) continue;
        await sql`
          insert into questions (id, user_id, text, sort_order, image_ids)
          values (
            ${question.id},
            ${userId},
            ${question.text},
            ${question.order},
            ${JSON.stringify(question.imageIds)}
          )
          on conflict (user_id, id) do nothing
        `;
      }
      await sql`
        insert into story_state (user_id, skipped_ids) values (${userId}, '[]')
        on conflict (user_id) do nothing
      `;
    }
    const jaunty = SEED_QUESTIONS.find((question) => question.id === "play14");
    if (jaunty) {
      await sql`
        update questions set text = ${jaunty.text}
        where user_id = ${userId}
          and id = 'play14'
          and text = 'Did you play with Tony or with Tex, or with someone else who has stayed with you? Tell me about working with them.'
      `;
    }
    const questions = await sql<QuestionRow>`
      select id, text, sort_order, image_ids from questions
      where user_id = ${userId}
      order by sort_order
    `;
    const images = await sql<ImageRow>`
      select id, mime, caption, encode(bytes, 'base64') as data_base64
      from question_images where user_id = ${userId}
    `;
    const memories = await sql<MemoryRow>`
      select id, question_id, question_text,
        (extract(epoch from created_at) * 1000)::bigint as created_ms,
        duration_ms, mime, transcript
      from memories where user_id = ${userId}
      order by created_at desc
    `;
    const state = await sql<{ skipped_ids: string }>`
      select skipped_ids from story_state where user_id = ${userId}
    `;
    return {
      questions: questions.map((row) => ({
        id: row.id,
        text: row.text,
        order: row.sort_order,
        imageIds: parseIds(row.image_ids),
      })),
      images: images.map((row) => ({
        id: row.id,
        mime: row.mime,
        caption: row.caption,
        dataBase64: row.data_base64,
      })),
      memories: memories.map((row) => ({
        id: row.id,
        questionId: row.question_id,
        questionText: row.question_text,
        createdAt: Number(row.created_ms),
        durationMs: row.duration_ms,
        mime: row.mime,
        transcript: row.transcript,
      })),
      skippedIds: parseIds(state[0]?.skipped_ids ?? "[]"),
    };
  });

export const upsertQuestionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; text: string; order: number; imageIds: string[] }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into questions (id, user_id, text, sort_order, image_ids)
      values (
        ${data.id},
        ${context.userId},
        ${data.text},
        ${data.order},
        ${JSON.stringify(data.imageIds)}
      )
      on conflict (user_id, id) do update set
        text = excluded.text,
        sort_order = excluded.sort_order,
        image_ids = excluded.image_ids
    `;
  });

export const deleteQuestionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ image_ids: string }>`
      select image_ids from questions where id = ${id} and user_id = ${context.userId}
    `;
    const imageIds = parseIds(rows[0]?.image_ids ?? "[]");
    for (const imageId of imageIds) {
      await sql`delete from question_images where id = ${imageId} and user_id = ${context.userId}`;
    }
    await sql`delete from questions where id = ${id} and user_id = ${context.userId}`;
  });

export const addImageFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; mime: string; dataBase64: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query(
      `insert into question_images (id, user_id, mime, caption, bytes)
       values ($1, $2, $3, '', decode($4, 'base64'))`,
      [data.id, context.userId, data.mime || "image/jpeg", data.dataBase64],
    );
  });

export const updateCaptionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; caption: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      update question_images set caption = ${data.caption}
      where id = ${data.id} and user_id = ${context.userId}
    `;
  });

export const deleteImageFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from question_images where id = ${id} and user_id = ${context.userId}`;
  });

export const setSkippedFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((ids: string[]) => ids)
  .handler(async ({ context, data: ids }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const value = JSON.stringify(ids);
    await sql`
      insert into story_state (user_id, skipped_ids) values (${context.userId}, ${value})
      on conflict (user_id) do update set skipped_ids = ${value}
    `;
  });

export const restoreSeedsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const existing = await sql<{ id: string; sort_order: number }>`
      select id, sort_order from questions where user_id = ${context.userId}
    `;
    const have = new Set(existing.map((row) => row.id));
    let order = existing.reduce((max, row) => Math.max(max, row.sort_order), 0);
    let added = 0;
    for (const seed of SEED_QUESTIONS) {
      if (have.has(seed.id)) continue;
      order += 1;
      await sql`
        insert into questions (id, user_id, text, sort_order, image_ids)
        values (${seed.id}, ${context.userId}, ${seed.text}, ${order}, '[]')
      `;
      added += 1;
    }
    return added;
  });

export const saveMemoryFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      id: string;
      questionId: string;
      questionText: string;
      createdAt: number;
      durationMs: number;
      mime: string;
      audioBase64: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    if (!data.audioBase64) {
      throw new Error("Recording could not be sent");
    }
    if (data.audioBase64.length > 12_000_000) {
      throw new Error("This recording is too long to send.");
    }
    let transcript: string | null = null;
    try {
      transcript = await transcribe(data.audioBase64, data.mime);
    } catch {
      transcript = null;
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query(
      `insert into memories
        (id, user_id, question_id, question_text, created_at, duration_ms, mime, audio, transcript)
       values ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6, $7, decode($8, 'base64'), $9)`,
      [
        data.id,
        context.userId,
        data.questionId,
        data.questionText,
        data.createdAt,
        data.durationMs,
        data.mime,
        data.audioBase64,
        transcript,
      ],
    );
    return { id: data.id };
  });

export const getMemoryAudioFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      question_text: string;
      created_ms: number;
      duration_ms: number;
      mime: string;
      audio_base64: string;
    }>`
      select id, question_text,
        (extract(epoch from created_at) * 1000)::bigint as created_ms,
        duration_ms, mime, encode(audio, 'base64') as audio_base64
      from memories where id = ${id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      questionText: row.question_text,
      createdAt: Number(row.created_ms),
      durationMs: row.duration_ms,
      mime: row.mime,
      audioBase64: row.audio_base64,
    };
  });

export const deleteMemoryFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from memories where id = ${id} and user_id = ${context.userId}`;
  });

export const findThemesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "The reading is not available just now." };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ question_text: string; transcript: string | null }>`
      select question_text, transcript from memories
      where user_id = ${context.userId}
      order by created_at
    `;
    const told = rows.filter((row) => row.transcript && row.transcript.trim().length > 0);
    if (told.length === 0) {
      return {
        ok: false as const,
        error: "There are no words to read yet. Tell a story first, then try again.",
      };
    }
    const packed = told
      .map(
        (row, index) =>
          `Story ${index + 1}. Question: ${row.question_text}\nTold: ${row.transcript}`,
      )
      .join("\n\n");
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 900,
        messages: [
          {
            role: "user",
            content:
              "These are spoken memories. In plain British English, name the common themes and say which stories belong together. Use a short heading and a few sentences for each theme. Do not invent places, people, or events that are not in the words. If only one story is here, say what it is about and that more stories are needed before a pattern can show.\n\n" +
              packed,
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: "The stories could not be read just now." };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false as const, error: "The stories could not be read just now." };
    await sql`
      insert into story_themes (user_id, body, updated_at)
      values (${context.userId}, ${text}, now())
      on conflict (user_id) do update set body = ${text}, updated_at = now()
    `;
    return { ok: true as const, text };
  });

export const getThemesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ body: string }>`
      select body from story_themes where user_id = ${context.userId}
    `;
    return rows[0]?.body ?? null;
  });
