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
