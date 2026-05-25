import { createAIClient } from "@/common/clients/ai/factory";
import type { ExtractInput, ExtractOutput } from "./types";

export async function extractTasks(data: ExtractInput): Promise<ExtractOutput> {
  const client = createAIClient("openai");
  const titles = await client.extractTasks(data.email_body, data.table);
  return titles.map((title) => ({ title }));
}
