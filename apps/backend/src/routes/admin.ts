import {
  containsKanji,
  countKeystrokes,
  includesConstraint,
  isHiraganaOnlyWord,
  isKeystrokeCountInRange,
  isTypableText,
  isTypableWord,
  KEYSTROKE_MAX,
  KEYSTROKE_MIN,
  parsePromptForm,
  UnsupportedKanaError,
  WORD_KEYSTROKE_MAX,
  WORD_KEYSTROKE_MIN,
} from "@henge/shared";
import { Hono } from "hono";
import { createDb } from "../db/client";
import {
  deletePrompt,
  getPromptWithTheme,
  listPromptsForAdmin,
  PROMPT_LIST_LIMIT_DEFAULT,
  updatePromptText,
} from "../db/prompts";
import { createGetReading } from "../reading/index";
import { deleteTheme, LIST_LIMIT_DEFAULT, listThemesForAdmin } from "../db/themes";
import { listUsers, USER_LIST_LIMIT_DEFAULT } from "../db/users";
import { fail } from "../http/error";
import { releaseAllThemeLocks } from "../kv/lock";
import { deleteCachedThemeId } from "../kv/themes";

/**
 * 管理用の内部API。
 *
 * **管理者かどうかの判定はここでしない。** `ADMIN_EMAILS` による判定は Next.js 側の
 * 責務で、このWorkerに届いた時点で認可は済んでいる（外部公開されておらず、
 * Service Bindings 経由でしか呼ばれない）。両方に判定を置くと、ずれたときに気付けない。
 */

/** limit / cursor のクエリを読む。不正な値は既定値に落とす（検証は Next.js 側で済んでいる） */
function pagination(
  query: (name: string) => string | undefined,
  defaultLimit: number,
): { limit: number; cursor: number } {
  const limit = Number.parseInt(query("limit") ?? "", 10);
  const cursor = Number.parseInt(query("cursor") ?? "", 10);
  return {
    limit: Number.isNaN(limit) ? defaultLimit : limit,
    cursor: Number.isNaN(cursor) || cursor < 0 ? 0 : cursor,
  };
}

