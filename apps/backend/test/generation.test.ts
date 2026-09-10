import { buildRomanCandidates } from "@henge/shared";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { generateBatch, type GenerateBatchInput } from "../src/generation/batch";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  modelConfig,
  resolveModel,
} from "../src/generation/model";
import { parseGeneratedLines } from "../src/generation/prompt";
import type { GetReading } from "../src/reading/index";

describe("parseGeneratedLines", () => {
  it("1行1文に切る", () => {
    expect(parseGeneratedLines("忍びは走る。\n影が揺れた。")).toEqual([
      "忍びは走る。",
      "影が揺れた。",
    ]);
  });

  it("番号や箇条書き記号を落とす", () => {
    expect(parseGeneratedLines("1. 忍びは走る。\n- 影が揺れた。\n・闇に消えた。")).toEqual([
      "忍びは走る。",
      "影が揺れた。",
      "闇に消えた。",
    ]);
  });

  it("空行を無視する", () => {
    expect(parseGeneratedLines("忍び。\n\n\n影。")).toEqual(["忍び。", "影。"]);
  });
});

describe("resolveModel", () => {
  it("未知の値なら既定のモデルを使う", () => {
    expect(resolveModel(undefined)).toBe(DEFAULT_MODEL);
    expect(resolveModel("存在しないモデル")).toBe(DEFAULT_MODEL);
  });

  it("既知のモデル名はそのまま使える", () => {
    expect(resolveModel("@cf/meta/llama-3.1-8b-instruct-fp8")).toBe(
      "@cf/meta/llama-3.1-8b-instruct-fp8",
    );
  });

  it("既定は qwen3（速度・コスト・品質のバランスが最も良い）", () => {
    expect(DEFAULT_MODEL).toBe("@cf/qwen/qwen3-30b-a3b-fp8");
  });
});

describe("modelConfig", () => {
  it("qwen3 には /no_think が設定されている（思考を切ると速く安く品質も上がる）", () => {
    expect(modelConfig("@cf/qwen/qwen3-30b-a3b-fp8").promptSuffix).toBe("/no_think");
  });

  it("設定を持たないモデルには空の設定を返す", () => {
    expect(modelConfig("@cf/zai-org/glm-4.7-flash").promptSuffix).toBeUndefined();
    expect(modelConfig("存在しないモデル").promptSuffix).toBeUndefined();
  });

  it("glm は思考が長いので上限トークン数を大きく取る", () => {
    // 8件の生成で出力5,878トークンを使った実測がある。既定の4,000では本番の20件で足りない
    expect(modelConfig("@cf/zai-org/glm-4.7-flash").maxTokens).toBeGreaterThan(DEFAULT_MAX_TOKENS);
  });
});

/** 読みを返すだけの偽の実装。外部APIを呼ばない */
const fakeReading: GetReading = async (text) => {
  const kana = READINGS[text] ?? text;
  return { kana, roman: buildRomanCandidates(kana) };
};

const READINGS: Record<string, string> = {
  "忍びは闇を走る。": "しのびはやみをはしる。",
  "影が揺れた。": "かげがゆれた。",
  "座禅を組む。": "ざぜんをくむ。",
  "静寂が満ちる。": "せいじゃくがみちる。",
  // 打鍵数が下限（10打）に届かない素材。漢字を含めてあるのは、
  // kanji の段で先に弾かれると keystroke の検査に届かないため
  "影。": "かげ。",
  "ざあざあとふるあめ。": "ざあざあとふるあめ。",
  "ざあざあと雑音。": "ざあざあとざつおん。",
  "しんしんと雪が降る。": "しんしんとゆきがふる。",
  "しんしんと夜が更ける。": "しんしんとよるがふける。",
  "しんしんと風が吹く。": "しんしんとかぜがふく。",
  "しんしんと雨が続く。": "しんしんとあめがつづく。",
  "手裏剣が闇を裂いて標的を正確に射抜いた瞬間だった。":
    "しゅりけんがやみをさいてひょうてきをせいかくにいぬいたしゅんかんだった。",
};

/** AIの応答を差し替えた env。ラウンドごとに別の応答を返す */
interface PatchedLog {
  score?: number;
  /** メタデータは5件までなので、内訳は counts 1つに畳んで入れる（ai.ts 参照） */
  metadata?: { counts?: string };
}

function envWithAiResponses(rounds: string[][], logs: PatchedLog[] = []): Env {
  // run は this 経由で状態を読む。レシーバを切り離して呼ばれたら落ちるようにして、
  // 本物の env.AI と同じ壊れ方をさせる（bind漏れを検出するため）
  const ai = {
    rounds,
    call: 0,
    async run(this: { rounds: string[][]; call: number }) {
      return { response: (this.rounds[this.call++] ?? []).join("\n") };
    },
    aiGatewayLogId: "log-id",
    gateway: () => ({
      patchLog: async (_logId: string, data: PatchedLog) => {
        logs.push(data);
      },
    }),
  };
  return { ...env, AI: ai } as unknown as Env;
}

