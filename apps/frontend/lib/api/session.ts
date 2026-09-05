/**
 * ログイン中のユーザーID。
 *
 * **Phase 5（#41）で Better Auth に繋ぐ。** それまでは常に未ログインとして扱うため、
 * 認証が必要なエンドポイントは UNAUTHORIZED を返す。
 * 偽のユーザーIDを返す実装にはしない（動いているように見えて、認可が素通りになる）。
 */
export async function currentUserId(): Promise<string | null> {
  return null;
}
