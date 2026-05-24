import { z } from "zod";

export const TaskCreateSchema = z.object({
    title: z.string().trim().min(1),
    client_id: z.string().uuid(),
    status: z.enum([
        "To Be Started",
        "In Progress",
        "Pending Review",
        "Completed",
        "Implemented",
        "Blocked"
    ]).optional(),
    category: z.string().trim().optional().nullable(),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']).default('P2'),
    position: z.number().default(0),
    link_url: z.string().url().optional().nullable(),
    link_urls: z.array(z.string().url()).max(5).optional().nullable(),
    assigned_to: z.union([z.string(), z.array(z.string())]).optional().nullable(),
    eta_end: z.string().optional().nullable(),
    started_date: z.string().optional().nullable(),
    team_label: z.string().optional().nullable(),
    remarks: z.string().optional().nullable(),
    internal_approval: z.enum(["Pending", "Approved", "Required Changes"]).optional(),
    client_feedback_note: z.string().optional().nullable(),
    comments: z.string().optional().nullable(),
    comments_for_client: z.string().optional().nullable()
}).strict();

export const TaskUpdateSchema = TaskCreateSchema.partial().extend({
    id: z.string().optional(),
    updated_at: z.union([z.string(), z.date()]).optional(),
    client_name: z.string().optional(),
    assigned_to_name: z.string().optional().nullable(),
    assigned_to_names: z.array(z.string()).optional()
}).passthrough();

export const TaskBulkSchema = z.object({
    tasks: z.array(TaskCreateSchema.omit({ status: true }))
}).strict();
