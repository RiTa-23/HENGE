import { normalizeName, PLAY_SIZE, type ThemeKind } from "@henge/shared";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { appendPrompts, insertThemeWithPrompts, recentPromptTexts } from "../db/prompts";
import { findThemeByName, getThemeDetail, setGenerationStatus } from "../db/themes";
import { generateBatch } from "../generation/batch";
import { resolveModel } from "../generation/model";
import { EXISTING_CONTEXT_SIZE } from "../generation/prompt";
import { fail } from "../http/error";
import { cacheThemeId, getCachedThemeId } from "../kv/themes";
import { acquireThemeLock, releaseThemeLock } from "../kv/lock";
import { createGetReading } from "../reading/index";

interface CreateBody {
  kind: ThemeKind;
  name: string;
  userId: string;
}

interface RegenerateBody {
  themeId: string;
  userId: string;
}

export const generateRoutes = new Hono<{ Bindings: Env }>()
  .post("/themes", async (c) => {
    const body = await c.req.json<CreateBody>();
    const db = createDb(c.env.DB);
    const normalizedName = normalizeName(body.kind, body.name);

    // 既存と一致したらエラーにせず既存を返す。クォータも消費しない
    const cachedId = await getCachedThemeId(c.env.KV, body.kind, normalizedName);
    const existing =
      cachedId === null
        ? await findThemeByName(db, body.kind, body.name)
        : await getThemeDetail(db, cachedId);
    if (existing !== null) {
      const detail = "promptCount" in existing ? existing : await getThemeDetail(db, existing.id);
      return c.json({ theme: detail, created: false });
    }

    const themeId = crypto.randomUUID();
    const model = resolveModel(c.env.GENERATION_MODEL);
    const result = await generateBatch(c.env, {
      kind: body.kind,
      name: body.name,
      themeId,
      path: "create",
      target: PLAY_SIZE,
      existing: [],
      model,
      getReading: createGetReading(c.env),
      waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    });

    // **目標未達ならテーマ行を作らない。** 先に作ると、お題ゼロのテーマが
    // 公開一覧に残り、クリックしても何も遊べない状態になる
    if (!result.reachedTarget) return fail(c, "GENERATION_FAILED");

    await insertThemeWithPrompts(
      db,
      { id: themeId, kind: body.kind, name: body.name, normalizedName, createdBy: body.userId },
      result.valid,
      model,
    );
    await cacheThemeId(c.env.KV, body.kind, normalizedName, themeId);

    return c.json({ theme: await getThemeDetail(db, themeId), created: true });
  })
  .post("/prompts/regenerate", async (c) => {
    const body = await c.req.json<RegenerateBody>();
    const db = createDb(c.env.DB);

    const theme = await getThemeDetail(db, body.themeId);
    if (theme === null) return fail(c, "VALIDATION_ERROR", "テーマが見つかりません");

    // 背景補充が走っている最中なら、二重に生成しない
    if (!(await acquireThemeLock(c.env.KV, body.themeId))) {
      return fail(c, "GENERATION_IN_PROGRESS");
    }

    try {
      const model = resolveModel(c.env.GENERATION_MODEL);
      const result = await generateBatch(c.env, {
        kind: theme.kind,
        name: theme.name,
        themeId: theme.id,
        path: "regenerate",
        target: PLAY_SIZE,
        existing: await recentPromptTexts(db, theme.id, EXISTING_CONTEXT_SIZE),
        model,
        getReading: createGetReading(c.env),
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
      });

      if (!result.reachedTarget) return fail(c, "GENERATION_FAILED");

      await appendPrompts(db, theme.id, result.valid, model);
      // 生成できることが実証されたので「生成困難」の印を外す
      if (theme.generationStatus === "difficult") await setGenerationStatus(db, theme.id, "ok");

      return c.json({ theme: await getThemeDetail(db, theme.id), added: result.valid.length });
    } finally {
      await releaseThemeLock(c.env.KV, body.themeId);
    }
  });
