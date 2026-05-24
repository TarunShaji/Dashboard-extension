import { z } from "zod";

export const ReportSchema = z.object({
    title: z.string().trim().min(1),
    client_id: z.string().uuid(),
    report_url: z.string().min(1),
    report_date: z.string(),
    report_type: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
}).strict();
