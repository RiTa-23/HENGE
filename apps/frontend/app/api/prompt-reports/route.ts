import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { limitPromptReport } from "@/lib/api/rate-limit";
import { promptReportSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/**
 * おかしなお題の報告。リザルト画面から、そのプレイで出たお題をまとめて送る。
 *
 * **報告されたお題はその場で配信から外れる**（管理者が復帰か削除かを決める）。
 * 匿名で受けると連投でテーマの在庫を空にできてしまうので、**ログインユーザーのみ**。
 * 読み違い報告（匿名可）とはここが違う。
 */
export async function POST(request: Request) {
  const userId = await currentUserId(request);
  if (userId === null) return errorResponse("UNAUTHORIZED");

  // 連投は入力検証より先に弾く
  const limited = await limitPromptReport(userId);
  if (limited !== null) return limited;

  const parsed = promptReportSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(await client["prompt-reports"].$post({ json: { ...parsed.data, userId } }));
}
