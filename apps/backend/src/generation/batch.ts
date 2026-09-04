/* oxlint-disable no-await-in-loop --
 * ラウンドは直列でなければならない。1ラウンド目の結果が目標に達したかを見てから
 * 2ラウンド目を回すか決めるため、並列化すると常に2ラウンド走ってしまう。
 */
import {
  countKeystrokes,
  includesConstraint,
  isKeystrokeCountInRange,
  isTypableText,
  type ThemeKind,
  UnsupportedKanaError,
} from "@henge/shared";
import type { GetReading } from "../reading/index";
import { recordGenerationResult, requestPrompts } from "./ai";
import type { ModelId } from "./model";

/**
 * 1ラウンドあたりのリクエスト件数。
 *
 * **`MAX_ROUNDS × N_REQUEST ≤ 50` を必ず満たすこと。**
 * 読み仮名の取得はお題1件につき外部サブリクエストを1回消費し、
 * Workers無料プランの上限は1実行につき50回。20件×3ラウンド=60回で静かに失敗する。
 * N_REQUEST を変える場合はラウンド数もセットで見直すこと。
 */
export const N_REQUEST = 20;
export const MAX_ROUNDS = 2;

export interface ValidPrompt {
  text: string;
  readingKana: string;
  readingRomanJson: string;
  keystrokeCount: number;
}

export interface RejectionCounts {
  /** 使用できない文字が含まれていた（読みにテーブル外のかなが残った場合を含む） */
  charset: number;
  /** 打鍵数が10〜40の範囲外 */
  keystroke: number;
  /** 「含む」モードで、指定文字が読み仮名に無かった */
  constraint: number;
}

export interface BatchResult {
  valid: ValidPrompt[];
  rejected: RejectionCounts;
  rounds: number;
  reachedTarget: boolean;
}

export interface GenerateBatchInput {
  kind: ThemeKind;
  /** テーマ名、または「含む文字」 */
  name: string;
  /** メタデータ用。新規作成時はまだIDが無いので採番前の値を渡す */
  themeId: string;
  path: "create" | "regenerate" | "refill";
  /** 有効何件を目指すか */
  target: number;
  /** 重複回避の文脈。既存お題の本文 */
  existing: string[];
  model: ModelId;
  getReading: GetReading;
  /** 検証結果のログ書き戻しを遅らせる。Honoハンドラからは c.executionCtx.waitUntil を渡す */
  waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * お題の生成バッチ。新規作成（同期）と背景補充（非同期）の両方から呼ぶ。
 *
 * 1. LLMに N_REQUEST 件リクエスト
 * 2. ホワイトリスト検査（読み取得の前に無料で弾く）
 * 3. getReading() で読み仮名・ローマ字を取得
 * 4. 打鍵数の検査
 * 5. 「含む」モードなら指定文字の検査
 * 6. 目標に達していなければ、もう1ラウンドだけ繰り返す
 */
export async function generateBatch(env: Env, input: GenerateBatchInput): Promise<BatchResult> {
  const valid: ValidPrompt[] = [];
  const rejected: RejectionCounts = { charset: 0, keystroke: 0, constraint: 0 };
  const seen = new Set(input.existing);
  let rounds = 0;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    rounds = round;

    const { texts, logId } = await requestPrompts(env, {
      model: input.model,
      kind: input.kind,
      name: input.name,
      count: N_REQUEST,
      existing: input.existing,
      metadata: { themeId: input.themeId, kind: input.kind, round, path: input.path },
    });

    const before = valid.length;
    await validateInto(texts, input, seen, valid, rejected);

    if (logId !== undefined) {
      const record = recordGenerationResult(env, logId, {
        requested: N_REQUEST,
        valid: valid.length - before,
        rejected: { ...rejected },
      }).catch(() => {
        // 計測の失敗で生成そのものを落とさない
      });
      if (input.waitUntil !== undefined) input.waitUntil(record);
      else await record;
    }

    if (valid.length >= input.target) break;
  }

  return { valid, rejected, rounds, reachedTarget: valid.length >= input.target };
}

async function validateInto(
  texts: string[],
  input: GenerateBatchInput,
  seen: Set<string>,
  valid: ValidPrompt[],
  rejected: RejectionCounts,
): Promise<void> {
  // 重複と文字種は、読み取得の前に無料で弾く
  const candidates = texts.filter((text) => {
    if (seen.has(text)) return false;
    seen.add(text);
    if (!isTypableText(text)) {
      rejected.charset++;
      return false;
    }
    return true;
  });

  // 読み取得は1件につき外部サブリクエストを1回消費する。並列にして待ち時間だけ縮める
  const readings = await Promise.allSettled(
    candidates.map(async (text) => ({ text, reading: await input.getReading(text) })),
  );

  for (const result of readings) {
    if (result.status === "rejected") {
      // テーブルに無いかなが読みに残っていた場合。APIの障害はここで握りつぶさず外へ投げる
      if (result.reason instanceof UnsupportedKanaError) {
        rejected.charset++;
        continue;
      }
      throw result.reason;
    }

    const { text, reading } = result.value;
    const keystrokeCount = countKeystrokes(reading.roman);
    if (!isKeystrokeCountInRange(keystrokeCount)) {
      rejected.keystroke++;
      continue;
    }
    if (input.kind === "constraint" && !includesConstraint(reading.kana, input.name)) {
      rejected.constraint++;
      continue;
    }

    valid.push({
      text,
      readingKana: reading.kana,
      readingRomanJson: JSON.stringify(reading.roman),
      keystrokeCount,
    });
  }
}
