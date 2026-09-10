/**
 * 応答の本文をJSONとして読む。**本文が空でも落とさない。**
 *
 * `response.json()` は本文が0バイトだと `Unexpected end of JSON input` を投げる。
 * 呼び出し側はたいていエラー表示を組み立てている最中なので、**エラーを表示しようと
 * して別の例外で画面が落ちる**という最悪の壊れ方になる（実際にプレイ画面の
 * 「お題を作る」で起きた）。
 *
 * 本文が空になるのは、サーバー側で例外が出た場合や、接続が途中で切れた場合。
 * どちらもクライアントには手の打ちようがないので、**null に倒して既定の文言を
 * 出す**。`isApiError(null)` は false なので、呼び出し側の分岐はそのまま通る。
 */
export async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
