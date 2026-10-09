import { describe, expect, it } from 'vitest'
import { readCookie } from './session.js'

describe('readCookie', () => {
  it('finds the named cookie among others', () => {
    expect(readCookie('a=1; wm_refresh=abc%2Bdef; b=2', 'wm_refresh')).toBe('abc+def')
  })

  it('returns undefined when absent or malformed', () => {
    expect(readCookie(undefined, 'wm_refresh')).toBeUndefined()
    expect(readCookie('other=1', 'wm_refresh')).toBeUndefined()
    expect(readCookie('wm_refresh=%E0%A4%A', 'wm_refresh')).toBeUndefined()
  })

  it('does not match a cookie whose name merely ends with the name', () => {
    expect(readCookie('xwm_refresh=evil', 'wm_refresh')).toBeUndefined()
  })
})
