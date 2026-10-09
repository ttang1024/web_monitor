import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isAllowedWebhookUrl, isPrivateAddress, postWebhook, WebhookBlockedError } from './safeWebhook.js'

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('blocks %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows public %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false)
  })
})

describe('isAllowedWebhookUrl', () => {
  it('accepts a public https URL', () => {
    expect(isAllowedWebhookUrl('https://hooks.slack.com/services/x', false)).toBe(true)
  })

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:4000/graphql',
    'http://127.0.0.1:3306',
    'http://[::1]/',
    'http://metadata.google.internal/',
    'ftp://example.com/',
    'https://user:pass@example.com/',
    'not a url',
  ])('rejects %s', (url) => {
    expect(isAllowedWebhookUrl(url, false)).toBe(false)
  })

  it('allows private targets only when explicitly enabled', () => {
    expect(isAllowedWebhookUrl('http://localhost:9000/hook', true)).toBe(true)
  })
})

describe('postWebhook', () => {
  let server: http.Server
  let port: number
  let hits = 0

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      hits += 1
      res.writeHead(204).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('refuses a hostname that resolves to a private address, at connect time', async () => {
    // "localtest.me"-style names aren't available offline; a bare hostname that
    // resolves to loopback exercises the same lookup hook.
    const before = hits
    await expect(
      postWebhook(`http://127.0.0.1.nip.invalid:${port}/`, {}, { allowPrivate: false })
    ).rejects.toThrow()
    await expect(postWebhook(`http://127.0.0.1:${port}/`, {}, { allowPrivate: false })).rejects.toBeInstanceOf(
      WebhookBlockedError
    )
    expect(hits).toBe(before)
  })

  it('delivers when private targets are allowed', async () => {
    const response = await postWebhook(`http://127.0.0.1:${port}/`, { ok: true }, { allowPrivate: true })
    expect(response.status).toBe(204)
  })
})
