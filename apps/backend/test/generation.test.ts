import { buildRomanCandidates } from "@henge/shared";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  acceptsPartialBatch,
  generateBatch,
  type GenerateBatchInput,
  N_REQUEST,
  N_REQUEST_LONG,
  N_REQUEST_WORD,
  requestCount,
  wordGroupsFor,
} from "../src/generation/batch";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  modelConfig,
  resolveModel,
} from "../src/generation/model";
import {
  buildGenerationPrompt,
  parseGeneratedBlocks,
  parseGeneratedLines,
} from "../src/generation/prompt";
import { buildModerationRequest, type ModerateOutputs } from "../src/generation/moderation";
import { AiUnavailableError } from "../src/generation/ai";
import { MIX_VOCABULARY_SIZE, mixVocabulary, vocabularyFor } from "../src/generation/vocabulary";
import { fromSingle, type GetReading } from "./fake-readings";

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

describe("parseGeneratedBlocks（長文）", () => {
  it("空行で1本ずつに切り、本の中の改行は繋ぐ", () => {
    expect(
      parseGeneratedBlocks("忍びは走る。\n影が揺れた。\n\n闇に消えた。\n夜が明けた。"),
    ).toEqual(["忍びは走る。影が揺れた。", "闇に消えた。夜が明けた。"]);
  });

  it("空行が無ければ全体を1本と見なす", () => {
    expect(parseGeneratedBlocks("忍びは走る。\n影が揺れた。")).toEqual([
      "忍びは走る。影が揺れた。",
    ]);
  });

  /**
   * モデルは1文ごとに改行して「。」を落とすことがある（実測: 「〜イベントだ／参加者は〜」）。
   * そのまま繋ぐと区切りの無い文章になるので、行末に「。」を補う
   */
  it("「。」の無い行末には「。」を補い、「、」で終わる行（文の途中）には足さない", () => {
    expect(parseGeneratedBlocks("忍びは走る\n影が揺れた！\n闇に、\n消えた")).toEqual([
      "忍びは走る。影が揺れた！闇に、消えた。",
    ]);
  });

  it("番号や箇条書き記号、空白だけの行を落とす", () => {
    expect(parseGeneratedBlocks("1. 忍びは走る。\n  \n\n- 影が揺れた。")).toEqual([
      "忍びは走る。",
      "影が揺れた。",
    ]);
  });
});

describe("最適化の生成（語を渡して文を作らせる）", () => {
  it("語彙から選んだ語を組にしてプロンプトに載せる。指定の音そのものは書かない", async () => {
    const prompts: string[] = [];
    await generateBatch(
      envCapturingPrompts([[], []], prompts),
      input({ kind: "constraint", name: "ざ", target: 1, vocabulary: ZA_WORDS }),
    );

    const words = wordsInPrompt(prompts[0] ?? "");
    expect(words).toHaveLength(N_REQUEST * 2);
    const known = new Set(ZA_WORDS.map((w) => w.text));
    for (const word of words) expect(known.has(word)).toBe(true);
    // 書くと、渡した語を無視してその音で書き始める癖が戻る
    expect(prompts[0]).not.toContain("「ざ」");
  });

  it("1回の生成の中では、2ラウンド目に1ラウンド目と同じ語を渡さない", async () => {
    const prompts: string[] = [];
    await generateBatch(
      envCapturingPrompts([[], []], prompts),
      input({ kind: "constraint", name: "ざ", target: 1, vocabulary: ZA_WORDS }),
    );

    expect(prompts).toHaveLength(2);
    const first = new Set(wordsInPrompt(prompts[0] ?? ""));
    for (const word of wordsInPrompt(prompts[1] ?? "")) expect(first.has(word)).toBe(false);
  });

  it("生成ごとに選ぶ語が変わる（ランダム）", async () => {
    const a: string[] = [];
    const b: string[] = [];
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const base = { kind: "constraint" as const, name: "ざ", target: 1, vocabulary: ZA_WORDS };
    await generateBatch(envCapturingPrompts([[], []], a), input({ ...base, random }));
    await generateBatch(envCapturingPrompts([[], []], b), input({ ...base, random }));

    expect(wordsInPrompt(a[0] ?? "")).not.toEqual(wordsInPrompt(b[0] ?? ""));
  });

  it("語彙が空なら AI を呼ばずに終わる（ニューロンを使わない）", async () => {
    const prompts: string[] = [];
    let recorded = 0;
    const result = await generateBatch(envCapturingPrompts([[], []], prompts), {
      ...input({ kind: "constraint", name: "を", target: 1, vocabulary: [] }),
      onNeurons: () => {
        recorded++;
      },
    });

    expect(prompts).toHaveLength(0);
    expect(recorded).toBe(0);
    expect(result).toMatchObject({ rounds: 0, neurons: 0, reachedTarget: false });
  });

  it("語が足りなければ先頭に戻って使い回す", () => {
    const words = [
      { text: "座席", reading: "ざせき" },
      { text: "雑誌", reading: "ざっし" },
      { text: "財布", reading: "さいふ" },
    ];
    expect(wordGroupsFor(words, 1, 2, 2)).toEqual([
      ["座席", "雑誌"],
      ["財布", "座席"],
    ]);
    expect(wordGroupsFor(words, 2, 2, 2)).toEqual([
      ["雑誌", "財布"],
      ["座席", "雑誌"],
    ]);
  });

  it("3語の案では「2語以上を選んで使う」と指示する", () => {
    const { user } = buildGenerationPrompt({
      kind: "constraint",
      name: "ざ",
      count: 1,
      existing: [],
      wordGroups: [["座席", "雑誌", "財産"]],
      wordsPerSentence: 3,
    });
    expect(user).toContain("2語以上");
    expect(user).toContain("座席／雑誌／財産");
  });
});

