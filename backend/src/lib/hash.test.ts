import { describe, expect, it } from 'vitest'
import { generateErrorHash } from './hash.js'

describe('generateErrorHash', () => {
  it('is stable for the same error signature', () => {
    const first = generateErrorHash('js_error', 'Cannot read properties of undefined', 'app.js')
    const second = generateErrorHash('js_error', 'Cannot read properties of undefined', 'app.js')
    expect(first).toBe(second)
  })

  it('separates errors that differ in type, message or source', () => {
    const base = generateErrorHash('js_error', 'boom', 'app.js')
    expect(generateErrorHash('promise_error', 'boom', 'app.js')).not.toBe(base)
    expect(generateErrorHash('js_error', 'boom!', 'app.js')).not.toBe(base)
    expect(generateErrorHash('js_error', 'boom', 'vendor.js')).not.toBe(base)
  })

  it('treats a missing source the same as an empty one', () => {
    expect(generateErrorHash('js_error', 'boom')).toBe(generateErrorHash('js_error', 'boom', ''))
    expect(generateErrorHash('js_error', 'boom', null)).toBe(generateErrorHash('js_error', 'boom', ''))
  })

  it('produces a short fixed-width hex id', () => {
    expect(generateErrorHash('js_error', 'boom', 'app.js')).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('fingerprint normalisation', () => {
  it('groups messages that differ only in embedded ids and numbers', () => {
    expect(generateErrorHash('js_error', 'Order 81723 not found', 'app.js')).toBe(
      generateErrorHash('js_error', 'Order 5 not found', 'app.js')
    )
    expect(generateErrorHash('js_error', 'User 3fa85f64-5717-4562-b3fc-2c963f66afa6 missing')).toBe(
      generateErrorHash('js_error', 'User 9b2c1d00-0000-4000-8000-000000000001 missing')
    )
  })

  it('ignores query strings in URLs inside the message', () => {
    expect(generateErrorHash('resource_error', 'Failed to load <img>: https://cdn.x/a.png?v=1')).toBe(
      generateErrorHash('resource_error', 'Failed to load <img>: https://cdn.x/a.png?v=2')
    )
  })

  it('keeps an issue stable across deploys that rename bundles', () => {
    expect(generateErrorHash('js_error', 'boom', 'https://x/assets/index-3f9a1c2b.js')).toBe(
      generateErrorHash('js_error', 'boom', 'https://x/assets/index-77aa00ff.js?v=3')
    )
  })

  it('still separates genuinely different messages', () => {
    expect(generateErrorHash('js_error', "Cannot read properties of undefined (reading 'id')")).not.toBe(
      generateErrorHash('js_error', "Cannot read properties of undefined (reading 'name')")
    )
  })
})
