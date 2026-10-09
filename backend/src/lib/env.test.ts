import { describe, expect, it } from 'vitest'
import { parseTrustProxy } from './env.js'

describe('parseTrustProxy', () => {
  it('trusts no proxy by default', () => {
    expect(parseTrustProxy('')).toBe(false)
    expect(parseTrustProxy('false')).toBe(false)
  })

  it('accepts a hop count', () => {
    expect(parseTrustProxy('1')).toBe(1)
  })

  it('accepts a list of addresses or subnets', () => {
    expect(parseTrustProxy('10.0.0.0/8, 127.0.0.1')).toEqual(['10.0.0.0/8', '127.0.0.1'])
  })

  // Trusting every hop makes X-Forwarded-For client-controlled again.
  it('refuses "true"', () => {
    expect(() => parseTrustProxy('true')).toThrow(/unsafe/)
  })
})
