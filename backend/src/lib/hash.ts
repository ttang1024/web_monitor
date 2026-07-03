import { createHash } from 'node:crypto'

export function generateErrorHash(type: string, message: string, source?: string | null): string {
  const input = `${type}:${message}:${source ?? ''}`
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}
