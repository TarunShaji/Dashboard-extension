import { HttpError } from "@/common/errors";
import type { IAIClient } from "./iAIClient";
import { OpenAIClient } from "./openAIClient";

export function createAIClient(provider: "openai" | "anthropic" = "openai"): IAIClient {
  if (provider === "openai") return new OpenAIClient();
  // if (provider === "anthropic") return new AnthropicClient();
  throw new HttpError(`Unknown AI provider: ${provider}`, 400);
}
