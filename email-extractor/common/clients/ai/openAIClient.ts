import OpenAI from "openai";
import { settings } from "@/common/config/settings";
import { HttpError } from "@/common/errors";
import type { IAIClient } from "./iAIClient";

const TABLE_CONTEXT: Record<string, string> = {
  seo: "SEO tasks (meta descriptions, backlinks, keyword rankings, content optimisation, technical SEO fixes)",
  email:
    "email marketing tasks (campaigns, newsletters, A/B tests, list management, automation flows)",
  paid: "paid advertising tasks (Google Ads, Meta Ads, budget adjustments, creative updates, reporting)",
};

export class OpenAIClient implements IAIClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: settings.openai.apiKey });
  }

  async extractTasks(emailBody: string, table: string): Promise<string[]> {
    const context = TABLE_CONTEXT[table];
    if (!context) {
      console.warn(`[OpenAIClient] Unknown table key: "${table}", using generic context`);
    }
    const resolvedContext = context ?? "general digital marketing tasks";

    const systemPrompt = `You are a task extraction assistant for a digital marketing agency.
Extract actionable tasks from client emails. Focus on ${resolvedContext}.
Return a JSON object with a "tasks" key containing an array of short, clear task title strings.
Each title must be concise (under 80 characters), action-oriented, and specific.
If no tasks are found, return { "tasks": [] }.`;

    const userPrompt = `Extract tasks from this email:\n\n${emailBody}`;

    let response: OpenAI.Chat.ChatCompletion;
    try {
      response = await this.client.chat.completions.create({
        model: settings.openai.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "task_list",
            strict: true,
            schema: {
              type: "object",
              properties: {
                tasks: { type: "array", items: { type: "string" } },
              },
              required: ["tasks"],
              additionalProperties: false,
            },
          },
        },
        max_tokens: 500,
        temperature: 0.2,
      });
    } catch (err: unknown) {
      const status = (err as { status?: number }).status ?? 502;
      throw new HttpError(`OpenAI request failed: ${(err as Error).message}`, status);
    }

    const message = response.choices[0]?.message?.content;
    if (!message) throw new HttpError("OpenAI returned no content", 502);

    let parsed: { tasks: unknown[] };
    try {
      parsed = JSON.parse(message);
    } catch {
      throw new HttpError("AI returned invalid JSON", 502);
    }

    return parsed.tasks.filter(
      (t): t is string => typeof t === "string" && t.trim().length > 0,
    );
  }
}
