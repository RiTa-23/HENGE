import type { PromptForm } from "@henge/shared";

/**
 * プレイチケット。**「サーバーがこのお題をこの順で出した」ことの証明。**
 *
 * `POST /api/sessions/start` が、出したお題のID（出題順）に HMAC-SHA256 で署名して
 * 返す（匿名にも）。ランキングの登録はこのチケットと打鍵ログを受け取り、チケットの
 * お題で打鍵ログを再生して記録を出す（`docs/04-api.md`）。打鍵数・ミス数・時間の
 * 自己申告は受け取らない。
 *
 * **サーバーには何も保存しない**（署名だけで検証できる）。匿名のプレイにも発行
 * できるのはそのためで、不変条件10（匿名のデータをサーバーに持たない）に触れない。
 * 使い捨ての印（`jti`）は登録の時点で Hono の KV に書く。その時点ではログイン済み。
 *
 * 鍵は専用のシークレット `RANKING_TICKET_SECRET`。`BETTER_AUTH_SECRET` を使い回すと、
 * 認証の鍵を替えたときに用途の違う署名まで巻き込まれる。
 */
export interface PlayTicket {
  /** 形式の版。中身を変えたら上げて、古いチケットを弾く */
  v: 1;
  /** チケットごとに一意。使い捨てにするための印 */
  jti: string;
  themeId: string;
  form: PromptForm;
  /** 出したお題のID。**出題順（シャッフル後）** */
  promptIds: string[];
  /** 発行時刻（エポックミリ秒）。実時間の検査と有効期限に使う */
  iat: number;
  /** ログイン中に発行したときだけ。登録する人と照合する */
  uid?: string;
}

/**
 * 有効期限。1プレイの上限（`MAX_ELAPSED_MS` = 1時間）に、結果画面からログインして
 * ユーザー名を決めるまでの余裕を足した長さ。
 */
export const PLAY_TICKET_TTL_MS = 2 * 60 * 60 * 1000;

/** チケットの文字列の長さの上限。単語20問ぶんのIDでも数KBに収まる */
export const PLAY_TICKET_MAX_LENGTH = 4096;

export type TicketCheck = { ticket: PlayTicket } | { rejection: string };

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[\w-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    // 長さが4で割って1余る文字列は base64 として読めない
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** `本文.署名` の形にする（どちらも base64url） */
export async function signPlayTicket(ticket: PlayTicket, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(ticket)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

function isPlayTicket(value: unknown): value is PlayTicket {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    t.v === 1 &&
    typeof t.jti === "string" &&
    typeof t.themeId === "string" &&
    (t.form === "sentence" || t.form === "word" || t.form === "long") &&
    Array.isArray(t.promptIds) &&
    t.promptIds.every((id) => typeof id === "string") &&
    typeof t.iat === "number" &&
    (t.uid === undefined || typeof t.uid === "string")
  );
}

/**
 * 署名・形・有効期限・持ち主を確かめる。
 *
 * **署名の比較は `crypto.subtle.verify` に任せる**（一定時間で比べる）。
 * `uid` があるチケットは、発行したときにログインしていた本人しか登録できない。
 * 無いチケット（匿名で遊んだもの）は、ログインして登録した人の記録になる。
 */
export async function verifyPlayTicket(
  token: string,
  secret: string,
  { now, userId }: { now: number; userId: string },
): Promise<TicketCheck> {
  const broken = { rejection: "記録の証明が正しくありません" };
  const [body, signature, ...rest] = token.split(".");
  if (body === undefined || signature === undefined || rest.length > 0) return broken;

  const signatureBytes = fromBase64Url(signature);
  const bodyBytes = fromBase64Url(body);
  if (signatureBytes === null || bodyBytes === null) return broken;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signatureBytes,
    encoder.encode(body),
  );
  if (!valid) return broken;

  let ticket: unknown;
  try {
    ticket = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return broken;
  }
  if (!isPlayTicket(ticket)) return broken;

  if (now - ticket.iat > PLAY_TICKET_TTL_MS) {
    return { rejection: "遊んでから2時間を過ぎた記録は登録できません" };
  }
  if (ticket.uid !== undefined && ticket.uid !== userId) {
    return { rejection: "別のアカウントで遊んだ記録は登録できません" };
  }
  return { ticket };
}
