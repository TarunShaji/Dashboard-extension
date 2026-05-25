import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { successResponse } from "@/common/response/helpers";
import { extractTasks } from "@/controllers/extract/controller";
import { ExtractSchema } from "./types";

const router = new Hono();

router.post("/", zValidator("json", ExtractSchema), async (c) => {
  const data = c.req.valid("json");
  const tasks = await extractTasks(data);
  return successResponse(c, { tasks });
});

export default router;
