import { describe, expect, test } from "bun:test";
import {
  adminPromptListQuerySchema,
  displayNameSchema,
  rankingRegisterSchema,
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
    expect(sessionStartSchema.safeParse({ themeId: "t1", form: "long" }).data?.form).toBe("long");
    expect(regenerateSchema.safeParse({ themeId: "t1", form: "long" }).data?.form).toBe("long");
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

describe("displayNameSchema", () => {
  test("前後の空白を除いて1〜20文字", () => {
    expect(displayNameSchema.safeParse("影丸").success).toBe(true);
    expect(displayNameSchema.safeParse("あ".repeat(20)).success).toBe(true);
    expect(displayNameSchema.safeParse("あ".repeat(21)).success).toBe(false);
    expect(displayNameSchema.safeParse("").success).toBe(false);
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
  });

  test("前後の空白は落として返す（保存する値は trim 後）", () => {
    const parsed = displayNameSchema.safeParse("  影丸  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("影丸");
  });

  test("改行・制御文字は弾く（一覧の1行に収まらない）", () => {
    for (const name of ["影\n丸", "影\t丸", "影\u0000丸", "影\u2028丸"]) {
      expect(displayNameSchema.safeParse(name).success).toBe(false);
    }
  });

  test("途中の空白や記号・絵文字は許す（一意でもない）", () => {
    for (const name of ["影 丸", "kage-maru_23", "🥷", "Ｋａｇｅ"]) {
      expect(displayNameSchema.safeParse(name).success).toBe(true);
    }
  });

  test("文字列以外は弾く", () => {
    expect(displayNameSchema.safeParse(123).success).toBe(false);
    expect(displayNameSchema.safeParse(null).success).toBe(false);
  });
});

describe("rankingRegisterSchema", () => {
  const ok = { themeId: "t1", form: "sentence", hits: 300, misses: 10, elapsedMs: 60_000 };

  test("生の値だけを受け取る（スコアは送られてきても無視する）", () => {
    const parsed = rankingRegisterSchema.safeParse({ ...ok, score: 9999 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty("score");
  });

  test("form を省略すると短文", () => {
    const { form: _form, ...rest } = ok;
    const parsed = rankingRegisterSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.form).toBe("sentence");
  });

  test("範囲外の記録は弾く（規則は playStatsRejection）", () => {
    // 短文の1プレイに満たない打鍵数
    expect(rankingRegisterSchema.safeParse({ ...ok, hits: 10 }).success).toBe(false);
    // 時間0
    expect(rankingRegisterSchema.safeParse({ ...ok, elapsedMs: 0 }).success).toBe(false);
    // 速すぎる
    expect(rankingRegisterSchema.safeParse({ ...ok, elapsedMs: 1000 }).success).toBe(false);
  });

  test("形式で範囲が変わる（単語なら80打鍵で足りる）", () => {
    expect(rankingRegisterSchema.safeParse({ ...ok, form: "word", hits: 80 }).success).toBe(true);
    expect(rankingRegisterSchema.safeParse({ ...ok, form: "sentence", hits: 80 }).success).toBe(
      false,
    );
  });

  test("elapsedMs は小数で来るので丸めて受ける（performance.now() の差）", () => {
    const parsed = rankingRegisterSchema.safeParse({ ...ok, elapsedMs: 61234.567 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.elapsedMs).toBe(61235);
  });

  test("範囲外の理由をそのまま返す", () => {
    const parsed = rankingRegisterSchema.safeParse({ ...ok, hits: 10 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toBe("打鍵数が範囲外です");
  });

  test("打鍵数の小数・負数、時間の文字列は弾く", () => {
    expect(rankingRegisterSchema.safeParse({ ...ok, hits: 300.5 }).success).toBe(false);
    expect(rankingRegisterSchema.safeParse({ ...ok, misses: -1 }).success).toBe(false);
    expect(rankingRegisterSchema.safeParse({ ...ok, elapsedMs: "60000" }).success).toBe(false);
    expect(rankingRegisterSchema.safeParse({ ...ok, elapsedMs: Number.NaN }).success).toBe(false);
  });
});
