import { describe, expect, test } from "bun:test";
import {
  adminPromptListQuerySchema,
  regenerateSchema,
  sessionStartSchema,
  themeListQuerySchema,
  themeNameSchema,
} from "./schema";

describe("themeNameSchema", () => {
  test("テーマ名は1〜30文字", () => {
    expect(themeNameSchema.safeParse({ kind: "theme", name: "忍びの心得" }).success).toBe(true);
    expect(themeNameSchema.safeParse({ kind: "theme", name: "あ".repeat(30) }).success).toBe(true);
    expect(themeNameSchema.safeParse({ kind: "theme", name: "あ".repeat(31) }).success).toBe(false);
    expect(themeNameSchema.safeParse({ kind: "theme", name: "" }).success).toBe(false);
    expect(themeNameSchema.safeParse({ kind: "theme", name: "   " }).success).toBe(false);
  });

  test("最適化する音はひらがな1〜4文字", () => {
    expect(themeNameSchema.safeParse({ kind: "constraint", name: "ざ" }).success).toBe(true);
    expect(themeNameSchema.safeParse({ kind: "constraint", name: "しゃりん" }).success).toBe(true);
    expect(themeNameSchema.safeParse({ kind: "constraint", name: "あいうえお" }).success).toBe(
      false,
    );
  });

  test("最適化する音にひらがな以外は使えない（読み仮名と永久に一致しないため）", () => {
    for (const name of ["ザ", "座", "za", "1", "ー", "あ い"]) {
      expect(themeNameSchema.safeParse({ kind: "constraint", name }).success).toBe(false);
    }
  });

  test("結合濁点で書かれた「が」を弾かない（NFC正規化を先に行っている）", () => {
    expect(themeNameSchema.safeParse({ kind: "constraint", name: "が" }).success).toBe(true);
  });

  test("kind が未知なら弾く", () => {
    expect(themeNameSchema.safeParse({ kind: "other", name: "あ" }).success).toBe(false);
  });
});

describe("sessionStartSchema", () => {
  test("themeId は必須", () => {
    expect(sessionStartSchema.safeParse({}).success).toBe(false);
    expect(sessionStartSchema.safeParse({ themeId: "" }).success).toBe(false);
  });

  test("offset は匿名時のみ。省略できる", () => {
    expect(sessionStartSchema.safeParse({ themeId: "t1" }).success).toBe(true);
  });

  test("範囲外のオフセットを弾く（改ざんは許容するが値の範囲は守らせる）", () => {
    expect(sessionStartSchema.safeParse({ themeId: "t1", offset: -1 }).success).toBe(false);
    expect(sessionStartSchema.safeParse({ themeId: "t1", offset: 1_000_000 }).success).toBe(false);
    expect(sessionStartSchema.safeParse({ themeId: "t1", offset: 1.5 }).success).toBe(false);
    expect(sessionStartSchema.safeParse({ themeId: "t1", offset: 0 }).success).toBe(true);
  });
});

describe("themeListQuerySchema", () => {
  test("既定はテーマの人気順", () => {
    const parsed = themeListQuerySchema.parse({});
    expect(parsed).toMatchObject({ kind: "theme", sort: "popular" });
  });

  test("未知の kind / sort は弾く", () => {
    expect(themeListQuerySchema.safeParse({ kind: "unknown" }).success).toBe(false);
    expect(themeListQuerySchema.safeParse({ sort: "random" }).success).toBe(false);
  });

  test("limit は50まで", () => {
    expect(themeListQuerySchema.safeParse({ limit: "50" }).success).toBe(true);
    expect(themeListQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
  });
});

describe("regenerateSchema", () => {
  test("themeId は必須", () => {
    expect(regenerateSchema.safeParse({ themeId: "t1" }).success).toBe(true);
    expect(regenerateSchema.safeParse({}).success).toBe(false);
  });
});

describe("出題の形式（form）", () => {
  test("省略すると短文になる（形式を持たない古いURL・クライアントが動く）", () => {
    const parsed = sessionStartSchema.safeParse({ themeId: "t1" });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.form).toBe("sentence");
  });

  test("単語を指定できる", () => {
    expect(sessionStartSchema.safeParse({ themeId: "t1", form: "word" }).data?.form).toBe("word");
    expect(regenerateSchema.safeParse({ themeId: "t1", form: "word" }).data?.form).toBe("word");
  });

  // 存在しないプールをHonoに引かせない
  test("知らない形式は弾く", () => {
    expect(sessionStartSchema.safeParse({ themeId: "t1", form: "poem" }).success).toBe(false);
    expect(regenerateSchema.safeParse({ themeId: "t1", form: "" }).success).toBe(false);
  });
});

describe("管理用のお題一覧（形式で絞る）", () => {
  test("形式を省略すると短文", () => {
    expect(adminPromptListQuerySchema.safeParse({}).data?.form).toBe("sentence");
  });

  test("単語を指定できる。ページングと併用できる", () => {
    const parsed = adminPromptListQuerySchema.safeParse({
      form: "word",
      limit: "50",
      cursor: "50",
    });

    expect(parsed.data).toMatchObject({ form: "word", limit: 50, cursor: 50 });
  });

  test("知らない形式は弾く", () => {
    expect(adminPromptListQuerySchema.safeParse({ form: "poem" }).success).toBe(false);
  });
});
