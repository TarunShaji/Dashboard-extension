import { z } from "zod";

export const ContentSchema = z.object({
    // ─── Core ────────────────────────────────────────────────────────────────
    blog_title: z.string().trim().min(1),
    client_id: z.string().uuid(),
    position: z.number().default(0),

    // ─── Spreadsheet: Week / Keyword / Writer ─────────────────────────────────
    week: z.string().optional().nullable(),
    primary_keyword: z.string().trim().optional().nullable(),
    secondary_keywords: z.string().optional().nullable(),
    blog_type: z.string().optional().nullable(),
    writer: z.string().optional().nullable(),

    // ─── Spreadsheet: Search Volume ───────────────────────────────────────────
    search_volume: z.number().int().nonnegative().optional().nullable(),

    // ─── Spreadsheet: Outline ────────────────────────────────────────────────
    outline_status: z.enum(["Pending", "Submitted", "Approved", "Rejected"]).default("Pending"),
    outline_link: z.string().url().optional().nullable(),   // Link to outline Google Doc

    // ─── Spreadsheet: Dates ──────────────────────────────────────────────────
    required_by: z.string().optional().nullable(),
    date_edited: z.string().optional().nullable(),
    date_sent_for_approval: z.string().optional().nullable(),
    date_approved: z.string().optional().nullable(),
    published_date: z.string().optional().nullable(),
    blog_approval_date: z.string().optional().nullable(),   // Auto-set by portal when client approves

    // ─── Spreadsheet: Quality Metrics ────────────────────────────────────────
    raw_submission_rating: z.string().optional().nullable(),
    ai_score: z.string().optional().nullable(),

    // ─── Priority ─────────────────────────────────────────────────────────────
    content_priority: z.enum(['P0', 'P1', 'P2']).optional().nullable(),

    // ─── Intern Status (writer-facing workflow) ───────────────────────────────
    intern_status: z.enum([
        "Assigned",
        "Making Outlines",
        "Submitted",
        "Rejected",
        "Rework",
    ]).optional().nullable(),

    // ─── Lifecycle Statuses ───────────────────────────────────────────────────
    blog_status: z.enum([
        "Draft",
        "In Progress",
        "Sent for Approval",
        "Approved",
        "Published",
        "Rejected"
    ]).default("Draft"),
    topic_approval_status: z.enum(["Pending", "Approved", "Rejected"]).default("Pending"),
    blog_internal_approval: z.enum(["Pending", "Approved"]).default("Pending"),
    blog_approval_status: z.enum(["Pending Review", "Approved", "Changes Required"]).default("Pending Review"),

    // ─── Links ────────────────────────────────────────────────────────────────
    /** blog_doc_link: Google Doc / Draft URL — what gets sent to clients */
    blog_doc_link: z.string().url().optional().nullable(),
    /** blog_link: Live published website URL */
    blog_link: z.string().url().optional().nullable(),

    // ─── Client Visibility ────────────────────────────────────────────────────
    client_link_visible_blog: z.boolean().default(false),

    // ─── Client Feedback ──────────────────────────────────────────────────────
    blog_client_feedback_note: z.string().optional().nullable(),
    blog_client_feedback_at: z.union([z.string(), z.date()]).optional().nullable(),
}).strict();

export const ContentUpdateSchema = ContentSchema.partial().extend({
    client_name: z.string().optional(),
    updated_at: z.union([z.string(), z.date()]).optional()
}).passthrough();
