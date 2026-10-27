import { getCloudflareContext } from "@opennextjs/cloudflare";
import { errorResponse } from "@/lib/api/error";

/**
 * 生成系エンドポイントの連打を弾く。
 *
 * 日次クォータ（50回/日）とは別物。`RATE_LIMITED` は数秒〜1分で解消し、
 * `QUOTA_EXCEEDED` は日付が変わるまで解消しない。どちらも429だが、案内文が
 * 変わるためコードで区別する。
 *
 * キーはユーザーID。IPアドレスにしないのは、生成系がいずれも要認証で、
 * 共有回線の背後にいる複数ユーザーを巻き添えにする理由が無いため。
 *
 * **クォータ判定より先に呼ぶこと。** 弾かれたリクエストで `GET /usage/:userId`
 * を引くのは無駄で、連打を弾く目的にも反する。
 *
 * 通ったときは null を返し、弾いたときはそのまま返せるレスポンスを返す。
 */
export async function limitGeneration(userId: string): Promise<Response | null> {
  const { env } = await getCloudflareContext({ async: true });
  const { success } = await env.GENERATION_RATE_LIMIT.limit({ key: userId });
  return success ? null : errorResponse("RATE_LIMITED");
}

/**
 * バックグラウンド補充をキックしてよいか。
 *
 * **弾いても429を返さない。** プレイ自体はクォータを消費しない行為なので止めず、
 * 補充のキックだけを落とす（残数0のときと同じ扱い）。呼び出し側は結果を
 * `allowRefill` に畳み込む。新しいエラー経路もクライアント側の対応も要らない。
 *
 * 生成系（limitGeneration）とは別の枠を使う。同じ枠にすると、遊んでいるだけで
 * テーマ作成の予算が減る。
 *
 * 補充が実際に要るかは在庫数を持つ Hono 側にしか分からないため、補充の不要な
 * プレイでも1消費する。上限がプレイの頻度基準（10回/60秒）なのはそのため。
 */
export async function canKickRefill(userId: string): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const { success } = await env.REFILL_RATE_LIMIT.limit({ key: userId });
  return success;
}

/**
 * ランキングの登録（POST /api/rankings）の連打を弾く。
 *
 * 1プレイに1回押すものなので、上限は補充のキックと同じくプレイの頻度で見積もる
 * （10回/60秒）。生成系（limitGeneration）と枠を分けるのは、記録を送るだけで
 * テーマ作成の予算が減らないようにするため。弾いたときは `RATE_LIMITED` を返す。
 */
export async function limitRankingRegister(userId: string): Promise<Response | null> {
  const { env } = await getCloudflareContext({ async: true });
  const { success } = await env.RANKING_RATE_LIMIT.limit({ key: userId });
  return success ? null : errorResponse("RATE_LIMITED");
}

/**
 * 読み違い報告（POST /api/reading-reports）の連投を弾く。
 *
 * **匿名でも送れる唯一の書き込み口**なので、キーはログイン中ならユーザーID、
 * 匿名なら接続元IP（`cf-connecting-ip`）。IP をキーにすると共有回線の利用者を
 * 巻き添えにしうるが、報告は1回で最大15件まとめて送れるので、人が1分に
 * 何度も送ることはない（5回/60秒）。弾いたときは `RATE_LIMITED` を返す。
 */
export async function limitReadingReport(
  userId: string | null,
  request: Request,
): Promise<Response | null> {
  const { env } = await getCloudflareContext({ async: true });
  const key = userId ?? `ip:${request.headers.get("cf-connecting-ip") ?? "unknown"}`;
  const { success } = await env.REPORT_RATE_LIMIT.limit({ key });
  return success ? null : errorResponse("RATE_LIMITED");
}

/**
 * おかしなお題の報告（POST /api/prompt-reports）の連投を弾く。
 *
 * **報告はその場でお題を配信から外す**ので、連投はそのままテーマの在庫を削る行為になる。
 * 報告はログインユーザーのみで、キーはユーザーID。
 *
 * バインディングは読み違い報告と同じ `REPORT_RATE_LIMIT`（5回/60秒）を使い、
 * キーに `prompt:` を付けて**枠を分ける**。同じ枠にすると、読み違いを送っただけで
 * お題の報告が弾かれる（逆も同じ）。1回で1プレイ分（最大20件）まとめて送れるので、
 * 人の操作で上限に届くことはない。
 */
export async function limitPromptReport(userId: string): Promise<Response | null> {
  const { env } = await getCloudflareContext({ async: true });
  const { success } = await env.REPORT_RATE_LIMIT.limit({ key: `prompt:${userId}` });
  return success ? null : errorResponse("RATE_LIMITED");
}

/**
 * 運指の投稿（POST /api/fingerings）の連投を弾く。
 *
 * 1つの最適化に1人5件までという上限は Hono 側で数えているので、ここで効くのは
 * 最適化をまたいだ連投（5回/60秒）。投稿は要認証なのでキーはユーザーID。
 */
export async function limitFingeringPost(userId: string): Promise<Response | null> {
  const { env } = await getCloudflareContext({ async: true });
  const { success } = await env.FINGERING_RATE_LIMIT.limit({ key: userId });
  return success ? null : errorResponse("RATE_LIMITED");
}
