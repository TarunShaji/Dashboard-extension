import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { join } from "path";
import { errResponse } from "@/common/response/helpers";
import { HttpError } from "@/common/errors";
import { settings } from "@/common/config/settings";
import { log } from "@/common/logger";
import extractRoute from "@/routers/extract";

const app = new Hono();

app.use(requestId());
app.use(
  cors({
    origin: settings.server.corsOrigin,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: false,
  }),
);

// ── Request / response logger ────────────────────────────────────────────────
app.use("*", async (c, next) => {
  const start = Date.now()
  const id    = c.get("requestId") ?? "-"
  log.info("HTTP", `→ ${c.req.method} ${c.req.path}`, { requestId: id })
  await next()
  const ms     = Date.now() - start
  const status = c.res.status
  const level  = status >= 500 ? "error" : status >= 400 ? "warn" : "success"
  log[level]("HTTP", `← ${c.req.method} ${c.req.path} ${status} (${ms}ms)`, { requestId: id })
})

// ── Global error handler ─────────────────────────────────────────────────────
app.onError((err, c) => {
  const id = c.get("requestId") ?? "-"
  if (err instanceof HttpError) {
    log.warn("APP", `HttpError ${err.status}: ${err.message}`, { requestId: id })
    return errResponse(c, { message: err.message }, err.status as 400)
  }
  log.error("APP", "Unhandled exception", err)
  return errResponse(c, { message: "Internal server error" }, 500)
})

app.route("/extract-tasks", extractRoute);

app.get("/updates.xml", (c) => {
  const base = settings.server.publicUrl
  const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='gcllnllfjddpennkliopepjckehokeop'>
    <updatecheck codebase='${base}/extension.crx' version='1.0' />
  </app>
</gupdate>`
  return c.text(xml, 200, { "Content-Type": "application/xml" })
})

app.get("/extension.crx", async (c) => {
  const file = Bun.file(join(import.meta.dir, "static/extension.crx"))
  if (!(await file.exists())) {
    return c.text("Extension not packaged yet", 404)
  }
  return new Response(file, {
    headers: { "Content-Type": "application/x-chrome-extension" },
  })
})

app.get("/health", (c) => {
  log.info("HEALTH", "ping")
  return c.json({ status: "ok" })
})

log.success("SERVER", `Started on port ${settings.server.port}`, { model: settings.openai.model })

export default { port: settings.server.port, fetch: app.fetch };
