import { isAdminEmail } from "@henge/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import { currentSession } from "@/lib/api/session";

/**
 * ベータ運用の判定。
 *
 * **フラグは `BETA_MODE`（Next.js Worker の環境変数。`wrangler.jsonc` の `vars`）1つ。**
 * `"true"` の間だけベータ版になる。外す・別の値にして再デプロイすれば、
 * コードの変更なしで公開版（現在の状態）に戻る。
 *
 * ベータ版で制限するのは「新しいお題の生成」と「最適化練習の公開」。
 * **既存プールのプレイと補充生成は制限しない**（在庫が尽きたテーマが
 * ベータ版利用者にも遊べる状態を保つため）。
 *
 * **運営アカウントは何も変えない。** 判定は `/api/admin/*` と同じ
 * `ADMIN_EMAILS`（`isAdminEmail`）を使う。判定を2か所に書くと、
 * ずれたときに「運営なのに調整中になる」事故になる。
 */

/** env の値の解釈はここだけ。**`"true"` のときだけ有効**（他の値・未設定は公開版） */
export function isBetaMode(betaMode: string | undefined): boolean {
  return betaMode === "true";
}

/**
 * ベータ版で調整中のページの metadata。**調整中の間だけ検索エンジンに見せない。**
 *
 * 着地ページ（`/practice` 系）をベータの間にインデックスさせると、調整中の画面が
 * 検索結果に出てしまう。公開版に戻せば各ページの通常の metadata に戻る。
 *
 * リテラルをここに置くのは `lib/ui/routing.test.ts` のため。インデックス対象の
 * ページに生の noindex が現れないことを機械的に検査しており、ページ側は
 * この関数を返すだけで済む。
 */
export function adjustingMetadata(): Metadata {
  return { robots: { index: false, follow: false } };
}

/**
 * このセッションはベータ版で制限されるか。
 *
 * ベータモードが無効なら常に false（公開版と同じ挙動で、セッションも引かない）。
 * 未ログインは制限対象。**`ADMIN_EMAILS` が未設定なら誰も運営ではない**
 * （`denyIfNotAdmin` と同じ側に倒す。設定漏れで全員が自由になる事故を防ぐ）。
 */
export function isBetaLimitedUser(
  betaMode: string | undefined,
  session: { user: { email: string } } | null,
  adminEmails: string | undefined,
): boolean {
  if (!isBetaMode(betaMode)) return false;
  return !isAdminEmail(session?.user.email ?? "", adminEmails ?? "");
}

/** Route Handler 用。env とセッションを集めて判定する。呼び出し側は薄くてよい */
export async function betaLimitation(request: Request): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  // ベータモードでない限りセッション照合（D1アクセス）は走らせない。
  // 公開版に戻したときのコストをゼロにする
  if (!isBetaMode(env.BETA_MODE)) return false;
  return isBetaLimitedUser(env.BETA_MODE, await currentSession(request), env.ADMIN_EMAILS);
}

/**
 * ロゴの横に出す「ベータ版」の表示をすべきか。
 *
 * **運営アカウントにも見せる。** 制限（betaLimitation）は「この利用者に機能を
 * 出してよいか」の判定だが、こちらは「サイトがベータ運用中か」の表明で、
 * 見る人によって変わらない。セッションも引かず env だけを見る。
 */
export async function betaBadgeVisible(): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  return isBetaMode(env.BETA_MODE);
}