describe("おまかせ・ごちゃまぜの生成（最適化と同じく語を渡して文を作らせる）", () => {
  it("おまかせは1文に1語を渡し、その語を使わせる", async () => {
    const prompts: string[] = [];
    await generateBatch(
      envCapturingPrompts([[], []], prompts),
      input({ kind: "mix", name: "おまかせ", target: 1, vocabulary: mixVocabulary() }),
    );

    const lines = groupLinesInPrompt(prompts[0] ?? "");
    expect(lines).toHaveLength(N_REQUEST);
    for (const line of lines) expect(line).not.toContain("／");
    expect(prompts[0]).toContain("各行の語を、文の中で使う");
  });

  it("ごちゃまぜは1文に2語を渡し、両方を使わせる", async () => {
    const prompts: string[] = [];
    await generateBatch(
      envCapturingPrompts([[], []], prompts),
      input({ kind: "mix", name: "ごちゃまぜ", target: 1, vocabulary: mixVocabulary() }),
    );

    const lines = groupLinesInPrompt(prompts[0] ?? "");
    expect(lines).toHaveLength(N_REQUEST);
    for (const line of lines) expect(line.split("／")).toHaveLength(2);
    expect(prompts[0]).toContain("各行の2語を、両方とも文の中で使う");
  });

  it("超ごちゃまぜは1文に3語を渡し、3語すべてを使わせる（最適化の3語案のように選ばせない）", async () => {
    const prompts: string[] = [];
    await generateBatch(
      envCapturingPrompts([[], []], prompts),
      input({ kind: "mix", name: "超ごちゃまぜ", target: 1, vocabulary: mixVocabulary() }),
    );

    const lines = groupLinesInPrompt(prompts[0] ?? "");
    expect(lines).toHaveLength(N_REQUEST);
    for (const line of lines) expect(line.split("／")).toHaveLength(3);
    expect(prompts[0]).toContain("各行の3語を、すべて文の中で使う");
    expect(prompts[0]).not.toContain("2語以上");
  });

  it("共通リストの上から MIX_VOCABULARY_SIZE 語を使う", () => {
    const words = mixVocabulary();
    expect(words).toHaveLength(MIX_VOCABULARY_SIZE);
    // よく使われる順の先頭から取る（珍しい語の組で文が不自然にならないように）
    expect(words.slice(0, 3).map((w) => w.text)).toEqual(["自分", "時間", "思う"]);
    for (const word of words) {
      expect(word.text.length).toBeGreaterThan(0);
      expect(word.reading.length).toBeGreaterThan(0);
    }
  });

  it("語彙から2語ずつ組にしてプロンプトに載せる", async () => {
    const prompts: string[] = [];
    await generateBatch(
      envCapturingPrompts([[], []], prompts),
      input({ kind: "mix", name: "ごちゃまぜ", target: 1, vocabulary: mixVocabulary() }),
    );

    const words = wordsInPrompt(prompts[0] ?? "");
    expect(words).toHaveLength(N_REQUEST * 2);
    const known = new Set(mixVocabulary().map((w) => w.text));
    for (const word of words) expect(known.has(word)).toBe(true);
    // 名前は語ではないので載せない（テーマのように「ごちゃまぜ」に沿わせない）
    expect(prompts[0]).not.toContain("ごちゃまぜ");
  });

  it("指定の連接を見ない（読みに何が入っていても constraint で却下しない）", async () => {
    const result = await generateBatch(
      envWithAiResponses([["座禅を組む。", "静寂が満ちる。"], []]),
      input({ kind: "mix", name: "ごちゃまぜ", target: 2, vocabulary: mixVocabulary() }),
    );

    expect(result.rejected.constraint).toBe(0);
    expect(result.valid.map((v) => v.text)).toEqual(["座禅を組む。", "静寂が満ちる。"]);
  });

  it("語彙が空なら AI を呼ばずに終わる（ニューロンを使わない）", async () => {
    const prompts: string[] = [];
    const result = await generateBatch(
      envCapturingPrompts([[], []], prompts),
      input({ kind: "mix", name: "ごちゃまぜ", target: 1, vocabulary: [] }),
    );

    expect(prompts).toHaveLength(0);
    expect(result).toMatchObject({ rounds: 0, neurons: 0, reachedTarget: false });
  });
});

