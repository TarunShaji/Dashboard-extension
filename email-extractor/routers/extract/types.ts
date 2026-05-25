import { z } from "zod";

export const ExtractSchema = z.object({
  email_body: z.string().min(1, "email_body is required"),
  table: z.enum(["seo", "email", "paid"]),
});

export type ExtractSchemaInput = z.infer<typeof ExtractSchema>;
