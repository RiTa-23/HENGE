/**
 * 秘密の値を一定時間で比べる。`===` は先頭から食い違った位置で抜けるので、
 * 応答時間から一致した長さを探られる。長さの違いも漏らさないよう、SHA-256 に
 * 揃えてから全バイトを見る（Web Crypto だけで書き、Workers と next dev の両方で動かす）
 */
export async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (const [i, byte] of a.entries()) diff |= byte ^ (b[i] ?? 0);
  return diff === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