describe("形式ごとの生成の規則", () => {
  it("1ラウンドの依頼数は単語40・短文20・長文5で、読み Worker の上限（40）を超えない", () => {
    expect(requestCount("long")).toBe(N_REQUEST_LONG);
    expect(requestCount("sentence")).toBe(N_REQUEST);
    expect(requestCount("word")).toBe(N_REQUEST_WORD);
    expect(N_REQUEST_LONG * 2).toBeLessThanOrEqual(50);
    // 読み取得は1ラウンド1回のバッチ呼び出しなので、依頼数は MAX_TEXTS を超えられない
    for (const form of ["sentence", "word", "long"] as const) {
      expect(requestCount(form)).toBeLessThanOrEqual(40);
    }
  });

  it("単語と長文は取れた分を保存し、短文は目標未達で失敗にする", () => {
    expect(acceptsPartialBatch("sentence")).toBe(false);
    expect(acceptsPartialBatch("word")).toBe(true);
    expect(acceptsPartialBatch("long")).toBe(true);
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

/** 最適化の語彙。共通語彙リストから本物を取る（最低100語） */
const ZA_WORDS = vocabularyFor("ざ");

/** AIへの依頼（ユーザー側のメッセージ）を記録する env。応答はラウンドごとに返す */
function envCapturingPrompts(rounds: string[][], prompts: string[]): Env {
  let call = 0;
  const ai = {
    async run(_model: string, body: { messages: { role: string; content: string }[] }) {
      prompts.push(body.messages.find((m) => m.role === "user")?.content ?? "");
      return { response: (rounds[call++] ?? []).join("\n") };
    },
    aiGatewayLogId: "log-id",
    gateway: () => ({ patchLog: async () => {} }),
  };
  return { ...env, AI: ai } as unknown as Env;
}

/** プロンプトの「語の組:」以降の行（1行＝1文に渡す組） */
function groupLinesInPrompt(prompt: string): string[] {
  return prompt
    .slice(prompt.indexOf("語の組:") + "語の組:".length)
    .trim()
    .split("\n")
    .filter((line) => !line.startsWith("/"));
}

/** プロンプトの「語の組:」以降に並んだ語 */
function wordsInPrompt(prompt: string): string[] {
  return (
    prompt
      .slice(prompt.indexOf("語の組:") + "語の組:".length)
      .trim()
      .split("\n")
      // 末尾にはモデル固有の指示（qwen3 の /no_think）が付く
      .filter((line) => !line.startsWith("/"))
      .flatMap((line) => line.split("／"))
  );
}

/** 生成お題の判定を、すべて通す（判定そのものは別の describe で見る） */
const allowAll: GenerateBatchInput["moderate"] = async ({ texts }) => texts.map(() => true);

function input(overrides: Partial<GenerateBatchInput> = {}): GenerateBatchInput {
  return {
    moderate: allowAll,
    kind: "theme",
    form: "sentence",
    name: "忍びの心得",
    themeId: "t1",
    path: "create",
    target: 2,
    existing: [],
    model: DEFAULT_MODEL,
    getReadings: fromSingle(fakeReading),
    ...overrides,
  };
}

/** 判定の依頼を記録し、`reject` に入っている文だけ弾く。1回ごとに 0.5 ニューロン使ったことにする */
function recordingModerate(reject: string[], calls: Parameters<ModerateOutputs>[0][]) {
  const moderate: ModerateOutputs = async (request) => {
    calls.push(request);
    await request.onNeurons(0.5);
    return request.texts.map((text) => !reject.includes(text));
  };
  return moderate;
}

/** 判定が例外で止まる（判断モデルを呼べなかった） */
const failingModerate: ModerateOutputs = async () => {
  throw new AiUnavailableError("判断モデルを呼べなかった");
};

describe("generateBatch（生成お題の判定）", () => {
  it("判定で弾いたお題は採用せず、moderate に数える", async () => {
    const calls: Parameters<ModerateOutputs>[0][] = [];
    const result = await generateBatch(
      envWithAiResponses([["忍びは闇を走る。", "影が揺れた。", "座禅を組む。"], []]),
      input({ target: 3, moderate: recordingModerate(["影が揺れた。"], calls) }),
    );

    expect(result.valid.map((p) => p.text)).toEqual(["忍びは闇を走る。", "座禅を組む。"]);
    expect(result.rejected.moderate).toBe(1);
  });

  it("判定は1ラウンド1回で、無料の検査と読み取得を通った分だけを渡す", async () => {
    const calls: Parameters<ModerateOutputs>[0][] = [];
    await generateBatch(
      envWithAiResponses([["「忍び」の心得", "忍びは闇を走る。"], ["影が揺れた。"]]),
      input({ target: 2, moderate: recordingModerate([], calls) }),
    );

    // 1ラウンド目の「「忍び」の心得」は文字種で落ちるので渡さない
    expect(calls.map((c) => c.texts)).toEqual([["忍びは闇を走る。"], ["影が揺れた。"]]);
    expect(calls.map((c) => c.round)).toEqual([1, 2]);
    expect(calls[0]).toMatchObject({ kind: "theme", form: "sentence", name: "忍びの心得" });
  });

  it("判定の消費も onNeurons で記録し、合計に含める（不変条件11）", async () => {
    const recorded: number[] = [];
    const result = await generateBatch(
      envWithAiResponses([["忍びは闇を走る。"], []]),
      input({
        target: 1,
        moderate: recordingModerate([], []),
        onNeurons: (used) => {
          recorded.push(used);
        },
      }),
    );

    // 生成（応答にトークン数が無いので0）と判定（0.5）
    expect(recorded).toEqual([0, 0.5]);
    expect(result.neurons).toBeCloseTo(0.5);
  });

  /** **判定できなければ通さない。** 例外のまま外へ伝え、呼び出し側が AI_UNAVAILABLE にする */
  it("判定が例外で止まったら、採用せずに投げ直す（生成の消費は記録済み）", async () => {
    const recorded: number[] = [];

    await expect(
      generateBatch(
        envWithAiResponses([["忍びは闇を走る。"], []]),
        input({
          target: 1,
          moderate: failingModerate,
          onNeurons: (used) => {
            recorded.push(used);
          },
        }),
      ),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    expect(recorded).toHaveLength(1);
  });
});

describe("buildModerationRequest", () => {
  it("生成お題は、判定基準を state に1回だけ置き、問いには候補の文だけ書く（#333）", () => {
    const request = buildModerationRequest("@cf/cloudflare/clef-flash", {
      type: "output",
      form: "word",
      texts: ["手裏剣", "城"],
      theme: "忍者",
    });

    expect(request.model).toBe("clef-flash");
    expect(request.state).toMatchObject({
      種類: "単語のお題",
      テーマ: "忍者",
      候補: { q0: "手裏剣", q1: "城" },
    });
    expect(request.state).toHaveProperty("判定基準");
    const questions = request.questions as Record<string, { instructions: string }>;
    expect(questions.q1?.instructions).toBe(
      "候補 q1「城」を、判定基準に照らして公開一覧にそのまま載せてよいか。",
    );
  });

  it("入力は、判定基準を問いに書く（#330 で測った形）", () => {
    const request = buildModerationRequest("@cf/cloudflare/clef", {
      type: "input",
      kind: "constraint",
      name: "ざ",
    });

    expect(request.model).toBe("clef");
    expect(request.state).not.toHaveProperty("判定基準");
    expect(request.questions.q0?.instructions).toContain("最適化する音");
    expect(request.questions.q0?.instructions).toContain("載せてはいけない");
  });
});

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
      input({ target: 2, getReadings: fromSingle(counting) }),
    );

    expect(result.rejected.charset).toBe(1);
    expect(readingCalls).toBe(1); // 弾いた分は読み取得を呼ばない
  });

  it("依頼した件数より多く返っても、読み取得には依頼した件数までしか渡さない（読み Worker の上限）", async () => {
    const sizes: number[] = [];
    // 書き出しの重なりで弾かれないよう、1文字目を変える
    const lines = Array.from(
      { length: 60 },
      (_, i) => `${String.fromCodePoint(0x4e00 + i)}は闇を走る。`,
    );
    const reading = fromSingle(async () => fakeReading("忍びは闇を走る。"));
    const result = await generateBatch(envWithAiResponses([lines, lines]), {
      ...input({ target: 100 }),
      getReadings: async (texts) => {
        sizes.push(texts.length);
        return reading(texts);
      },
    });

    expect(sizes[0]).toBe(N_REQUEST);
    for (const size of sizes) expect(size).toBeLessThanOrEqual(N_REQUEST);
    // 枠を超えた行は数えずに捨てる（seen に入れない）ので、2ラウンド目で採られうる
    expect(result.valid.length).toBeLessThanOrEqual(N_REQUEST * result.rounds);
  });

  it("前置きの行は件数に数えない（20文の前に前置きが1行あっても20文とも検査する）", async () => {
    const sentences = Array.from(
      { length: N_REQUEST },
      (_, i) => `${String.fromCodePoint(0x4e00 + i)}は闇を走る。`,
    );
    // 実測で出た前置き。「〜個」の数字が文字種で落ちる
    const preamble = "提供された語を使って自然な日本語の短文を20個作成します。";
    const reading = fromSingle(async () => fakeReading("忍びは闇を走る。"));
    const result = await generateBatch(
      envWithAiResponses([[preamble, ...sentences]]),
      input({ target: N_REQUEST, getReadings: reading }),
    );

    expect(result.rejected.charset).toBe(1);
    expect(result.valid.map((p) => p.text)).toEqual(sentences);
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
      input({ kind: "constraint", name: "ざ", target: 2, vocabulary: ZA_WORDS }),
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
      input({ target: 2, getReadings: fromSingle(counting) }),
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
      input({ kind: "constraint", name: "ざ", target: 2, vocabulary: ZA_WORDS }),
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

  it("NG 語の入ったお題は ng で却下する（テーマでも検査する）", async () => {
    const result = await generateBatch(
      envWithAiResponses([["夜道で痴漢に遭った。", "影が揺れた。"], []]),
      input({ target: 1 }),
    );
    expect(result.valid.map((v) => v.text)).toEqual(["影が揺れた。"]);
    expect(result.rejected.ng).toBe(1);
  });

  it("NG 語は単語でも見る", async () => {
    const word = await generateBatch(envWithAiResponses([["ポルノ"]]), {
      ...input({ form: "word", target: 1 }),
    });
    expect(word.rejected.ng).toBe(1);
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
      "charset:1,kanji:0,opening:0,keystroke:0,constraint:0,punct:0,ng:0,moderate:0,dup:0",
    );
    // 累積を渡していれば charset:2 になる
    expect(logs[1]?.metadata?.counts).toBe(
      "charset:1,kanji:0,opening:0,keystroke:0,constraint:0,punct:0,ng:0,moderate:0,dup:0",
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

/** 単語の読み。漢字はテーブルに無いので、テスト側で読みを与える */
const wordReading: GetReading = async (text) => {
  const kana =
    { 忍者: "にんじゃ", 城: "しろ", 手裏剣: "しゅりけん", ラーメン: "らーめん" }[text] ?? text;
  return { kana, roman: buildRomanCandidates(kana) };
};

describe("単語モードの検証", () => {
  /** 単語は句読点を許さない。短文の文字種で通すと文の断片が混ざる */
  it("句読点の付いた語を charset として却下する", async () => {
    const result = await generateBatch(envWithAiResponses([["忍者", "手裏剣。", "城"]]), {
      ...input({ form: "word", target: 3 }),
      getReadings: fromSingle(wordReading),
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
      getReadings: fromSingle(wordReading),
    });

    expect(result.valid.map((p) => p.text)).toEqual(["ラーメン"]);
    expect(result.rejected.kanji).toBe(1);
  });
});

describe("長文の検証", () => {
  const sentence = "手裏剣が闇を裂いて標的を正確に射抜いた瞬間だった。";
  /** 文ごとに READINGS を引いて繋ぐ。長文は既知の文の繰り返しで作る */
  const longReading: GetReading = async (text) => {
    const kana = text
      .split("。")
      .filter((part) => part.length > 0)
      .map((part) => READINGS[`${part}。`] ?? `${part}。`)
      .join("");
    return { kana, roman: buildRomanCandidates(kana) };
  };

  it("空行区切りの応答を1本ずつ受け、打鍵数250〜450の本だけを採る", async () => {
    // 1文≒56打。6文で約336打（範囲内）、2文で約112打（下限未満）
    const okBody = sentence.repeat(6);
    const shortBody = sentence.repeat(2);
    const result = await generateBatch(envWithAiResponses([[`${okBody}\n\n${shortBody}`]]), {
      ...input({ form: "long", target: 1 }),
      getReadings: fromSingle(longReading),
    });

    expect(result.valid.map((p) => p.text)).toEqual([okBody]);
    expect(result.valid[0]?.keystrokeCount).toBeGreaterThanOrEqual(250);
    expect(result.rejected.keystroke).toBe(1);
    expect(result.reachedTarget).toBe(true);
  });

  it("本の中で改行されていても1本として繋ぐ", async () => {
    const body = sentence.repeat(6);
    // 3文ごとに折り返した応答
    const wrapped = `${sentence.repeat(3)}\n${sentence.repeat(3)}`;
    const result = await generateBatch(envWithAiResponses([[wrapped]]), {
      ...input({ form: "long", target: 1 }),
      getReadings: fromSingle(longReading),
    });

    expect(result.valid.map((p) => p.text)).toEqual([body]);
  });

  it("文の終わり（。！？）が足りない本は punct で却下する", async () => {
    // 句点を落とした一続き（改行も無いので parseGeneratedBlocks では補えない）
    const noPunct = sentence.repeat(6).replaceAll("。", "");
    const result = await generateBatch(envWithAiResponses([[noPunct]]), {
      ...input({ form: "long", target: 1 }),
      getReadings: fromSingle(longReading),
    });
    expect(result.valid).toEqual([]);
    expect(result.rejected.punct).toBe(1);
  });

  it("短文では文の終わりを検査しない（punct は常に0）", async () => {
    const result = await generateBatch(envWithAiResponses([["影が揺れた"]]), {
      ...input({ target: 1 }),
      getReadings: fromSingle(async () => {
        const kana = "かげがゆれた";
        return { kana, roman: buildRomanCandidates(kana) };
      }),
    });
    expect(result.valid.map((p) => p.text)).toEqual(["影が揺れた"]);
    expect(result.rejected.punct).toBe(0);
  });

  it("ひらがなだけの本は kanji で却下する", async () => {
    const result = await generateBatch(
      envWithAiResponses([["しのびはやみをはしる。".repeat(12)]]),
      {
        ...input({ form: "long", target: 1 }),
        getReadings: fromSingle(longReading),
      },
    );
    expect(result.valid).toEqual([]);
    expect(result.rejected.kanji).toBe(1);
  });
});

describe("重複の計測", () => {
  /**
   * **重複を無言で捨てない。** 単語はテーマあたりの語彙が有限で、プールが育つほど
   * 既出だらけになる。カウンタを通さずに落としていたため、AI Gateway 上は
   * 「ほとんど却下されていない」ように見えるのに採用がごくわずか、という
   * 食い違いが起きていた（福岡の単語プールで実際に起きた）。
   */
  it("既存プールと同じものは dup として数える", async () => {
    const result = await generateBatch(envWithAiResponses([["忍者", "手裏剣"]]), {
      ...input({ form: "word", target: 2, existing: ["忍者"] }),
      getReadings: fromSingle(wordReading),
    });

    expect(result.valid.map((p) => p.text)).toEqual(["手裏剣"]);
    expect(result.rejected.dup).toBe(1);
  });

  it("同じ生成の中で重なったものも数える", async () => {
    const result = await generateBatch(envWithAiResponses([["忍者", "忍者", "城"]]), {
      ...input({ form: "word", target: 3 }),
      getReadings: fromSingle(wordReading),
    });

    expect(result.valid.map((p) => p.text)).toEqual(["忍者", "城"]);
    expect(result.rejected.dup).toBe(1);
  });
});
