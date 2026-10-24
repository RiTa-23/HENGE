import type { PromptForm, ThemeKind } from "@henge/shared";
import {
  LONG_KEYSTROKE_MAX,
  LONG_KEYSTROKE_MIN,
  WORD_KEYSTROKE_MAX,
  WORD_KEYSTROKE_MIN,
} from "@henge/shared";

/**
 * 生成プロンプト。**全モデルで共通のものを1つだけ持つ。**
 *
 * 呼び出しはステートレスなので、2回目のバッチは1回目が何を作ったか知らない。
 * 既存お題を「これと似たものを作るな」という文脈として渡す設計だったが、
 * いまは外して試している（`INCLUDE_EXISTING_PROMPTS` 参照）。
 */

/** 既存お題を何件遡って持ってくるか。プロンプトの文脈と、完全一致の重複除去に使う */
export const EXISTING_CONTEXT_SIZE = 30;

/**
 * 単語のときに遡る件数。**短文よりずっと多く取る。**
 *
 * 完全一致の重複除去（`batch.ts` の `seen`）はここで渡した分しか見ない。単語は
 * 短文と違って言い換えの幅が無く、テーマから素直に連想すると同じ語が何度でも
 * 返る（「福岡」なら「屋台」「明太子」）。30件では、31件目より前に作った語が
 * そのまま二度入る。プール全体を渡せるだけの件数にしておく。
 *
 * D1の読み取りが増えるだけで、AIには渡さない（`INCLUDE_EXISTING_PROMPTS` は false）。
 */
export const WORD_EXISTING_CONTEXT_SIZE = 200;

/**
 * 長文のときに遡る件数。**1本が長いので少なくてよい。** 1回の生成が5本×2ラウンドで、
 * 完全一致の重複は文章ではまず起きない（起きるなら同じ文章を丸ごと返している）。
 * 本文が長いぶんD1から読む量も大きいので、必要以上に取らない。
 */
export const LONG_EXISTING_CONTEXT_SIZE = 10;

/** その形式で遡る件数 */
export function existingContextSize(form: PromptForm): number {
  if (form === "word") return WORD_EXISTING_CONTEXT_SIZE;
  if (form === "long") return LONG_EXISTING_CONTEXT_SIZE;
  return EXISTING_CONTEXT_SIZE;
}

/**
 * 既存お題をプロンプトに載せるか。**いまは載せない（2026-09-06 から試行中）。**
 *
 * 直近30件を「これと似た内容・似た言い回しは避けろ」という否定の文脈として
 * 渡していたが、**モデルが内容ではなく形式の方に引きずられている疑いがある。**
 * few-shot と同じで、否定で添えても例示は例示として効くため、お題の型
 * （文の長さ・構文・主語の立て方）が既存に揃っていく。「慣れが生じない」ことが
 * このサービスの目的なので、型が揃うのは重複そのものより悪い。
 *
 * **外しても同じ文が二度入ることはない。** 完全一致の重複は batch.ts の `seen`
 * （`new Set(input.existing)`）が読み取得の前に無料で弾いており、そちらは
 * 生きたまま。効き目が変わるのは「言い回しの近い別の文」だけ。
 *
 * 戻すときはここを true にする。判断は却下率・重複率の実測（Phase 8）で行う。
 */
const INCLUDE_EXISTING_PROMPTS: boolean = false;

const SYSTEM = [
  "あなたは日本語タイピング練習用の短文を作る職人です。",
  "指示された条件を厳密に守り、余計な説明を一切書かず、短文だけを出力します。",
].join("");

/** 単語モードのシステムプロンプト。**「短文」と言わない**（言うと文を返してくる） */
const SYSTEM_WORD = [
  "あなたは日本語タイピング練習用の言葉を集める職人です。",
  "指示された条件を厳密に守り、余計な説明を一切書かず、言葉だけを出力します。",
].join("");

/** 長文のシステムプロンプト。「短文」と言わない（短い文に寄る） */
const SYSTEM_LONG = [
  "あなたは日本語タイピング練習用の文章を書く職人です。",
  "指示された条件を厳密に守り、余計な説明を一切書かず、文章だけを出力します。",
].join("");

