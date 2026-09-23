import { forbidNonAdmin } from "@/lib/api/admin";

export const dynamic = "force-dynamic";

/**
 * 管理者かどうかの判定だけを返す。**ヘッダーの「管理」導線を出すかの判定用。**
 * `/api/admin/*` 本来の認可は各ルートが持つので、ここは弾かずに常に200で
 * `{ isAdmin }` を返す（非管理者＝false）。
 *
 * 判定そのものは公開APIと同じ `forbidNonAdmin` を使う。画面用に別の判定を
 * 書くと、片方だけ直したときに気付けない。
 */
export async function GET(request: Request) {
  const denied = await forbidNonAdmin(request);
  return Response.json({ isAdmin: denied === null });
}
