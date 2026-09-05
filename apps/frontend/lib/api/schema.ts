import { isHiraganaOnly } from "@henge/shared";
import { z } from "zod";

/**
 * 入力検証は**公開APIの入口でだけ**行う。Hono側では行わない。
 *
 * `kind` によって許可する入力が変わる。含む文字がひらがな限定なのは、
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
    "含む文字はひらがなだけを指定できます",
  );

/** 匿名時のオフセット。改ざんは許容するが、範囲外の値は弾く */
const offsetSchema = z.number().int().min(0).max(100_000);

export const sessionStartSchema = z.object({
  themeId: z.string().min(1),
  offset: offsetSchema.optional(),
});

export const regenerateSchema = z.object({
  themeId: z.string().min(1),
});

export const themeListQuerySchema = z.object({
  kind: z.enum(["theme", "constraint"]).default("theme"),
  sort: z.enum(["popular", "recent"]).default("popular"),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.coerce.number().int().min(0).optional(),
});
