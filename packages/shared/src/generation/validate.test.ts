import { describe, expect, test } from "bun:test";
import {
  containsKanji,
  countConstraint,
  findConstraintSpans,
  includesConstraint,
  isHiraganaOnlyWord,
  countSentenceEnds,
  isKeystrokeCountInRange,
  keystrokeRange,
  LONG_KEYSTROKE_MAX,
  LONG_KEYSTROKE_MIN,
  LONG_SENTENCE_MIN,
  isTypableText,
  isTypableWord,
  KEYSTROKE_MAX,
  KEYSTROKE_MIN,
  WORD_KEYSTROKE_MAX,
  WORD_KEYSTROKE_MIN,
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

  test("長文は1本で短文1プレイ分の範囲（250〜450）", () => {
    expect(keystrokeRange("long")).toEqual([LONG_KEYSTROKE_MIN, LONG_KEYSTROKE_MAX]);
    expect(isKeystrokeCountInRange(LONG_KEYSTROKE_MIN, "long")).toBe(true);
    expect(isKeystrokeCountInRange(LONG_KEYSTROKE_MAX, "long")).toBe(true);
    expect(isKeystrokeCountInRange(LONG_KEYSTROKE_MIN - 1, "long")).toBe(false);
    // 短文の範囲は長文では通らない
    expect(isKeystrokeCountInRange(KEYSTROKE_MAX, "long")).toBe(false);
  });

  test("文の終わりは 。！？ を数える（長文の区切りの検査）", () => {
    expect(countSentenceEnds("走る。揺れた！消えた？")).toBe(3);
    expect(countSentenceEnds("走る、揺れた、消えた")).toBe(0);
    expect(LONG_SENTENCE_MIN).toBe(2);
  });

  test("形式ごとの範囲は既定（短文）と一致する", () => {
    expect(keystrokeRange("sentence")).toEqual([KEYSTROKE_MIN, KEYSTROKE_MAX]);
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

/**
 * ひらがなだけのお題を弾く。打鍵は読み仮名に対して行うので「打てる」が、
 * 画面に出るのは表記の方で、漢字かな混じり文を読む練習から外れる。
 */
describe("containsKanji", () => {
  test.each(["座禅を組む。", "手裏剣が闇を裂いた。", "コーヒーを飲む。", "人々が集まる。"])(
    "%p は漢字を含む",
    (text) => {
      expect(containsKanji(text)).toBe(true);
    },
  );

  test.each([
    "ざぜんをくむ。",
    "しゅりけんがやみをさいた。",
    "コーヒーをのむ。",
    "ざあざあふるあめ、",
    "",
  ])("%p は漢字を含まない", (text) => {
    expect(containsKanji(text)).toBe(false);
  });
});

/**
 * 却下の条件ではなく**計測用**。「2回以上入れる」という指示が効いているかは、
 * 出てきたお題を数えないと分からない。
 */
describe("countConstraint", () => {
  test("読み仮名に現れた回数を数える", () => {
    expect(countConstraint("ざぜんをくむ", "ざ")).toBe(1);
    expect(countConstraint("ざあざあとざつおん", "ざ")).toBe(3);
    expect(countConstraint("しゅりけん", "ざ")).toBe(0);
  });

  test("複数文字の指定も数えられる", () => {
    expect(countConstraint("しゃりんがしゃべる", "しゃ")).toBe(2);
  });

  test("重なりは数えない", () => {
    // 「ささささ」に「ささ」は2回。1文字ずつずらして数えると3回になってしまう
    expect(countConstraint("ささささ", "ささ")).toBe(2);
  });

  test("空の指定は0（無限ループにしない）", () => {
    expect(countConstraint("ざぜん", "")).toBe(0);
  });

  test("includesConstraint と食い違わない", () => {
    expect(includesConstraint("ざぜん", "ざ")).toBe(countConstraint("ざぜん", "ざ") > 0);
    expect(includesConstraint("しゅりけん", "ざ")).toBe(countConstraint("しゅりけん", "ざ") > 0);
  });
});

/**
 * 字面では含まれていても、打つときには別のかなになる箇所を数えない。
 * 「で」の最適化に「でぃ」（`dhi`）、「き」の最適化に「きゃ」（`kya`）が混ざると、
 * 練習したい連接を打たないお題が採用される。
 */
describe("打鍵の単位で照合する", () => {
  test.each([
    ["でぃすく", "で"], // でぃ = dhi
    ["でゅえっと", "で"], // でゅ = dhu
    ["きゃく", "き"], // きゃ = kya
    ["きゅう", "き"],
    ["きょう", "き"],
    ["しゃつ", "し"], // しゃ = sha
    ["しぇふ", "し"],
    ["ちぇっく", "ち"],
    ["じゃま", "じ"],
    ["てぃっしゅ", "て"], // てぃ = thi
    ["ふぁいる", "ふ"], // ふぁ = fa
    ["うぉっか", "う"], // うぉ = who
    ["つぁーり", "つ"], // つぁ = tsa
    ["くぉーたー", "く"], // くぉ = qo
    ["とぅーる", "と"], // とぅ = twu
    ["ゔぁいおりん", "ゔ"], // ゔぁ = va
    ["にゃんこ", "に"],
    ["りょこう", "り"],
    ["ぴょん", "ぴ"],
  ])("「%s」に「%s」は当たらない（後ろの小書きと1単位になる）", (kana, constraint) => {
    expect(includesConstraint(kana, constraint)).toBe(false);
  });

  test("2文字以上の音も、最後のかなが後ろの小書きと組むなら当たらない", () => {
    // し / きゃ。「しき」の「き」は「きゃ」の一部
    expect(includesConstraint("しきゃ", "しき")).toBe(false);
    // でき / でぃ ではなく、で / き / でぃ。「でき」は当たる
    expect(includesConstraint("できでぃ", "でき")).toBe(true);
  });

  test("小書きで始まる音は、前のかなと組んだ箇所に当たらない", () => {
    expect(includesConstraint("きゃく", "ゃ")).toBe(false);
    expect(includesConstraint("でぃすく", "ぃ")).toBe(false);
    expect(includesConstraint("しゃしゃ", "ゃし")).toBe(false);
  });

  test("拗音・外来音そのものを指定すれば当たる", () => {
    expect(includesConstraint("でぃすく", "でぃ")).toBe(true);
    expect(includesConstraint("きゃく", "きゃ")).toBe(true);
    expect(includesConstraint("しゃしん", "しゃし")).toBe(true);
  });

  test("同じ読みの中に単独の箇所があれば当たる", () => {
    expect(includesConstraint("でぃすくで", "で")).toBe(true);
    expect(countConstraint("きゃくのきもち", "き")).toBe(1);
  });

  test("小書きでも、前と組まないもの（打鍵表に無い組）は単独のかなとして当たる", () => {
    // てゃ は打鍵表に無く、て / ゃ に切れる
    expect(includesConstraint("てゃ", "て")).toBe(true);
  });

  test("「っ」の前後の音は変わらない（「っき」の「き」は ki のまま）", () => {
    expect(includesConstraint("がっき", "き")).toBe(true);
    expect(includesConstraint("はっぴょう", "っぴょ")).toBe(true);
  });

  test("最後が「っ」の音は、次のかなの子音を借りる箇所だけに当たる", () => {
    expect(includesConstraint("きって", "きっ")).toBe(true); // kitte
    expect(includesConstraint("きっぷ", "きっ")).toBe(true); // kippu
    // 次が母音・記号・文末だと「っ」は ltu と単独で打つ
    expect(includesConstraint("きっ", "きっ")).toBe(false);
    expect(includesConstraint("きっ、", "きっ")).toBe(false);
    expect(includesConstraint("きっあ", "きっ")).toBe(false);
    expect(includesConstraint("きっっ", "きっ")).toBe(false);
  });

  test("「ん」は前後で n / nn が変わっても n から打つので区別しない", () => {
    expect(includesConstraint("かんい", "かん")).toBe(true); // kanni
    expect(includesConstraint("かんじ", "かん")).toBe(true); // kanji
  });
});

describe("findConstraintSpans", () => {
  test("かな単位の範囲を返す。拗音は1単位", () => {
    // で / ぃ ではなく でぃ / す / く / で
    expect(findConstraintSpans(["でぃ", "す", "く", "で"], "で")).toEqual([{ first: 3, last: 3 }]);
    expect(findConstraintSpans(["し", "きゃ", "く"], "きゃく")).toEqual([{ first: 1, last: 2 }]);
  });

  test("重なりは数えない", () => {
    expect(findConstraintSpans(["さ", "さ", "さ"], "ささ")).toEqual([{ first: 0, last: 1 }]);
  });

  test("空の指定は空（全部の位置に当てない）", () => {
    expect(findConstraintSpans(["ざ"], "")).toEqual([]);
  });
});

describe("単語の検証", () => {
  test("句読点を含む語は弾く（単語に句読点は現れない）", () => {
    expect(isTypableWord("手裏剣")).toBe(true);
    expect(isTypableWord("手裏剣。")).toBe(false);
    expect(isTypableWord("忍者、影")).toBe(false);
  });

  test("長音符と々は語の一部として通す", () => {
    expect(isTypableWord("ラーメン")).toBe(true);
    expect(isTypableWord("人々")).toBe(true);
  });

  test("打てない文字は短文と同じく弾く", () => {
    expect(isTypableWord("忍者（にんじゃ）")).toBe(false);
    expect(isTypableWord("ninja")).toBe(false);
  });

  /**
   * **単語に `containsKanji` を使わない。** 「ラーメン」のようなカタカナ語まで
   * 落ちる。狙いは「表記がひらがなだけの、読むまでもないお題」を弾くことなので、
   * 単語ではひらがな限定の側から判定する。
   */
  test("ひらがなだけの語を弾く。カタカナ語は通す", () => {
    expect(isHiraganaOnlyWord("にんじゃ")).toBe(true);
    expect(isHiraganaOnlyWord("らーめん")).toBe(true);
    expect(isHiraganaOnlyWord("ラーメン")).toBe(false);
    expect(isHiraganaOnlyWord("忍者")).toBe(false);
  });

  test("単語の打鍵数は短文より狭く、下限も上限も別に持つ", () => {
    expect(isKeystrokeCountInRange(WORD_KEYSTROKE_MIN, "word")).toBe(true);
    expect(isKeystrokeCountInRange(WORD_KEYSTROKE_MAX, "word")).toBe(true);
    expect(isKeystrokeCountInRange(WORD_KEYSTROKE_MIN - 1, "word")).toBe(false);
    expect(isKeystrokeCountInRange(WORD_KEYSTROKE_MAX + 1, "word")).toBe(false);
  });

  test("形式を渡さなければ短文の範囲（既存の呼び出しを壊さない）", () => {
    expect(isKeystrokeCountInRange(KEYSTROKE_MIN)).toBe(true);
    expect(isKeystrokeCountInRange(KEYSTROKE_MIN - 1)).toBe(false);
    // 短文で通る25打は、単語としては長すぎる
    expect(isKeystrokeCountInRange(25)).toBe(true);
    expect(isKeystrokeCountInRange(25, "word")).toBe(false);
  });
});
