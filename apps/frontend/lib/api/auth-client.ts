import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { createAuth } from "@/lib/auth";

/**
 * Better Auth のクライアント。同一オリジンの `/api/auth/*` を指すため
 * baseURL は省略できる。
 *
 * `inferAdditionalFields` はサーバー側の `additionalFields`（`displayName`）を
 * **型として**クライアントに伝えるためのもの。`import type` なので `lib/auth.ts` の
 * 実体（D1・シークレット）がクライアントのバンドルに入ることはない。
 * 実行時の値は元々セッションの応答に含まれていて、これが無くても届く。
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<ReturnType<typeof createAuth>>()],
});
