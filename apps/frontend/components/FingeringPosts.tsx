"use client";

import { isApiError } from "@henge/shared";
import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/api/auth-client";
import { fingerLabel } from "@/lib/play/fingers";
import {
  decodeFingering,
  encodeFingering,
  FINGERING_NOTE_MAX,
  type Fingering,
  fingeringUnits,
  isDefaultFingering,
  sameFingering,
  standardFingers,
} from "@/lib/practice/fingering";

/** 公開API（`GET /api/fingerings`）の1件。投稿者のIDは載っていない */
interface PostResponse {
  id: string;
  displayName: string | null;
  fingering: unknown;
  note: string | null;
  pickCount: number;
  mine: boolean;
  deletable: boolean;
}

interface Post extends Omit<PostResponse, "fingering"> {
  fingering: Fingering;
}

/**
 * 運指を文字で短く書く。「き ki ― K 右 人差し指・I 右 薬指」。
 * **標準と違う指だけ色を付ける**（どこを崩した運指なのかが一目で分かるように）
 */
function FingeringSummary({ sound, fingering }: { sound: string; fingering: Fingering }) {
  return (
    <div className="grid gap-1">
      {fingeringUnits(sound).map((kana, i) => {
        const unit = fingering.units[i];
        if (unit == null) {
          return (
            <p key={i} className="text-xs text-kinari/40">
              <span className="mr-2 font-mincho text-base text-kinari">{kana}</span>標準のまま
            </p>
          );
        }
        const standard = standardFingers(unit.roman) ?? [];
        return (
          <p key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
            <span className="font-mincho text-base text-kinari">{kana}</span>
            <span className="font-mono tracking-wider text-kinari/80">{unit.roman}</span>
            {[...unit.roman].map((letter, j) => {
              const finger = unit.fingers[j];
              const s = standard[j];
              const changed =
                finger !== undefined &&
                (s === undefined || s.hand !== finger.hand || s.finger !== finger.finger);
              return (
                <span key={j} className={changed ? "text-daidai" : "text-kinari/50"}>
                  <span className="font-mono">{letter.toUpperCase()}</span>{" "}
                  {finger === undefined ? "―" : fingerLabel(finger)}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}

/**
 * みんなが投稿した運指（docs/07-ui.md「運指の投稿」）。
 *
 * - **選ぶ**: 「この運指を使う」で自分の運指（localStorage）に写す（`onUse`）。ログイン中なら
 *   選んだことを記録する（一覧の並び順＝選んだ人数）。匿名は記録しない（不変条件10）
 * - **投稿する**: 自分のいまの運指（`current`）を、任意の説明文を添えて投稿する。
 *   要ログイン・ユーザー名あり。標準運指そのものは投稿できない
 * - **消す**: 投稿者本人と運営（`deletable` はサーバーが判定して返す）
 *
 * 一覧は描画してから取る（ログイン状態で「自分の投稿か」「消せるか」が変わるため）。
 * 音と合わない投稿（形の壊れたもの）は出さない。
 */
export function FingeringPosts({
  themeId,
  sound,
  current,
  onUse,
}: {
  themeId: string;
  /** 最適化する音 */
  sound: string;
  /** いま画面に出す運指（この端末で決めた運指 → 既定 → 標準）。null は標準運指 */
  current: Fingering | null;
  /** 投稿を選んだとき。自分の運指として保存するのは呼び出し側 */
  onUse: (fingering: Fingering) => void;
}) {
  const { data: session, isPending } = authClient.useSession();
  /**
   * 描画し終えたか。**投稿の欄はセッションが分かってから出す。** サーバーの描画では
   * セッションが分からないので、クライアントで先に「ログイン中」と分かっていると
   * 文言が食い違って hydration が壊れる（初回描画は両方とも何も出さない）
   */
  const [mounted, setMounted] = useState(false);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/fingerings?themeId=${encodeURIComponent(themeId)}`);
    if (!response.ok) {
      setPosts([]);
      return;
    }
    const body = (await response.json()) as { posts: PostResponse[] };
    setPosts(
      body.posts.flatMap((post) => {
        const fingering = decodeFingering(post.fingering, sound);
        return fingering === null ? [] : [{ ...post, fingering }];
      }),
    );
  }, [themeId, sound]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 運指を変えたら、前の投稿の結果（「投稿しました」など）は消す。いまの運指の話ではない
  useEffect(() => {
    setMessage(null);
  }, [current]);

  const use = (post: Post) => {
    onUse(post.fingering);
    // 数えるのはログインユーザーだけ。失敗しても運指の適用には響かない
    if (session != null) {
      void fetch(`/api/fingerings/${encodeURIComponent(post.id)}/pick`, { method: "PUT" }).then(
        () => load(),
      );
    }
  };

  const remove = async (post: Post) => {
    const response = await fetch(`/api/fingerings/${encodeURIComponent(post.id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body: unknown = await response.json();
      setMessage(isApiError(body) ? body.error.message : "消せませんでした");
      return;
    }
    await load();
  };

  const submit = async () => {
    if (current === null) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/fingerings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId, fingering: encodeFingering(current), note }),
    });
    const body: unknown = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(isApiError(body) ? body.error.message : "投稿できませんでした");
      return;
    }
    setNote("");
    setMessage("投稿しました");
    await load();
  };

  const standard = current === null || isDefaultFingering(sound, current);
  const alreadyPosted =
    current !== null && (posts ?? []).some((post) => sameFingering(sound, post.fingering, current));

  return (
    <div className="grid gap-5 text-left">
      {posts === null ? (
        <p className="text-sm text-kinari/40">読み込んでいます</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-kinari/50">
          まだ投稿がありません。自分の運指を最初に投稿できます。
        </p>
      ) : (
        <ul className="grid gap-3">
          {posts.map((post) => {
            const inUse = current !== null && sameFingering(sound, post.fingering, current);
            return (
              <li
                key={post.id}
                className={`grid gap-2 rounded-md border px-4 py-3 ${
                  inUse ? "border-kin/60 bg-kin/5" : "border-kinari/15"
                }`}
              >
                <FingeringSummary sound={sound} fingering={post.fingering} />
                {post.note !== null && (
                  <p className="text-sm leading-relaxed text-kinari/80">{post.note}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-kinari/50">
                  <span>{post.displayName ?? "名無し"}</span>
                  <span>{post.pickCount}人が選択</span>
                  {post.mine && <span className="text-kin">あなたの投稿</span>}
                  <span className="ml-auto flex gap-2">
                    {inUse ? (
                      <span className="rounded-full border border-kin/50 px-3 py-0.5 text-kinari/70">
                        使用中
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => use(post)}
                        className="rounded-full border border-kinari/20 px-3 py-0.5 tracking-widest text-kinari/80 transition-colors hover:border-kin hover:text-kinari"
                      >
                        この運指を使う
                      </button>
                    )}
                    {post.deletable && (
                      <button
                        type="button"
                        onClick={() => void remove(post)}
                        className="rounded-full border border-kinari/15 px-3 py-0.5 tracking-widest text-kinari/50 transition-colors hover:border-shu hover:text-kinari"
                      >
                        消す
                      </button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 投稿するのは、上で決めた自分のいまの運指 */}
      <div className="grid gap-3 rounded-md border border-dashed border-kinari/20 px-4 py-4">
        <p className="text-sm text-kinari/70">自分の運指を投稿する</p>
        {!mounted || isPending ? null : session == null ? (
          <p className="text-xs text-kinari/50">ログインすると、いまの運指を投稿できます。</p>
        ) : standard ? (
          <p className="text-xs text-kinari/50">
            標準の運指は投稿できません。上で打ち方や指を変えると投稿できます。
          </p>
        ) : alreadyPosted ? (
          <p className="text-xs text-kinari/50">いまの運指は既に投稿されています。</p>
        ) : (
          <>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={FINGERING_NOTE_MAX}
              placeholder={`説明（任意・${FINGERING_NOTE_MAX}文字まで）`}
              aria-label="運指の説明"
              className="w-full rounded-md border border-kinari/20 bg-kinari/5 px-3 py-2 text-sm text-kinari outline-none focus:border-kin"
            />
            <div>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="rounded-md border border-shu bg-shu/15 px-5 py-1.5 text-sm tracking-widest text-kinari transition-colors hover:bg-shu/25 disabled:opacity-40"
              >
                いまの運指を投稿する
              </button>
            </div>
          </>
        )}
        {message !== null && <p className="text-xs text-kinari/60">{message}</p>}
      </div>
    </div>
  );
}
