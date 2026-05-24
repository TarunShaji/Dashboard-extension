import { z } from 'zod'

export const PortalTaskApprovalSchema = z.object({
    client_approval: z.enum(['Pending Review', 'Approved', 'Required Changes']),
    client_feedback_note: z.string().optional().nullable(),
    service: z.string().optional(), // 'seo', 'email', 'paid'
    updated_at: z.string().or(z.date()).optional()
})

// Social tasks use a two-stage approval model (idea + draft), separate from the standard flow
export const PortalSocialApprovalSchema = z.object({
    service: z.literal('social'),
    approval_type: z.enum(['content_idea', 'content_draft']),
    approval_value: z.enum(['Pending', 'Approved', 'Required Changes', 'Rejected']),
    feedback: z.string().optional().nullable(),
    updated_at: z.string().or(z.date()).optional()
})

export const PortalContentApprovalSchema = z.object({
    topic_approval_status: z.enum(['Pending', 'Approved', 'Rejected']).optional(),
    blog_approval_status: z.enum(['Pending Review', 'Approved', 'Changes Required']).optional(),
    blog_client_feedback_note: z.string().optional().nullable(),
    blog_link: z.string().url().optional().nullable(),
    updated_at: z.string().or(z.date()).optional()
})
