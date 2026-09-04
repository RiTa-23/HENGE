import type { ThemeKind } from "@henge/shared";

/**
 * 生成プロンプト。**全モデルで共通のものを1つだけ持つ。**
 *
 * 呼び出しはステートレスなので、2回目のバッチは1回目が何を作ったか知らない。
 * 既存お題を「これと似たものを作るな」という文脈として渡すことで重複を減らす。
 * 入力トークンの増加は1バッチあたり約4ニューロンで、効果に対して十分安い。
 */

/** 重複回避の文脈として渡す既存お題の件数 */
export const EXISTING_CONTEXT_SIZE = 30;

const SYSTEM = [
  "あなたは日本語タイピング練習用の短文を作る職人です。",
  "指示された条件を厳密に守り、余計な説明を一切書かず、短文だけを出力します。",
].join("");

function rules(count: number): string[] {
  return [
    `- ちょうど${count}個の短文を作る`,
    "- 1行に1文ずつ、番号や記号を付けずに出力する",
    "- 使ってよい文字は、ひらがな・カタカナ・漢字と、次の5種類の記号だけ",
    "  、 。 ー ！ ？",
    "- 「」（）〜・：やアルファベット・数字・空白は絶対に使わない",
    "- 1文はひらがなに直して8〜20文字程度",
    "- 意味の通る自然な日本語にする",
  ];
}

export function buildGenerationPrompt(input: {
  kind: ThemeKind;
  /** テーマ名、または「含む文字」 */
  name: string;
  count: number;
  /** 重複回避の文脈。直近の既存お題 */
  existing: string[];
}): { system: string; user: string } {
  const subject =
    input.kind === "theme"
      ? `テーマ「${input.name}」に沿った短文を作ってください。`
      : `読み仮名に「${input.name}」を必ず含む短文を作ってください。表記に現れていなくても、読みに含まれていれば構いません。`;

  const lines = [subject, "", "条件:", ...rules(input.count)];

  if (input.existing.length > 0) {
    lines.push(
      "",
      "次はすでに作成済みの短文です。これらと似た内容・似た言い回しは避けてください。",
      ...input.existing.map((text) => `- ${text}`),
    );
  }

  return { system: SYSTEM, user: lines.join("\n") };
}

/** モデルの出力を1文ずつに切る。番号や箇条書き記号が付いていても落とす */
export function parseGeneratedLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^[-*・\d]+[.)、.]?\s*/u, "")
        .trim(),
    )
    .filter((line) => line.length > 0);
}
