import { createHash } from 'node:crypto'

/**
 * Error messages routinely embed ids, counts and URLs ("Order 81723 not found",
 * "Failed to load https://cdn/x.png?v=9"). Hashing them raw opens a new issue
 * per value, so the variable parts are replaced before fingerprinting.
 */
function normalizeMessage(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    // Long hex runs (hashes, addresses) — only when they contain a digit, so
    // ordinary words made of a-f letters survive.
    .replace(/\b(?:0x)?[0-9a-f]{8,}\b/gi, (match) => (/\d/.test(match) ? '<hex>' : match))
    .replace(/(https?:\/\/[^\s?#'"]+)[?#][^\s'"]*/g, '$1')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Script URLs change on every deploy (`index-3f9a1c2b.js`, `app.js?v=12`), which
 * would turn every release into a fresh set of issues. Query, fragment and
 * content-hash segments are dropped.
 */
function normalizeSource(source: string | null | undefined): string {
  if (!source) return ''
  return source
    .replace(/[?#].*$/, '')
    .replace(/[.-][0-9a-f]{6,}(?=\.[a-z]+$)/i, '')
}

export function generateErrorHash(type: string, message: string, source?: string | null): string {
  const input = `${type}:${normalizeMessage(message)}:${normalizeSource(source)}`
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}
