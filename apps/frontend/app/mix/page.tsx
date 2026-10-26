import { MIX_CHAOS_NAME } from "@henge/shared";
import { permanentRedirect } from "next/navigation";
import { detailHref } from "@/lib/ui/kind";

/**
 * 旧URL。ごちゃまぜが1つだけだった頃の詳細（X投稿で共有されている）。
 * **共有済みのリンクを壊さない**ため、いまのごちゃまぜの詳細へ転送する。
 */
export default function LegacyMixPage(): never {
  permanentRedirect(detailHref("mix", MIX_CHAOS_NAME));
}
