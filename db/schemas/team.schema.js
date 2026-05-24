import { z } from 'zod'

export const TeamMemberSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
    role: z.string().optional().default('SEO'),
    is_active: z.boolean().optional().default(true),
    send_perm: z.boolean().optional(),
})
