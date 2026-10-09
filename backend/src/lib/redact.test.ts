import { describe, expect, it } from 'vitest'
import { redactHeaders, sanitizeUrl } from './redact.js'

describe('redactHeaders', () => {
  it('redacts known sensitive headers case-insensitively', () => {
    const result = redactHeaders({ Authorization: 'Bearer abc', 'X-Api-Key': 'k123', 'X-Request-Id': 'r1' })
    expect(result.Authorization).toBe('[REDACTED]')
    expect(result['X-Api-Key']).toBe('[REDACTED]')
    expect(result['X-Request-Id']).toBe('r1')
  })

  it('redacts cookies and set-cookie', () => {
    const result = redactHeaders({ Cookie: 'session=abc', 'Set-Cookie': 'session=abc' })
    expect(result.Cookie).toBe('[REDACTED]')
    expect(result['Set-Cookie']).toBe('[REDACTED]')
  })

  it('returns an empty object for null or undefined input', () => {
    expect(redactHeaders(null)).toEqual({})
    expect(redactHeaders(undefined)).toEqual({})
  })
})

describe('sanitizeUrl', () => {
  it('redacts sensitive query parameter values on an absolute URL', () => {
    const result = sanitizeUrl('https://app.example.com/reset?token=abc123&page=1')
    expect(result).toBe('https://app.example.com/reset?token=%5BREDACTED%5D&page=1')
  })

  it('redacts sensitive query parameter values on a relative URL', () => {
    const result = sanitizeUrl('/api/users?email=jane@example.com&sort=asc')
    expect(result).toBe('/api/users?email=%5BREDACTED%5D&sort=asc')
  })

  it('leaves URLs with no sensitive parameters unchanged', () => {
    const url = 'https://app.example.com/dashboard?page=2'
    expect(sanitizeUrl(url)).toBe(url)
  })

  it('leaves unparsable input unchanged instead of throwing', () => {
    expect(sanitizeUrl('not a url')).toBe('not a url')
  })
})
