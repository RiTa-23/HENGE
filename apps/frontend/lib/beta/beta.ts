import { isAdminEmail } from "@henge/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { errorResponse } from "@/lib/api/error";
import { currentSession } from "@/lib/api/session";

/**
 * ベータ運用の判定。
 *
 * **フラグは `BETA_MODE`（Next.js Worker の環境変数。`wrangler.jsonc` の `vars`）1つ。**
 * `"true"` の間だけベータ版になる。外す・別の値にして再デプロイすれば、
 * コードの変更なしで公開版（現在の状態）に戻る。
 *
 * ベータ版で制限するのは「テーマの新規生成」だけ。最適化練習は公開済み
 * （作成・運指の投稿・既定の運指の変更を含め、誰でも使える）。
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
 * 作成の依頼が最適化（`kind: "constraint"`）か。**検証より前に、生の入力から読む。**
 *
 * 検証に通ったかどうかで決めると、最適化で検証に失敗する音（小書きのかなで始まる・
 * NG 語を含む）がテーマ側に倒れ、ベータ版では検証の文言の代わりに「調整中」が返る
 * （#339）。kind が読めない壊れた入力は false（テーマ側に倒す）。
 */
export function isConstraintRequest(raw: unknown): boolean {
  return (
    typeof raw === "object" && raw !== null && (raw as { kind?: unknown }).kind === "constraint"
  );
}

/**
 * `POST /api/themes` のベータ版の判定。弾くなら `FORBIDDEN` の応答、通すなら null。
 *
 * 最適化は公開済みなので、`limited` を呼ばずに通す（セッション照合を走らせない）。
 * 判定は認可なので、呼び出し側でレート制限やクォータの照会より前に置く（docs/04-api.md）
 */
export async function betaThemeRejection(
  raw: unknown,
  limited: () => Promise<boolean>,
): Promise<Response | null> {
  if (isConstraintRequest(raw) || !(await limited())) return null;
  return errorResponse("FORBIDDEN", "お題の生成は調整中です。既にあるお題は引き続き遊べます");
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
