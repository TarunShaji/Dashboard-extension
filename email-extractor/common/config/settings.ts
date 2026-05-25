function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required config: ${key}`);
  return v;
}

export const settings = {
  openai: {
    apiKey: required("OPENAI_API_KEY"),
    model: process.env["OPENAI_MODEL"] ?? "gpt-4o-mini",
  },
  server: {
    port: Number(process.env["PORT"]) || 8787,
  },
};