export const adminRoutes = new Hono<{ Bindings: Env }>()
  .get("/admin/themes", async (c) => {
    const db = createDb(c.env.DB);
    return c.json(
      await listThemesForAdmin(db, pagination(c.req.query.bind(c.req), LIST_LIMIT_DEFAULT)),
    );
  })
  .delete("/admin/themes/:id", async (c) => {
    const themeId = c.req.param("id");
    const db = createDb(c.env.DB);

    // 消す前に正規化キーを受け取る。消した後ではKVのキーを組み立てられない
    const deleted = await deleteTheme(db, themeId);
    if (deleted === null) return fail(c, "NOT_FOUND", "テーマが見つかりません");

    // **KVは明示的に消す。** D1のCASCADEはD1の中でしか効かないため、
    // 消し忘れると削除したテーマがキャッシュ経由で復活したように見える
    await deleteCachedThemeId(c.env.KV, deleted.kind, deleted.normalizedName);
    // 削除の瞬間に補充が走っていた場合に備えてロックも落とす（TTL任せにしない）。
    // **形式ぶんすべて消す**（短文と単語で別のキーになっている）
    await releaseAllThemeLocks(c.env.KV, themeId);

    return c.json({ deleted: true, themeId });
  })
  /*
   * **お題の一覧と編集はパスパラメータを使わない。**
   *
   * Hono RPC は、バリデータを置かない限りパスパラメータと本文／クエリを同時に
   * 型推論できない（`input` が `{ param }` だけになり、`query` / `json` を渡すと
   * 型で弾かれる）。この規約では検証は Next.js 側に置くと決めているので
   * （AGENTS.md）、型のためだけに Hono へバリデータを増やさない。
   *
   * **公開API側は REST な形のまま**（`/api/admin/themes/[id]/prompts`、
   * `/api/admin/prompts/[id]`）。内部APIの形は実装の都合なので、外に出る形と
   * 揃える必要はない。
   */
  .get("/admin/prompts", async (c) => {
    const db = createDb(c.env.DB);
    return c.json(
      await listPromptsForAdmin(
        db,
        c.req.query("themeId") ?? "",
        // 検証は公開API側（Next.js）で済んでいる。ここは既定に倒すだけ
        parsePromptForm(c.req.query("form")),
        pagination(c.req.query.bind(c.req), PROMPT_LIST_LIMIT_DEFAULT),
      ),
    );
  })
  .patch("/admin/prompts", async (c) => {
    const { id: promptId, text } = await c.req.json<{ id: string; text: string }>();
    const db = createDb(c.env.DB);

    const target = await getPromptWithTheme(db, promptId);
    if (target === null) return fail(c, "NOT_FOUND", "お題が見つかりません");

    // **本文だけ差し替えてはいけない。** 打鍵判定は読み仮名に対して行うので、
    // 読みを取り直さないと「画面の文と打つべきローマ字が食い違う」お題ができる。
    // 生成時と同じ検査を通す。ここを緩めると、生成では弾かれる文が手動で入る
    // **検査は元のお題の形式に合わせる。** 単語のお題を短文の規則で通すと、
    // 句読点入りの「単語」や35打の「単語」が手動で入ってしまう
    const isWord = target.form === "word";
    if (isWord ? !isTypableWord(text) : !isTypableText(text)) {
      return fail(
        c,
        "VALIDATION_ERROR",
        isWord ? "単語に使えない文字が含まれています" : "打てない文字が含まれています",
      );
    }
    if (isWord ? isHiraganaOnlyWord(text) : !containsKanji(text)) {
      return fail(
        c,
        "VALIDATION_ERROR",
        isWord ? "ひらがなだけの単語は登録できません" : "漢字を1つ以上入れてください",
      );
    }

    let reading: Awaited<ReturnType<ReturnType<typeof createGetReading>>>;
    try {
      reading = await createGetReading(c.env)(text);
    } catch (error) {
      // 読みにテーブル外のかなが残った場合。打てないお題になるので通さない
      if (error instanceof UnsupportedKanaError) {
        return fail(c, "VALIDATION_ERROR", "読み仮名に打てない文字が含まれています");
      }
      throw error;
    }

    const keystrokeCount = countKeystrokes(reading.roman);
    if (!isKeystrokeCountInRange(keystrokeCount, target.form)) {
      const [min, max] = isWord
        ? [WORD_KEYSTROKE_MIN, WORD_KEYSTROKE_MAX]
        : [KEYSTROKE_MIN, KEYSTROKE_MAX];
      return fail(
        c,
        "VALIDATION_ERROR",
        `打鍵数が${min}〜${max}の範囲外です（${keystrokeCount}打）`,
      );
    }
    if (target.kind === "constraint" && !includesConstraint(reading.kana, target.themeName)) {
      return fail(c, "VALIDATION_ERROR", `読み仮名に「${target.themeName}」が含まれていません`);
    }

    await updatePromptText(db, promptId, {
      text,
      readingKana: reading.kana,
      readingRomanJson: JSON.stringify(reading.roman),
      keystrokeCount,
    });

    return c.json({ id: promptId, text, readingKana: reading.kana, keystrokeCount });
  })
  .delete("/admin/prompts/:id", async (c) => {
    const promptId = c.req.param("id");
    const db = createDb(c.env.DB);

    // 連番は詰め直さない。配信は行数で位置を数えるので穴が空いても壊れない
    // （db/prompts.ts の fetchPromptPage 参照）
    if (!(await deletePrompt(db, promptId))) {
      return fail(c, "NOT_FOUND", "お題が見つかりません");
    }
    return c.json({ deleted: true, promptId });
  })
  .get("/admin/users", async (c) => {
    const db = createDb(c.env.DB);
    return c.json(
      await listUsers(db, pagination(c.req.query.bind(c.req), USER_LIST_LIMIT_DEFAULT)),
    );
  });
