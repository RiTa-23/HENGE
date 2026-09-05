import { ping } from "@henge/shared";
import { Hono } from "hono";
import { sessionRoutes } from "./routes/sessions";
import { themeRoutes } from "./routes/themes";
// 【一時的】検証用。POST /themes が入ったら消す（#82）
import { spike } from "./spike";

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
  .route("/", sessionRoutes);

export type AppType = typeof routes;

app.route("/", spike);

export default app;
