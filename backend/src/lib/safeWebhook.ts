import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { env } from './env.js'

/**
 * Outbound webhook delivery that cannot be pointed at our own network.
 *
 * A webhook URL is chosen by the tenant and requested by the server, so without
 * this a tenant could reach the cloud metadata service, the database, or
 * anything else only the API can see. The check runs on the address the socket
 * actually connects to (via the `lookup` hook), not on a separate DNS query,
 * so a hostname that re-resolves to a private address between check and
 * connect (DNS rebinding) is still refused. Redirects are not followed.
 */

const BLOCKED_V4 = new net.BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. broadcast
] as const) {
  BLOCKED_V4.addSubnet(network, prefix, 'ipv4')
}

const BLOCKED_V6 = new net.BlockList()
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
  // IPv4-mapped / -compatible forms reach an IPv4 host; DNS returns real IPv4
  // addresses as IPv4, so these only ever appear as hand-written literals.
  ['::ffff:0:0', 96],
  ['::', 96],
  ['64:ff9b::', 96], // NAT64
] as const) {
  BLOCKED_V6.addSubnet(network, prefix, 'ipv6')
}

export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) return BLOCKED_V4.check(address, 'ipv4')
  if (family === 6) return BLOCKED_V6.check(address, 'ipv6')
  return true
}

export class WebhookBlockedError extends Error {
  constructor() {
    super('Webhook address is not allowed (private or internal network)')
    this.name = 'WebhookBlockedError'
  }
}

/**
 * Cheap up-front check for rule validation: rejects IP literals and names that
 * obviously point inward. The authoritative check happens at connect time.
 */
export function isAllowedWebhookUrl(value: string, allowPrivate = env.WEBHOOK_ALLOW_PRIVATE_NETWORKS): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  if (allowPrivate) return true

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false
  if (net.isIP(host)) return !isPrivateAddress(host)
  return true
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number
) => void

function guardedLookup(allowPrivate: boolean) {
  return (hostname: string, options: dns.LookupOptions, callback: LookupCallback): void => {
    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, [])
      const list = addresses as dns.LookupAddress[]
      if (!allowPrivate && list.some((entry) => isPrivateAddress(entry.address))) {
        return callback(new WebhookBlockedError() as NodeJS.ErrnoException, [])
      }
      if (options.all) return callback(null, list)
      callback(null, list[0].address, list[0].family)
    })
  }
}

export interface WebhookResponse {
  status: number
}

/** POSTs JSON to `target`, refusing internal destinations. Resolves with the status code. */
export function postWebhook(
  target: string,
  payload: unknown,
  { timeoutMs = 5_000, allowPrivate = env.WEBHOOK_ALLOW_PRIVATE_NETWORKS } = {}
): Promise<WebhookResponse> {
  if (!isAllowedWebhookUrl(target, allowPrivate)) return Promise.reject(new WebhookBlockedError())

  const url = new URL(target)
  const body = JSON.stringify(payload)
  const transport = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'web-monitor-alerts/1',
        },
        lookup: guardedLookup(allowPrivate) as unknown as typeof dns.lookup,
        timeout: timeoutMs,
      },
      (response) => {
        // Body is irrelevant; drain it so the socket is released.
        response.resume()
        resolve({ status: response.statusCode ?? 0 })
      }
    )
    request.on('timeout', () => request.destroy(new Error(`Webhook timed out after ${timeoutMs}ms`)))
    request.on('error', reject)
    request.end(body)
  })
}