function rules(count: number): string[] {
  return [
    `- ちょうど${count}個の短文を作る`,
    "- 1行に1文ずつ、番号や記号を付けずに出力する",
    "- 使ってよい文字は、ひらがな・カタカナ・漢字と、次の5種類の記号だけ",
    "  、 。 ー ！ ？",
    "- 「」（）〜・：やアルファベット・数字・空白は絶対に使わない",
    "- 1文はひらがなに直して8〜18文字程度。**これを超えると長すぎて拒否される**（打鍵数は35打まで。1かなは平均2打程度なので、20文字の文は40打前後になる）",
    "- 漢字をかならず1つ以上使う。ひらがなだけの文にしない",
    "- 意味の通る自然な日本語にする",
  ];
}

/**
 * 単語モードの指示。**短文用（`rules`）とは別に持つ。**
 *
 * 短文の指示をそのまま流用できない。「8〜18文字」「文を途中で終わらせない」は
 * 単語には有害で、**語ではなく短い文を返させる**方向に働く。
 *
 * **1語だけに縛らない。** テーマから連想できる単語は100語ほどで頭打ちになり、
 * プールが育つほど新しい語が出なくなる（実測: 福岡で93語まで積むと、返ってくる
 * 語のほとんどが既出になった）。2〜3語の組み合わせまで許すと、語彙の天井が
 * 一気に上がる。**ただし文は許さない**（それは短文モードの領分）。
 *
 * 「文にするな」だけでは通じないので、**何がよくて何がだめかを例で挟む**。
 * 述語（〜する・〜だ・〜が…）が付いた時点で文になる、という切り分けを示す。
 *
 * 打鍵数の範囲はかな文字数で近似して伝える。モデルは打鍵数を数えられないため
 * （短文側と同じ理由）。4〜20打はおおむねかな2〜10文字にあたる。
 */
function wordRules(count: number): string[] {
  /**
   * 組み合わせにする最低数。
   *
   * **「〜でもよい」では効かない。** 実測で、許すだけの書き方（「1語でもよいし、
   * 2〜3語の組み合わせでもよい」）にしたところ、返ってきた14語すべてが1語だった
   * （「デモ」「成果」「スピード」…）。最適化モードで先に学んだのと同じで、
   * **効くのは数えられる形にしたときだけ**（`constraintRules` の注記）。
   *
   * 半数にしているのは、1語の短い語も混ぜたいから。全部を組み合わせにすると
   * 打鍵数が上限（20打）に寄って、単語モードが短文モードに近づく。
   */
  const comboTarget = Math.ceil(count / 2);

  return [
    `- ちょうど${count}個を挙げる`,
    "- 1行に1つずつ、番号や記号を付けずに出力する",
    `- そのうち${comboTarget}個以上は、2〜3語を組み合わせた言葉にする（残りは1語でよい）`,
    "- **文にしない。** 述語（〜する・〜した・〜だ・〜がある）を付けない",
    // **例はテーマを明示して挟む。** 無記名の具体例を置くと、few-shot と同じで
    // そのままの語を返してくることがある（docs/05-generation.md）。別テーマの例だと
    // 分かる形にして、真似させたいのは「形」だけにする
    "  よい例（テーマが「祭り」のとき）: 提灯／夏祭りの夜／太鼓の音／山車の行列",
    "  だめな例: 提灯が揺れる／太鼓を叩く／夜がふける",
    "- 句読点（、。）や！？を使わない",
    "- 使ってよい文字は、ひらがな・カタカナ・漢字と長音符（ー）だけ",
    "- アルファベット・数字・空白・記号は絶対に使わない",
    `- 読み仮名が2〜10文字程度にする（打鍵数${WORD_KEYSTROKE_MIN}〜${WORD_KEYSTROKE_MAX}に相当）`,
    "- ひらがなだけにしない。漢字かカタカナを含める",
    "- 実在する言葉だけを使う。**造語を作らない**",
    `- ${count}個すべて違うものにする`,
  ];
}

