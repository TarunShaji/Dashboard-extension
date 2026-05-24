import { z } from "zod";

export const SOCIAL_FORMATS = ['Static', 'Reel', 'Text', 'Carousel', 'Story', 'Poll'];

export const SocialTaskSchema = z.object({
    client_id: z.string().uuid(),
    format: z.enum(['Static', 'Reel', 'Text', 'Carousel', 'Story', 'Poll']).optional().nullable(),
    reference_link: z.string().optional().nullable(),
    visual_brief: z.string().optional().nullable(),
    content: z.string().optional().nullable(),
    caption: z.string().optional().nullable(),
    content_draft_link: z.string().optional().nullable(),

    // Send gates — set by internal "Send" actions; reset approval on re-send
    content_idea_sent: z.boolean().optional().default(false),
    content_draft_sent: z.boolean().optional().default(false),

    // Approvals — set by client via portal
    content_idea_approval: z.enum(['Pending', 'Approved', 'Required Changes', 'Rejected']).optional().default('Pending'),
    content_idea_feedback: z.string().optional().nullable(),
    content_draft_approval: z.enum(['Pending', 'Approved', 'Required Changes', 'Rejected']).optional().default('Pending'),
    draft_feedback: z.string().optional().nullable(),

    // Internal-only fields — not tied to lifecycle
    internal_approval: z.enum(['Approved', 'Rejected', 'Needs Attention']).optional().nullable(),
    status: z.enum(['To Be Started', 'In Progress', 'Completed', 'Implemented', 'Blocked', 'Posted']).optional().nullable(),

    // Always visible to client when set — no gate needed
    live_link: z.string().optional().nullable(),
    posting_date: z.string().optional().nullable(),

    assigned_to: z.union([z.string(), z.array(z.string())]).optional().nullable(),
    started_date: z.string().optional().nullable(),
    team_label: z.string().optional().nullable(),
    comments: z.string().optional().nullable(),
    position: z.number().default(0),
    created_at: z.union([z.string(), z.date()]).optional(),
    updated_at: z.union([z.string(), z.date()]).optional(),
}).strict();

export const SocialTaskUpdateSchema = SocialTaskSchema.partial().extend({
    id: z.string().optional(),
    client_name: z.string().optional(),
    assigned_to_name: z.string().optional().nullable(),
    assigned_to_names: z.array(z.string()).optional()
}).passthrough();

export const SocialBulkSchema = z.object({
    tasks: z.array(SocialTaskSchema)
}).strict();
