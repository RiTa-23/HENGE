import { ping } from "@henge/shared";
import { Hono } from "hono";
import { generateRoutes } from "./routes/generate";
import { sessionRoutes } from "./routes/sessions";
import { themeRoutes } from "./routes/themes";
import { usageRoutes } from "./routes/usage";

/**
 * Hono Worker。外部には公開しない。
 * Next.js Worker から Service Bindings（HTTP方式）経由でのみ呼ばれる。
 */
const app = new Hono<{ Bindings: Env }>();

const routes = app
  .get("/health", (c) =>
    c.json({
      service: "henge-backend",
      shared: ping("backend"),
      ok: true,
    }),
  )
  .route("/", themeRoutes)
  .route("/", sessionRoutes)
  .route("/", generateRoutes)
  .route("/", usageRoutes);

export type AppType = typeof routes;

export default app;