/**
 * 長文の指示。**短文用（`rules`）とは別に持つ。**
 *
 * 1本＝1プレイなので、短文1プレイぶん（約220打）に相当する長さの、**筋の通った
 * 1つの文章**を書かせる。短文の指示（1文8〜18文字・1行1文）を流用すると、
 * 文が短く切れて箇条書きのような出力になる。
 *
 * 長さはかな文字数で近似して伝える（モデルは打鍵数を数えられない。短文と同じ理由）。
 * 250〜450打はおおむねかな150〜220文字にあたる。**本の切れ目は空行**で、
 * 1本の中では改行しない（`parseGeneratedLines` は行を1件と見なすので、
 * 長文だけ `parseGeneratedBlocks` で空行区切りに読む）。
 */
function longRules(count: number): string[] {
  return [
    `- ちょうど${count}本の文章を書く`,
    "- 1本は3〜5文からなる、ひとつながりの文章にする。箇条書きや見出しにしない",
    "- **各文の終わりに必ず「。」を付ける。** 文の途中には読みやすいところに「、」を入れる。句読点の無い文章は拒否される",
    `- 1本はひらがなに直して150〜220文字程度。**これより短いと拒否される**（打鍵数${LONG_KEYSTROKE_MIN}〜${LONG_KEYSTROKE_MAX}に相当）`,
    "- 1本の中では改行しない。本と本の間だけを空行で区切る",
    "- 番号や記号、見出しを付けない",
    "- 使ってよい文字は、ひらがな・カタカナ・漢字と、次の5種類の記号だけ",
    "  、 。 ー ！ ？",
    "- 「」（）〜・：やアルファベット・数字・空白は絶対に使わない",
    "- 漢字をかならず使う。ひらがなだけの文章にしない",
    "- 意味の通る自然な日本語にする。説明文でも物語でもよい",
    `- ${count}本は互いに違う話題・違う書き出しにする`,
  ];
}

/**
 * 最適化練習で1文に渡す語の数。**実測で決める（#262）。**
 *
 * - 2: 2語の組を渡し、両方を使わせる（案1）
 * - 3: 3語を渡し、自然に使える2語以上を選ばせる（案2）。ランダムな組では「雑穀」と
 *   「座席」のような意味のつながらない2語が組になり、無理につなげた文が不自然になる
 *   おそれがあるので、選ぶ余地を残す。渡す語は1.5倍になる
 *
 * 1文に指定の音を含む語が2つ入るので、指定の音が文中に自然に2回以上入る。
 */
export type WordsPerSentence = 2 | 3;
export const CONSTRAINT_WORDS_PER_SENTENCE: WordsPerSentence = 2;

/**
 * 最適化練習の指示。**語はこちらで選んで渡し、モデルには文を作らせるだけにする。**
 *
 * 以前は「読みに『ざ』を含む短文を作れ」と頼み、位置・品詞・回数を個数で縛る指示を
 * 8行足していた。それでも既定モデルは「読みに指定の音を含む漢字の語」をほとんど
 * 思い浮かべられず、文頭に指定の音を書いてから続きを作ることに逃げた。本番「ざ」の
 * 28件はすべて「ざ」始まりで、7件はひらがなの作り語（「ざいりつを訪れた」）、
 * 実質10語前後の使い回しだった（2026-10-24。docs/05-generation.md）。
 *
 * **指定の音そのものはプロンプトに書かない。** 書くと、渡した語を無視してその音で
 * 書き始める癖が戻る。指定の音が入っているかは検証側（`includesConstraint`）で見る。
 */
function constraintRules(wordsPerSentence: WordsPerSentence): string[] {
  return [
    wordsPerSentence === 2
      ? "- 各行の2語を、両方とも文の中で使う"
      : "- 各行の3語のうち、自然に使える2語以上を文の中で使う。無理に3語すべてを入れない",
    "- 語は文に合わせて活用させたり、助詞を付けたりしてよい。ただし別の語に言い換えない",
    "- 語を並べるだけにせず、意味の通る自然な日本語の文にする",
    "- 語の組と同じ順に、上から1文ずつ出力する",
  ];
}

