import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { errResponse } from "@/common/response/helpers";
import { HttpError } from "@/common/errors";
import { settings } from "@/common/config/settings";
import extractRoute from "@/routers/extract";

const app = new Hono();

app.use(requestId());
app.use(
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: false,
  }),
);

app.onError((err, c) => {
  if (err instanceof HttpError)
    return errResponse(c, { message: err.message }, err.status as 400);
  return errResponse(c, { message: "Internal server error" }, 500);
});

app.route("/extract-tasks", extractRoute);

app.get("/health", (c) => c.json({ status: "ok" }));

export default { port: settings.server.port, fetch: app.fetch };
