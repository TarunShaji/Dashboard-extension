import { z } from "zod";

export const EmailTaskSchema = z.object({
    title: z.string().trim().min(1),
    client_id: z.string().uuid(),
    status: z.enum([
        "To Be Started",
        "In Progress",
        "Pending Review",
        "Completed",
        "Implemented",
        "Blocked"
    ]).default("To Be Started"),

    assigned_to: z.union([z.string(), z.array(z.string())]).optional().nullable(),
    started_date: z.string().optional().nullable(),
    team_label: z.string().optional().nullable(),
    link_url: z.string().optional().nullable(),
    link_urls: z.array(z.string().url()).max(5).optional().nullable(),
    internal_approval: z.enum(["Pending", "Approved"]).default("Pending"),
    client_approval: z.enum(["Pending", "Approved", "Required Changes"]).optional().nullable(),
    client_feedback_note: z.string().optional().nullable(),
    campaign_live_date: z.string().optional().nullable(),
    live_data: z.string().optional().nullable(),
    remarks: z.string().optional().nullable(),
    comments: z.string().optional().nullable(),
    position: z.number().default(0),
    created_at: z.union([z.string(), z.date()]).optional(),
    updated_at: z.union([z.string(), z.date()]).optional(),
}).strict();

export const EmailTaskUpdateSchema = EmailTaskSchema.partial().extend({
    id: z.string().optional(),
    client_name: z.string().optional(),
    assigned_to_name: z.string().optional().nullable(),
    assigned_to_names: z.array(z.string()).optional()
}).passthrough();

export const EmailBulkSchema = z.object({
    tasks: z.array(EmailTaskSchema)
}).strict();
