import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { successResponse } from "@/common/response/helpers";
import { extractTasks } from "@/controllers/extract/controller";
import { log } from "@/common/logger";
import { ExtractSchema } from "./types";

const router = new Hono();

router.post(
  "/",
  zValidator("json", ExtractSchema, (result, c) => {
    if (!result.success) {
      log.warn("ROUTER", "Validation failed", result.error.flatten().fieldErrors)
      return c.json({ success: false, data: { message: "Invalid request body", errors: result.error.flatten().fieldErrors } }, 400)
    }
  }),
  async (c) => {
    const data  = c.req.valid("json")
    const id    = c.get("requestId") ?? "-"
    log.info("ROUTER", `Received extract request`, {
      requestId: id,
      table:          data.table,
      email_body_len: data.email_body.length,
    })

    const tasks = await extractTasks(data)

    log.success("ROUTER", `Returning ${tasks.length} task(s)`, { requestId: id })
    return successResponse(c, { tasks })
  },
)

export default router;
