import { isHiraganaOnly, playStatsRejection } from "@henge/shared";
import { z } from "zod";

/**
 * 入力検証は**公開APIの入口でだけ**行う。Hono側では行わない。
 *
 * `kind` によって許可する入力が変わる。最適化する音がひらがな限定なのは、
 * 判定対象が読み仮名（ひらがな）のため。それ以外を指定しても永久に一致しない。
 */
export const themeNameSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("theme"), name: z.string().trim().min(1).max(30) }),
    z.object({ kind: z.literal("constraint"), name: z.string().trim().min(1).max(4) }),
  ])
  // NFC正規化はバリデーションより先に行う必要があるため、isHiraganaOnly の中で行っている
  .refine(
    (value) => value.kind !== "constraint" || isHiraganaOnly(value.name),
    "最適化する音はひらがなだけを指定できます",
  );

/** 匿名時のオフセット。改ざんは許容するが、範囲外の値は弾く */
const offsetSchema = z.number().int().min(0).max(100_000);

/**
 * 出題の形式。**省略時は短文。**
 *
 * 既定を持たせるのは、形式を持たない古いクライアント（共有された古いURLなど）が
 * そのまま短文で動くようにするため。未知の値は弾く（存在しないプールをHonoに
 * 引かせない）。
 */
const formSchema = z.enum(["sentence", "word", "long"]).default("sentence");

export const sessionStartSchema = z.object({
  themeId: z.string().min(1),
  form: formSchema,
  offset: offsetSchema.optional(),
});

export const regenerateSchema = z.object({
  themeId: z.string().min(1),
  form: formSchema,
});

export const themeListQuerySchema = z.object({
  kind: z.enum(["theme", "constraint"]).default("theme"),
  sort: z.enum(["popular", "recent"]).default("popular"),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.coerce.number().int().min(0).optional(),
});

/** 管理用一覧のページング。公開一覧と違い kind / sort での分岐は持たない */
export const adminListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.coerce.number().int().min(0).optional(),
});

/**
 * テーマ1つ分のお題一覧。**形式で絞る。**
 *
 * 短文と単語はプールが別で、連番も1から振り直される。混ぜて出すと番号が2回りして、
 * 管理者がどの行を消せばよいか読めない。省略時は短文。
 */
export const adminPromptListQuerySchema = adminListQuerySchema.extend({
  form: formSchema,
});

/** 削除対象のテーマID（パスパラメータ） */
export const themeIdParamSchema = z.object({ id: z.string().min(1) });

/** 編集対象のお題ID（パスパラメータ） */
export const promptIdParamSchema = z.object({ id: z.string().min(1) });

/**
 * お題本文の編集。
 *
 * **ここでは長さしか見ない。** 打てる文字か・漢字を含むか・打鍵数が範囲内か・
 * 「含む」文字が読みにあるかは、**読み仮名を取らないと判定できない**（表記だけでは
 * 分からない）。読み取得は D1/外部APIを持つ Hono 側の責務なので、そちらで生成時と
 * 同じ検査を通す。ここで中途半端に真似ると、2か所の規則がずれる。
 */
export const promptTextSchema = z.object({
  // 長文は表記で150〜250文字になる（打鍵450 ≒ かな220文字）。100のままだと
  // 管理画面で長文を編集した時点で必ず弾かれる。打鍵数の本当の上限は Hono 側が
  // 読み仮名から検査するので、ここは形式に依らず十分に大きい枠でよい
  text: z.string().trim().min(1).max(400),
});

/** 表示名の最大文字数。フォームの `maxLength` と検証で同じ値を使う */
export const DISPLAY_NAME_MAX_LENGTH = 20;

/**
 * ユーザー名（表示名）。**ランキングなど公開の場に出す名前**なので、Google の
 * 名前（`user.name`。本名のことが多い）とは別に、利用者が自分で決める。
 *
 * 前後の空白を除いて1〜20文字。改行や制御文字は一覧の1行に収まらないので弾く。
 * 一意ではない（同じ名前の利用者がいてもよい。IDで区別する）。
 *
 * **Route Handler ではなく Better Auth の `validator.input` に渡す。** 更新は
 * Better Auth の `/api/auth/update-user` で行い、そこが公開APIの入口になる
 * （`lib/auth.ts`）。ここに置くのは、他の入力検証と同じ場所に規則を揃えるため。
 */
export const displayNameSchema = z
  .string({ message: "ユーザー名は文字列で指定してください" })
  .trim()
  .min(1, "ユーザー名を入力してください")
  .max(DISPLAY_NAME_MAX_LENGTH, `ユーザー名は${DISPLAY_NAME_MAX_LENGTH}文字までです`)
  .refine(
    (value) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value),
    "ユーザー名に改行や制御文字は使えません",
  );

/**
 * ランキングの登録。クライアントは**生の値**（打鍵数・ミス・時間）を送り、
 * スコアはサーバー（Hono）で計算する。クライアントのスコアを受け取らない。
 *
 * 記録は自己申告で改ざんは防げない。ここで弾くのは「打っていないと分かる値」だけで、
 * 規則は `packages/shared` の `playStatsRejection`（1プレイの打鍵数の範囲・時間・
 * 1秒あたりの打鍵数）に1つだけ置く。形式で範囲が変わるので `form` と一緒に検査する。
 */
export const rankingRegisterSchema = z
  .object({
    themeId: z.string().min(1),
    form: formSchema,
    hits: z.number().int().min(0),
    misses: z.number().int().min(0).max(100_000),
    /**
     * **小数で来る。** プレイ画面は `performance.now()` の差で計っていて、
     * `61234.567` のような値になる。整数を要求すると正しい記録がすべて弾かれるので、
     * ここで丸める（保存先は INTEGER）。上限・下限の検査は丸めた後に行う。
     */
    elapsedMs: z
      .number()
      .finite()
      .transform((ms) => Math.round(ms)),
  })
  .superRefine((value, ctx) => {
    // 弾く理由をそのまま利用者に返す（「範囲外」だけでは何が悪いか分からない）
    const reason = playStatsRejection(value, value.form);
    if (reason !== null) ctx.addIssue({ code: "custom", message: reason });
  });
