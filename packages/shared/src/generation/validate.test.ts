import { describe, expect, test } from "bun:test";
import {
  includesConstraint,
  isKeystrokeCountInRange,
  isTypableText,
  KEYSTROKE_MAX,
  KEYSTROKE_MIN,
} from "./validate";

describe("isTypableText", () => {
  test("ひらがな・カタカナ・漢字を通す", () => {
    expect(isTypableText("手裏剣が闇を裂いた")).toBe(true);
    expect(isTypableText("シュリケン")).toBe(true);
    expect(isTypableText("しのび")).toBe(true);
  });

  test("記号5種を通す", () => {
    expect(isTypableText("忍びよ、闇に消えよ。")).toBe(true);
    expect(isTypableText("参るぞ！")).toBe(true);
    expect(isTypableText("敵か？")).toBe(true);
    expect(isTypableText("スピード")).toBe(true);
  });

  test("々を通す（人々・時々のような語に必要。読みには現れない）", () => {
    expect(isTypableText("人々が集う")).toBe(true);
  });

  test("日本語だがキーボードで打てない記号を弾く", () => {
    expect(isTypableText("「忍び」の心得")).toBe(false); // 鉤括弧
    expect(isTypableText("忍び（しのび）")).toBe(false); // 全角括弧
    expect(isTypableText("闇〜夜")).toBe(false); // 波ダッシュ
    expect(isTypableText("忍・者")).toBe(false); // 中黒
    expect(isTypableText("心得：一")).toBe(false); // 全角コロン
  });

  test("英数字・空白を弾く", () => {
    expect(isTypableText("ninja")).toBe(false);
    expect(isTypableText("忍者123")).toBe(false);
    expect(isTypableText("忍び の 心得")).toBe(false);
    expect(isTypableText("忍び　の心得")).toBe(false); // 全角スペース
  });

  test("空文字を弾く", () => {
    expect(isTypableText("")).toBe(false);
  });
});

describe("isKeystrokeCountInRange", () => {
  test("境界値を含む", () => {
    expect(isKeystrokeCountInRange(KEYSTROKE_MIN)).toBe(true);
    expect(isKeystrokeCountInRange(KEYSTROKE_MAX)).toBe(true);
  });

  test("範囲外を弾く", () => {
    expect(isKeystrokeCountInRange(KEYSTROKE_MIN - 1)).toBe(false);
    expect(isKeystrokeCountInRange(KEYSTROKE_MAX + 1)).toBe(false);
  });
});

describe("includesConstraint", () => {
  test("読み仮名に含まれていれば通る", () => {
    expect(includesConstraint("ざぜんをくむ", "ざ")).toBe(true);
  });

  test("表記に現れていなくてよい（座禅の読みは ざぜん）", () => {
    // 判定対象は表記ではなく読み仮名
    expect(includesConstraint("ざぜん", "ざ")).toBe(true);
  });

  test("含まれていなければ弾く", () => {
    expect(includesConstraint("せいじゃく", "ざ")).toBe(false);
  });

  test("結合濁点で書かれた指定文字でも一致する", () => {
    expect(includesConstraint("がま", "が")).toBe(true);
  });

  test("複数文字の指定にも対応する", () => {
    expect(includesConstraint("しゃりん", "しゃ")).toBe(true);
    expect(includesConstraint("しりん", "しゃ")).toBe(false);
  });
});