function input(overrides: Partial<GenerateBatchInput> = {}): GenerateBatchInput {
  return {
    kind: "theme",
    form: "sentence",
    name: "忍びの心得",
    themeId: "t1",
    path: "create",
    target: 2,
    existing: [],
    model: DEFAULT_MODEL,
    getReading: fakeReading,
    ...overrides,
  };
}

describe("generateBatch", () => {
  it("目標に達したら2ラウンド目を走らせない", async () => {
    const result = await generateBatch(
      envWithAiResponses([["忍びは闇を走る。", "影が揺れた。"], ["座禅を組む。"]]),
      input({ target: 2 }),
    );

    expect(result.rounds).toBe(1);
    expect(result.valid).toHaveLength(2);
    expect(result.reachedTarget).toBe(true);
  });

  it("目標未達ならもう1ラウンドだけ繰り返す", async () => {
    const result = await generateBatch(
      envWithAiResponses([["忍びは闇を走る。"], ["影が揺れた。"]]),
      input({ target: 2 }),
    );

    expect(result.rounds).toBe(2);
    expect(result.valid).toHaveLength(2);
  });

  it("2ラウンドでも届かなければ reachedTarget が false になる", async () => {
    const result = await generateBatch(
      envWithAiResponses([["忍びは闇を走る。"], ["影が揺れた。"]]),
      input({ target: 5 }),
    );

    expect(result.rounds).toBe(2);
    expect(result.reachedTarget).toBe(false);
  });

  it("使用できない文字は charset で却下する（読み取得を呼ばずに弾く）", async () => {
    let readingCalls = 0;
    const counting: GetReading = async (text) => {
      readingCalls++;
      return fakeReading(text);
    };

    const result = await generateBatch(
      envWithAiResponses([["「忍び」の心得", "忍びは闇を走る。"], []]),
      input({ target: 2, getReading: counting }),
    );

    expect(result.rejected.charset).toBe(1);
    expect(readingCalls).toBe(1); // 弾いた分は読み取得を呼ばない
  });

  it("打鍵数が範囲外なら keystroke で却下する", async () => {
    const result = await generateBatch(
      envWithAiResponses([["影。", "忍びは闇を走る。"], []]),
      input({ target: 2 }),
    );

    expect(result.rejected.keystroke).toBe(1);
    expect(result.valid.map((v) => v.text)).toEqual(["忍びは闇を走る。"]);
  });

  it("含むモードで指定文字が読みに無ければ constraint で却下する", async () => {
    const result = await generateBatch(
      envWithAiResponses([["座禅を組む。", "静寂が満ちる。"], []]),
      input({ kind: "constraint", name: "ざ", target: 2 }),
    );

    expect(result.rejected.constraint).toBe(1);
    expect(result.valid.map((v) => v.text)).toEqual(["座禅を組む。"]);
  });

  it("ひらがなだけの文は kanji で却下する（読み取得を呼ばずに弾く）", async () => {
    let readingCalls = 0;
    const counting: GetReading = async (text) => {
      readingCalls++;
      return fakeReading(text);
    };

    const result = await generateBatch(
      envWithAiResponses([["ざあざあとふるあめ。", "忍びは闇を走る。"], []]),
      input({ target: 2, getReading: counting }),
    );

    expect(result.rejected.kanji).toBe(1);
    expect(result.valid.map((v) => v.text)).toEqual(["忍びは闇を走る。"]);
    expect(readingCalls).toBe(1); // 弾いた分は読み取得を呼ばない
  });

  it("含むモードでは、指定文字を2回以上含む採用数を記録する", async () => {
    const logs: PatchedLog[] = [];
    await generateBatch(
      // 「ざぜんをくむ。」は1回、「ざあざあとざつおん。」は3回
      envWithAiResponses([["座禅を組む。", "ざあざあと雑音。"], []], logs),
      input({ kind: "constraint", name: "ざ", target: 2 }),
    );

    expect(logs[0]?.metadata?.counts).toContain("twice:1");
  });

  it("テーマモードでは2回以上の計測を記録しない（意味を持たないため）", async () => {
    const logs: PatchedLog[] = [];
    await generateBatch(envWithAiResponses([["忍びは闇を走る。"], []], logs), input({ target: 1 }));

    expect(logs[0]?.metadata?.counts).not.toContain("twice");
  });

  it("同じ書き出しの文は上限までしか採らない（型の量産を止める）", async () => {
    // 実測で起きた壊れ方の再現。「しんしんと〜」だけで21件中14件を埋めてきた。
    // 完全一致ではないので seen は素通りし、そのままプールに入ってしまう
    const result = await generateBatch(
      envWithAiResponses([
        [
          "しんしんと雪が降る。",
          "しんしんと夜が更ける。",
          "しんしんと風が吹く。",
          "しんしんと雨が続く。",
        ],
        [],
      ]),
      input({ target: 4 }),
    );

    expect(result.valid).toHaveLength(3);
    expect(result.rejected.opening).toBe(1);
  });

  it("書き出しの重なりはラウンドをまたいで数える", async () => {
    const result = await generateBatch(
      envWithAiResponses([
        ["しんしんと雪が降る。", "しんしんと夜が更ける。"],
        ["しんしんと風が吹く。", "しんしんと雨が続く。"],
      ]),
      input({ target: 4 }),
    );

    expect(result.valid).toHaveLength(3);
    expect(result.rejected.opening).toBe(1);
  });

  it("既存お題の書き出しは数えない（偏ったプールに塞がれて補充が失敗するため）", async () => {
    // 止めたいのは「1回の生成が1つの型で埋まる」ことで、過去のプールに何本あるかは別の話。
    // 既存を数えると、同じ書き出しが23本あるプール（実測）では補充が丸ごと失敗する
    const result = await generateBatch(
      envWithAiResponses([["しんしんと雪が降る。", "忍びは闇を走る。"], []]),
      input({
        target: 2,
        existing: ["しんしんと夜が更ける。", "しんしんと風が吹く。", "しんしんと雨が続く。"],
      }),
    );

    expect(result.valid.map((v) => v.text)).toEqual(["しんしんと雪が降る。", "忍びは闇を走る。"]);
    expect(result.rejected.opening).toBe(0);
  });

  it("既存お題と重複するものは除外する", async () => {
    const result = await generateBatch(
      envWithAiResponses([["忍びは闇を走る。", "影が揺れた。"], []]),
      input({ target: 2, existing: ["忍びは闇を走る。"] }),
    );

    expect(result.valid.map((v) => v.text)).toEqual(["影が揺れた。"]);
  });

  it("却下数はラウンドごとに記録する（累積を渡すと2ラウンド目で二重計上される）", async () => {
    const logs: PatchedLog[] = [];
    await generateBatch(
      envWithAiResponses(
        [
          // 1ラウンド目: 有効1件・charset却下1件
          ["忍びは闇を走る。", "「打てない記号」"],
          // 2ラウンド目: 有効1件・charset却下1件
          ["影が揺れた。", "（これも打てない）"],
        ],
        logs,
      ),
      input({ target: 3 }), // 到達しないので必ず2ラウンド走る
    );

    expect(logs).toHaveLength(2);
    expect(logs[0]?.metadata?.counts).toBe("charset:1,kanji:0,opening:0,keystroke:0,constraint:0");
    // 累積を渡していれば charset:2 になる
    expect(logs[1]?.metadata?.counts).toBe("charset:1,kanji:0,opening:0,keystroke:0,constraint:0");
  });

  it("有効なお題は読みと打鍵数を持って返る", async () => {
    const result = await generateBatch(
      envWithAiResponses([["忍びは闇を走る。"], []]),
      input({ target: 1 }),
    );

    const [first] = result.valid;
    expect(first?.readingKana).toBe("しのびはやみをはしる。");
    expect(first?.keystrokeCount).toBeGreaterThanOrEqual(10);
    expect(JSON.parse(first?.readingRomanJson ?? "[]")[0]).toContain("shi");
  });
});