export function buildGenerationPrompt(input: {
  kind: ThemeKind;
  /** 出題の形式。省略時は短文 */
  form?: PromptForm;
  /** テーマ名、または「含む文字」 */
  name: string;
  count: number;
  /** 重複回避の文脈。直近の既存お題 */
  existing: string[];
  /**
   * 最適化で1文ごとに渡す語の組（表記）。**最適化では必須。** 組の数が作る文の数になる
   * （`count` は使わない）
   */
  wordGroups?: string[][];
  /** 1文に渡す語の数。省略時は `CONSTRAINT_WORDS_PER_SENTENCE`（測定のときだけ指定する） */
  wordsPerSentence?: WordsPerSentence;
}): { system: string; user: string } {
  // **単語モードはテーマだけ**（最適化練習には付けない。短い語に指定の音を
  // 入れさせるのは、短文よりさらに却下率が上がる）
  if (input.form === "word") {
    const lines = [
      `テーマ「${input.name}」から連想する言葉を挙げてください。1語でも、2〜3語を組み合わせた言葉でも構いません。`,
      "",
      "条件:",
      ...wordRules(input.count),
    ];
    return { system: SYSTEM_WORD, user: lines.join("\n") };
  }

  // **長文もテーマだけ**（最適化練習には付けない。単語と同じ理由）
  if (input.form === "long") {
    const lines = [
      `テーマ「${input.name}」に沿った文章を書いてください。`,
      "",
      "条件:",
      ...longRules(input.count),
    ];
    return { system: SYSTEM_LONG, user: lines.join("\n") };
  }

  if (input.kind === "constraint") {
    const groups = input.wordGroups ?? [];
    if (groups.length === 0) throw new Error("最適化の生成には語の組が要る");
    const lines = [
      "次の各行に並べた語を使って、自然な短文を1つずつ作ってください。",
      "",
      "条件:",
      ...rules(groups.length),
      ...constraintRules(input.wordsPerSentence ?? CONSTRAINT_WORDS_PER_SENTENCE),
      "",
      "語の組:",
      ...groups.map((group) => group.join("／")),
    ];
    return { system: SYSTEM, user: lines.join("\n") };
  }

  const lines = [
    `テーマ「${input.name}」に沿った短文を作ってください。`,
    "",
    "条件:",
    ...rules(input.count),
  ];

  if (INCLUDE_EXISTING_PROMPTS && input.existing.length > 0) {
    lines.push(
      "",
      "次はすでに作成済みの短文です。これらと似た内容・似た言い回しは避けてください。",
      ...input.existing.map((text) => `- ${text}`),
    );
  }

  return { system: SYSTEM, user: lines.join("\n") };
}

/** 1行の前後の空白と、行頭の番号・箇条書き記号を落とす */
function cleanLine(line: string): string {
  return line
    .trim()
    .replace(/^[-*・\d]+[.)、.]?\s*/u, "")
    .trim();
}

/** モデルの出力を1文ずつに切る。番号や箇条書き記号が付いていても落とす */
export function parseGeneratedLines(output: string): string[] {
  return output
    .split("\n")
    .map(cleanLine)
    .filter((line) => line.length > 0);
}

/**
 * 行末に文の終わりが無ければ「。」を補う。
 *
 * モデルは指示に反して**1文ごとに改行し、そのとき「。」を落とす**（実測。
 * 「〜イベントだ／参加者は〜」のように返ってきた）。改行をそのまま繋ぐと
 * 「〜イベントだ参加者は〜」という区切りの無い文章になる。行の切れ目は文の切れ目と
 * 見なして補う。「、」で終わる行（文の途中で折り返した）には足さない。
 */
function closeSentence(line: string): string {
  return /[。！？、]$/u.test(line) ? line : `${line}。`;
}

/**
 * 長文の出力を1本ずつに切る。**本の切れ目は空行**で、1本の中の改行は繋ぐ。
 *
 * 指示では改行しないことになっているが、モデルは1文ごとに改行することがある。
 * 行で切ると1本が数件のお題に割れ、どれも打鍵数不足で落ちる。繋ぐときは行末に
 * 「。」を補う（`closeSentence`）。空行が1つも無ければ出力全体を1本と見なす。
 */
export function parseGeneratedBlocks(output: string): string[] {
  return output
    .split(/\n\s*\n/u)
    .map((block) =>
      block
        .split("\n")
        .map(cleanLine)
        .filter((line) => line.length > 0)
        .map(closeSentence)
        .join(""),
    )
    .filter((block) => block.length > 0);
}

/** 形式に合った切り出し。長文だけ空行区切り */
export function parseGeneratedOutput(output: string, form: PromptForm): string[] {
  return form === "long" ? parseGeneratedBlocks(output) : parseGeneratedLines(output);
}
