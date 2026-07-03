import { z, ZodSchema } from 'zod'
import { BadRequestError } from './errors.js'

export const registerSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  tenantName: z.string().min(1, 'Tenant name is required'),
  domain: z.string().min(1, 'Domain is required'),
})

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export function validate<T>(schema: ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const errors: Record<string, string[]> = {}
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'input'
      errors[key] = [...(errors[key] ?? []), issue.message]
    }
    throw new BadRequestError('Validation failed', errors)
  }
  return result.data
}
