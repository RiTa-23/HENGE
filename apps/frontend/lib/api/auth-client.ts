import { createAuthClient } from "better-auth/react";

/**
 * Better Auth のクライアント。同一オリジンの `/api/auth/*` を指すため
 * baseURL は省略できる。
 */
export const authClient = createAuthClient();
