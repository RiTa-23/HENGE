import { isHiraganaOnly } from "@henge/shared";
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
const formSchema = z.enum(["sentence", "word"]).default("sentence");

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
  text: z.string().trim().min(1).max(100),
});
