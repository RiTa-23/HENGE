"use client";

import type { PromptForm } from "@henge/shared";
import { useEffect, useState } from "react";
import { RankingRegister } from "@/components/play/RankingRegister";
import {
  clearPendingRanking,
  type PendingRanking,
  readPendingRanking,
} from "@/lib/play/pending-ranking";

/**
 * ログイン前に遊んだ記録の登録。結果画面で未ログインのまま「Googleでログイン」を
 * 押すと記録が退避され（`RankingRegister`）、ログインから戻ったこのプレイ画面の
 * 開始前に出る。
 *
 * **出すのはこのプールの、30分以内の記録だけ**（`readPendingRanking`）。登録の結果が
 * 出たら（通った・断られた）消す。同じ記録は2度と通らない（チケットは使い捨て）ので、
 * 出し続けても押せないボタンが残るだけになる。
 *
 * sessionStorage は描画してから読む（初回描画で読むと、サーバーの出力と食い違って
 * hydration が壊れる）。
 */
export function PendingRankingRegister({
  themeId,
  form,
  rankingHref,
}: {
  themeId: string;
  form: PromptForm;
  rankingHref: string;
}) {
  const [pending, setPending] = useState<PendingRanking | null>(null);

  useEffect(() => {
    setPending(readPendingRanking(themeId, form));
  }, [themeId, form]);

  if (pending === null) return null;

  return (
    <div className="w-full max-w-lg">
      <RankingRegister
        themeId={pending.themeId}
        form={pending.form}
        score={pending.score}
        ticket={pending.ticket}
        playLog={pending.log}
        rankingHref={rankingHref}
        lead={
          <p className="tracking-widest text-kinari">
            ログイン前の記録
            <span className="ml-3 font-mono text-2xl text-kin">{pending.score}</span>
          </p>
        }
        onSettled={clearPendingRanking}
      />
    </div>
  );
}