/** 単語の読み。漢字はテーブルに無いので、テスト側で読みを与える */
const wordReading: GetReading = async (text) => {
  const kana = { 忍者: "にんじゃ", 城: "しろ", ラーメン: "らーめん" }[text] ?? text;
  return { kana, roman: buildRomanCandidates(kana) };
};

describe("単語モードの検証", () => {
  /** 単語は句読点を許さない。短文の文字種で通すと文の断片が混ざる */
  it("句読点の付いた語を charset として却下する", async () => {
    const result = await generateBatch(envWithAiResponses([["忍者", "手裏剣。", "城"]]), {
      ...input({ form: "word", target: 3 }),
      getReading: wordReading,
    });

    expect(result.valid.map((p) => p.text)).toEqual(["忍者", "城"]);
    expect(result.rejected.charset).toBe(1);
  });

  /**
   * **単語に「漢字を1つ以上」は使えない。**「ラーメン」のようなカタカナ語まで
   * 落ちる。ひらがなだけの語を弾く側から判定する
   */
  it("カタカナ語は通し、ひらがなだけの語を却下する", async () => {
    const result = await generateBatch(envWithAiResponses([["ラーメン", "にんじゃ"]]), {
      ...input({ form: "word", target: 2 }),
      getReading: wordReading,
    });

    expect(result.valid.map((p) => p.text)).toEqual(["ラーメン"]);
    expect(result.rejected.kanji).toBe(1);
  });
});
