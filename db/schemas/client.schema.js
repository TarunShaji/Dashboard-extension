import { z } from "zod";

export const ClientSchema = z.object({
    name: z.string().trim().min(1),
    service_type: z.array(z.string()).optional().nullable(),
    portal_password: z.string().optional().nullable(),
    slug: z.string().optional(), // Auto-generated usually, but sometimes passed
    // NPL / TPL / CPL — team member IDs (references to /api/team)
    npl_member_id: z.string().uuid().optional().nullable(),
    tpl_member_id: z.string().uuid().optional().nullable(),
    cpl_member_id: z.string().uuid().optional().nullable(),
    email: z.string().trim().optional().nullable(),           // Google Access ID
    website_access_id: z.string().trim().optional().nullable(), // Website Access ID
    is_churned: z.boolean().optional(),
    notification_emails: z.array(z.string().email()).optional().default([]),
    notification_slack_channel_ids: z.array(z.string().min(1)).optional().default([]),
    social_member_ids: z.array(z.string().uuid()).optional().default([]),
}).strict();
