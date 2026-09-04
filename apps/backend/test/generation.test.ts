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
  あ: "あ",
  "手裏剣が闇を裂いて標的を正確に射抜いた瞬間だった。":
    "しゅりけんがやみをさいてひょうてきをせいかくにいぬいたしゅんかんだった。",
};

/** AIの応答を差し替えた env。ラウンドごとに別の応答を返す */
interface PatchedLog {
  score?: number;
  metadata?: { rejected?: string };
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
      envWithAiResponses([["あ", "忍びは闇を走る。"], []]),
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
    expect(logs[0]?.metadata?.rejected).toBe("charset:1,keystroke:0,constraint:0");
    // 累積を渡していれば charset:2 になる
    expect(logs[1]?.metadata?.rejected).toBe("charset:1,keystroke:0,constraint:0");
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
