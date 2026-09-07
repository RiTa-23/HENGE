import { buildRomanCandidates } from "@henge/shared";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
// @ts-expect-error vite の ?raw インポート。テスト実行時に中身が文字列で展開される
import wranglerRaw from "../wrangler.jsonc?raw";
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

  it("既定は qwen3（速く安く安定。テーマ語の偏りは検証が弾くが、総称名のテーマでは失敗しうる）", () => {
    expect(DEFAULT_MODEL).toBe("@cf/qwen/qwen3-30b-a3b-fp8");
  });

  it("wrangler.jsonc の GENERATION_MODEL は既定モデルと一致する", () => {
    // **切り替えは二重管理になる。** モデルは model.ts の DEFAULT_MODEL と
    // wrangler.jsonc の vars の両方に現れる。片方だけ変えると、コードの変更が
    // 静かに無視される（実測: DEFAULT_MODEL を llama-4-scout に替えても、
    // vars に残った qwen3 が動き続けた）。不一致はここで落とす
    const config = JSON.parse(
      // コメントと末尾カンマを剥がしてから読む（jsonc をそのまま parse できない）
      wranglerRaw.replace(/\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"),
    );
    expect(config.vars.GENERATION_MODEL).toBe(DEFAULT_MODEL);
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
  "雨。": "あめ。",
  "月。": "つき。",
  "ざあざあとふるあめ。": "ざあざあとふるあめ。",
  "ざあざあと雑音。": "ざあざあとざつおん。",
  "しんしんと雪が降る。": "しんしんとゆきがふる。",
  "しんしんと夜が更ける。": "しんしんとよるがふける。",
  "しんしんと風が吹く。": "しんしんとかぜがふく。",
  "しんしんと雨が続く。": "しんしんとあめがつづく。",
  "手裏剣が闇を裂いて標的を正確に射抜いた瞬間だった。":
    "しゅりけんがやみをさいてひょうてきをせいかくにいぬいたしゅんかんだった。",
  // テーマ語の一極集中の再現用。テーマ「魚」の文は読みが「ぎょ」で始まる
  "魚は海と川にいる。": "ぎょはうみとかわにいる。",
  "川には魚がいる。": "かわにさかながいる。",
  "川底に沈む船。": "かわそこにしずむふね。",
  // 読みでテーマ語から始まる文。表記にはテーマ名「忍び」が現れない
  忍び: "しのび",
  "しのびの道は遠し。": "しのびのみちはとおし。",
  "影に潜む。": "かげにひそむ。",
  // 読みの先頭2かなが同じ文。表記は「型は／型が／型を／型に」と1文字目しか同じでない
  "型は力だ。": "かたはちからだ。",
  "型が道を開く。": "かたがみちをひらく。",
  "型を学ぶ。": "かたをまなぶ。",
  "型に惑わされるな。": "かたにまどわされるな。",
  "船は進む。": "ふねはすすむ。",
};

/** AIの応答を差し替えた env。ラウンドごとに別の応答を返す */
interface PatchedLog {
  score?: number;
  /** メタデータは5件までなので、内訳は counts 1つに畳んで入れる（ai.ts 参照） */
  metadata?: { counts?: string };
}

function envWithAiResponses(
  rounds: string[][],
  logs: PatchedLog[] = [],
  /** AIに送られたリクエスト（ヒント付きの2ラウンド目を検査するため） */
  inputs: { messages: { role: string; content: string }[] }[] = [],
): Env {
  // run は this 経由で状態を読む。レシーバを切り離して呼ばれたら落ちるようにして、
  // 本物の env.AI と同じ壊れ方をさせる（bind漏れを検出するため）
  const ai = {
    rounds,
    call: 0,
    async run(
      this: { rounds: string[][]; call: number },
      _model: string,
      input: { messages: { role: string; content: string }[] },
    ) {
      inputs.push(input);
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
    expect(readingCalls).toBe(2); // 弾いた分は読み取得を呼ばない（+テーマ名の読み取得1回）
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
    expect(readingCalls).toBe(2); // 弾いた分は読み取得を呼ばない（+テーマ名の読み取得1回）
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

  it("テーマ名で始まる文は採らない（テーマモード）", async () => {
    // テーマ「魚」で「魚は〜」が並んだ実態の再現。1文ごとに判定できる
    // 局所ルールとして、文頭のテーマ語を弾く
    const result = await generateBatch(
      envWithAiResponses([
        ["魚は海と川にいる。", "川には魚がいる。", "魚は川をさかのぼる。", "川底に沈む船。"],
        [],
      ]),
      input({ kind: "theme", name: "魚", target: 4 }),
    );

    expect(result.valid.map((v) => v.text)).toEqual(["川には魚がいる。", "川底に沈む船。"]);
    expect(result.rejected.themeStart).toBe(2);
  });

  it("読みでテーマ語から始まる文も採らない（表記に名前が現れないとき）", async () => {
    // テーマ「TypeScript」で「タイプスクリプトは〜」が20文並んだ実態の再現。
    // 表記にはテーマ名が現れないため、テーマ名の読みとの照合で弾く
    const result = await generateBatch(
      envWithAiResponses([["忍びの心得を持て。", "しのびの道は遠し。", "影に潜む。"], []]),
      input({ kind: "theme", name: "忍び", target: 3 }),
    );

    expect(result.valid.map((v) => v.text)).toEqual(["影に潜む。"]);
    expect(result.rejected.themeStart).toBe(2);
  });

  it("テーマ語の検査は「含む」モードでは適用しない", async () => {
    // 指定文字を含む・指定文字で始まるのは「含む」モードの仕様。
    // テーマ名の文頭検査を適用すると本末転倒
    const result = await generateBatch(
      envWithAiResponses([["座禅を組む。", "ざあざあと雑音。"], []]),
      input({ kind: "constraint", name: "ざ", target: 2 }),
    );

    expect(result.rejected.themeStart).toBe(0);
    expect(result.valid).toHaveLength(2);
  });

  it("読みの先頭2かなが同じ文は上限までしか採らない（表記が違っても）", async () => {
    // テーマ「TypeScript」で「型は〜」「型が〜」が並んだ実態の再現。
    // 表記の先頭文字では「型は／型が」が2文字目で分かれて拾えない。
    // 読み仮名（かたは／かたが）で見ると「かた」でまとまる
    const result = await generateBatch(
      envWithAiResponses([
        ["型は力だ。", "型が道を開く。", "型を学ぶ。", "型に惑わされるな。", "船は進む。"],
        [],
      ]),
      input({ kind: "theme", name: "海", target: 4 }),
    );

    expect(result.valid.map((v) => v.text)).not.toContain("型に惑わされるな。");
    expect(result.rejected.start).toBe(1);
  });

  it("2ラウンド目には、前回の却下理由のフィードバックを添える", async () => {
    // テーマ「魚」で文頭にテーマ語が並んだ実態の再現。直前の失敗への
    // フィードバックは、初手の指示より効く（docs/05-generation.md）
    const inputs: { messages: { role: string; content: string }[] }[] = [];
    const result = await generateBatch(
      envWithAiResponses(
        [
          ["魚は海と川にいる。", "魚は川をさかのぼる。", "魚は海で泳ぐ。"],
          ["川には魚がいる。", "川底に沈む船。"],
        ],
        [],
        inputs,
      ),
      input({ kind: "theme", name: "魚", target: 2 }),
    );

    expect(result.valid).toHaveLength(2);
    // 1ラウンド目にはヒントが無く、2ラウンド目には文頭禁止のフィードバックが乗る
    expect(inputs[0]?.messages[1]?.content).not.toContain("前回の短文は");
    expect(inputs[1]?.messages[1]?.content).toContain("テーマの名前「魚」以外の語から書き始めて");
  });

  it("却下が軽微ならフィードバックは添えない", async () => {
    const inputs: { messages: { role: string; content: string }[] }[] = [];
    await generateBatch(
      envWithAiResponses([["忍びは闇を走る。"], ["影が揺れた。"]], [], inputs),
      input({ target: 2 }),
    );

    expect(inputs[1]?.messages[1]?.content).not.toContain("前回の短文は");
  });

  it("打鍵数の却下が dominant なら長さのフィードバックを添える", async () => {
    const inputs: { messages: { role: string; content: string }[] }[] = [];
    await generateBatch(
      envWithAiResponses([["影。", "雨。", "月。"], ["忍びは闇を走る。"]], [], inputs),
      input({ target: 1 }),
    );

    expect(inputs[1]?.messages[1]?.content).toContain("8〜14文字程度に収めて");
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
    expect(logs[0]?.metadata?.counts).toBe(
      "charset:1,kanji:0,opening:0,keystroke:0,constraint:0,themeStart:0,start:0",
    );
    // 累積を渡していれば charset:2 になる
    expect(logs[1]?.metadata?.counts).toBe(
      "charset:1,kanji:0,opening:0,keystroke:0,constraint:0,themeStart:0,start:0",
    );
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
