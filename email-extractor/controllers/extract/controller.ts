import { createAIClient } from "@/common/clients/ai/factory";
import { log } from "@/common/logger";
import type { ExtractInput, ExtractOutput } from "./types";

export async function extractTasks(data: ExtractInput): Promise<ExtractOutput> {
  log.info("CTRL", `Extracting tasks`, { table: data.table, email_body_len: data.email_body.length })

  const client = createAIClient("openai")
  const titles = await client.extractTasks(data.email_body, data.table)

  log.success("CTRL", `AI returned ${titles.length} task(s)`, { tasks: titles })
  return titles.map((title) => ({ title }))
}
