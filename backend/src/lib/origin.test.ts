import { describe, expect, it } from 'vitest'
import { isOriginAllowed, parseAllowedOrigins } from './origin.js'

describe('parseAllowedOrigins', () => {
  it('normalises to scheme://host[:port]', () => {
    expect(parseAllowedOrigins(['https://App.Example.com/dashboard?x=1'])).toEqual(['https://app.example.com'])
  })

  it('keeps the port, which is part of the origin', () => {
    expect(parseAllowedOrigins(['http://localhost:3000'])).toEqual(['http://localhost:3000'])
  })

  it('drops entries that are not URLs', () => {
    expect(parseAllowedOrigins(['not a url', 'example.com', 'https://ok.com'])).toEqual(['https://ok.com'])
  })

  // The column is free-form JSON, so it can hold anything a past bug wrote.
  it('treats a non-array value as no allowlist', () => {
    expect(parseAllowedOrigins(null)).toEqual([])
    expect(parseAllowedOrigins('https://example.com')).toEqual([])
    expect(parseAllowedOrigins({ origins: ['https://example.com'] })).toEqual([])
  })
})

describe('isOriginAllowed', () => {
  it('allows any origin when no allowlist is set', () => {
    expect(isOriginAllowed([], 'https://anywhere.com')).toBe(true)
    expect(isOriginAllowed([], undefined)).toBe(true)
  })

  it('allows an origin on the list', () => {
    expect(isOriginAllowed(['https://app.example.com'], 'https://app.example.com')).toBe(true)
  })

  it('ignores path and case when comparing', () => {
    expect(isOriginAllowed(['https://app.example.com'], 'https://APP.example.com/checkout')).toBe(true)
  })

  it('rejects an origin that is not on the list', () => {
    expect(isOriginAllowed(['https://app.example.com'], 'https://evil.com')).toBe(false)
  })

  // Someone copying a key out of page source and using it from curl sends no
  // Origin at all; a key with an allowlist must not accept that.
  it('rejects a missing origin once an allowlist exists', () => {
    expect(isOriginAllowed(['https://app.example.com'], undefined)).toBe(false)
  })

  it('does not treat a different scheme or port as the same origin', () => {
    expect(isOriginAllowed(['https://app.example.com'], 'http://app.example.com')).toBe(false)
    expect(isOriginAllowed(['http://localhost:3000'], 'http://localhost:3001')).toBe(false)
  })

  // A subdomain match would let any host under the domain report.
  it('does not allow subdomains implicitly', () => {
    expect(isOriginAllowed(['https://example.com'], 'https://evil.example.com')).toBe(false)
  })
})
