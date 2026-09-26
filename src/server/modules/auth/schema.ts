import { z } from 'zod'

export const signupSchema = z.object({
  organizationName: z.string().trim().min(2, 'Business name is too short').max(80),
  name: z.string().trim().min(2, 'Your name is too short').max(80),
  email: z.email('Enter a valid email address').toLowerCase().trim(),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
})

export const loginSchema = z.object({
  email: z.email('Enter a valid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Enter your password'),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
