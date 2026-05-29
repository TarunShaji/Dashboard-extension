import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"

const OUTPUTS_DIR = join(import.meta.dir, "../../outputs")

export interface RunData {
  table:        string
  emailBody:    string
  systemPrompt: string
  userPrompt:   string
  rawResponse:  string
  tasks:        string[]
  model:        string
  usage:        { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null
  durationMs:   number
}

export function saveRun(data: RunData): void {
  if (process.env["DEBUG_SAVE_RUNS"] !== "true") return

  try {
    mkdirSync(OUTPUTS_DIR, { recursive: true })

    const ts       = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `${ts}__${data.table}.txt`
    const filepath = join(OUTPUTS_DIR, filename)

    const content = [
      "═".repeat(60),
      `  AI RUN — ${new Date().toISOString()}`,
      "═".repeat(60),
      "",
      `TABLE        : ${data.table}`,
      `MODEL        : ${data.model}`,
      `DURATION     : ${data.durationMs}ms`,
      `TOKENS       : prompt=${data.usage?.prompt_tokens ?? "?"} completion=${data.usage?.completion_tokens ?? "?"} total=${data.usage?.total_tokens ?? "?"}`,
      "",
      "─".repeat(60),
      "  EMAIL BODY",
      "─".repeat(60),
      data.emailBody,
      "",
      "─".repeat(60),
      "  SYSTEM PROMPT",
      "─".repeat(60),
      data.systemPrompt,
      "",
      "─".repeat(60),
      "  USER PROMPT",
      "─".repeat(60),
      data.userPrompt,
      "",
      "─".repeat(60),
      "  RAW AI RESPONSE",
      "─".repeat(60),
      data.rawResponse,
      "",
      "─".repeat(60),
      "  PARSED TASKS",
      "─".repeat(60),
      ...data.tasks.map((t, i) => `  ${i + 1}. ${t}`),
      "",
      "═".repeat(60),
    ].join("\n")

    writeFileSync(filepath, content, "utf-8")
    console.log(`  \x1b[2m[DEBUG] Run saved → outputs/${filename}\x1b[0m`)
  } catch (err) {
    console.warn(`  [DEBUG] Could not save run file:`, err)
  }
}
