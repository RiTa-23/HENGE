"use client";

import { isApiError, isHiraganaOnly, type ThemeKind } from "@henge/shared";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/api/auth-client";
import { Shuriken } from "@/components/play/Shuriken";
import { playHref } from "@/lib/ui/kind";

interface CreatedTheme {
  theme: { name: string };
  /** false なら既存テーマの再利用（生成は走っていない） */
  created: boolean;
}

/**
 * `kind` ごとに変わるのは**文言と入力の制限だけ**。作成の流れ（ログイン確認 →
 * 生成待ち → 結果）はテーマも最適化する音も同じなので、フォームを2組持たない。
 * DB上も同じテーブルで、APIも `kind` 1つで分岐している（docs/04-api.md）。
 */
const COPY = {
  theme: {
    label: "テーマ名（1〜30文字）",
    placeholder: "忍びの心得",
    maxLength: 30,
    submit: "作る",
    back: "テーマ作成に戻る",
    /** ひらがな以外も通るので、クライアント側での事前検査は無い */
    validate: (): string | null => null,
  },
  constraint: {
    label: "最適化する音（ひらがな1〜4文字）",
    placeholder: "ざ",
    maxLength: 4,
    submit: "この音で作る",
    back: "別の音を指定する",
    /**
     * **ひらがな以外はここで止める。** サーバーも `VALIDATION_ERROR` で弾くが、
     * 送ってしまうと `GENERATION_RATE_LIMIT`（5回/60秒）を1つ消費するため、
     * 打ち間違いの数回で `RATE_LIMITED` に落ちる。判定規則そのものは
     * `packages/shared` の `isHiraganaOnly` を共有していて、二重定義ではない
     */
    validate: (name: string): string | null =>
      isHiraganaOnly(name) ? null : "最適化する音はひらがなだけを指定できます",
  },
} as const satisfies Record<ThemeKind, unknown>;

/**
 * テーマ／最適化する音の作成。生成を伴うので認証が要る。
 *
 * **ここは `<input>` を使ってよい。** IMEを避けるのは打鍵を拾うプレイ画面だけで、
 * テーマ名は日本語入力そのものが要る（不変条件7はタイピング判定の話）。
 */
export function CreateThemeForm({
  kind,
  initialName = "",
}: {
  kind: ThemeKind;
  /** プリセットから飛んできたときに埋めておく文字 */
  initialName?: string;
}) {
  const copy = COPY[kind];
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; created: boolean } | null>(null);

  /**
   * ブラウザバックで戻ってきたときに、生成中でもないのに手裏剣が回り続けるのを防ぐ。
   *
   * bfcache から復元されると React の state もそのまま戻るため、離脱時に
   * busy だった画面は「生成中」の見た目のまま固まる。復元時は必ず解除する。
   */
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    globalThis.addEventListener("pageshow", onPageShow);
    return () => globalThis.removeEventListener("pageshow", onPageShow);
  }, []);

  if (isPending) return null;

  if (session === null) {
    return (
      <div className="mt-10 rounded-md border border-kinari/15 bg-kinari/5 px-8 py-10 text-center">
        <p className="text-kinari/80">お題を作るにはログインが必要です。</p>
        <button
          type="button"
          onClick={() => authClient.signIn.social({ provider: "google" })}
          className="mt-6 rounded-md border border-shu bg-shu/15 px-8 py-3 tracking-widest text-kinari"
        >
          Googleでログイン
        </button>
      </div>
    );
  }

  const create = async (trimmed: string) => {
    const response = await fetch("/api/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, name: trimmed }),
    });
    const body: unknown = await response.json();

    if (!response.ok) {
      // 案内文はサーバーが組み立てたものをそのまま出す。QUOTA_EXCEEDED は
      // リセット時刻を含み、GENERATION_FAILED は名前の変更を促す
      //
      // **ここで「生成中」の再送はしない。** POST /api/themes は
      // GENERATION_IN_PROGRESS を返さない（ロックを取るのは
      // POST /prompts/regenerate だけ）。仮に再送すると、1回ごとに
      // GENERATION_RATE_LIMIT（5回/60秒）を消費して RATE_LIMITED に落ちる
      setError(isApiError(body) ? body.error.message : "お題を作れませんでした");
      setBusy(false);
      return;
    }

    // **既存と一致した場合もエラーにしない。** ただし**そのまま始めない。**
    // 作った直後に遊びたいとは限らず、続けて別のお題を作りたいこともある。
    // 勝手に始めると、その時点でお題を1組消費してしまう
    const { theme, created: isNew } = body as CreatedTheme;
    setCreated({ name: theme.name, created: isNew });
    setBusy(false);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const invalid = copy.validate(trimmed);
    if (invalid !== null) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    void create(trimmed);
  };

  if (created !== null) {
    return (
      <div className="mt-10 rounded-md border border-kin/60 bg-kinari/5 px-8 py-12 text-center">
        <p className="text-sm tracking-widest text-kinari/60">
          {created.created ? "お題ができました" : "同じお題が既にありました"}
        </p>
        <h2 className="mt-3 font-mincho text-2xl tracking-wide text-kinari">{created.name}</h2>
        {!created.created && (
          <p className="mt-4 text-sm text-kinari/50">
            作り直していないので、生成回数は消費していません。
          </p>
        )}

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <a
            href={playHref(kind, created.name)}
            className="rounded-md border border-shu bg-shu/15 px-8 py-3 tracking-widest text-kinari transition-colors hover:bg-shu/25"
          >
            プレイする
          </a>
          <button
            type="button"
            onClick={() => {
              setCreated(null);
              setName("");
            }}
            className="rounded-md border border-kinari/20 px-8 py-3 tracking-widest text-kinari/80 transition-colors hover:border-kin hover:text-kinari"
          >
            {copy.back}
          </button>
        </div>
      </div>
    );
  }

  if (busy) {
    return (
      <div className="mt-10 flex flex-col items-center gap-6 rounded-md border border-kin/50 bg-kinari/5 px-8 py-14">
        <Shuriken size={72} />
        <p className="text-sm text-kinari/70">お題を作っています</p>
        <p className="text-sm text-kinari/40">＊ 十数秒かかります。閉じずにお待ちください。</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-10">
      <label htmlFor="theme-name" className="block text-sm tracking-widest text-kinari/60">
        {copy.label}
      </label>
      <input
        id="theme-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={copy.maxLength}
        required
        placeholder={copy.placeholder}
        className="mt-3 w-full rounded-md border border-kinari/20 bg-kinari/5 px-4 py-3 text-kinari outline-none focus:border-kin"
      />

      {error !== null && (
        <p className="mt-4 rounded-md border border-shu/50 bg-shu/10 px-4 py-3 text-sm text-kinari">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={name.trim() === ""}
        className="mt-8 rounded-md border border-shu bg-shu/15 px-10 py-3 tracking-[0.2em] text-kinari transition-colors hover:bg-shu/25 disabled:border-kinari/15 disabled:bg-transparent disabled:text-kinari/30"
      >
        {copy.submit}
      </button>
    </form>
  );
}
