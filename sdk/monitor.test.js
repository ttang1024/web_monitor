import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MonitoringSDK from './monitor.js'

/** Builds an SDK whose transport is a stub, so nothing leaves the test. */
function createSdk(options = {}, fetchImpl) {
	const sdk = new MonitoringSDK('sk_test', {
		baseUrl: 'https://api.test',
		flushInterval: 1000,
		...options,
	})
	sdk.transportFetch = fetchImpl ?? vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) })
	return sdk
}

let sdks = []

function track(sdk) {
	sdks.push(sdk)
	return sdk
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(new Date('2026-08-04T12:00:00Z'))
})

afterEach(() => {
	for (const sdk of sdks) sdk.destroy()
	sdks = []
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe('error capture', () => {
	it('queues a captured error with page context', () => {
		const sdk = track(createSdk({ batchSize: 100 }))

		sdk.captureError(new Error('boom'), { feature: 'checkout' })

		expect(sdk.batchQueue).toHaveLength(1)
		const { kind, payload } = sdk.batchQueue[0]
		expect(kind).toBe('errors')
		expect(payload.message).toBe('boom')
		expect(payload.metadata).toEqual({ feature: 'checkout' })
		expect(payload.url).toBe(window.location.href)
		expect(payload.timestamp).toBe(Date.now())
	})

	it('never queues an error without a message', () => {
		const sdk = track(createSdk({ batchSize: 100 }))

		sdk.recordError({ type: 'js_error', message: '' })

		expect(sdk.batchQueue[0].payload.message).toBe('Unknown error')
	})

	it('stops repeating the same error past the per-page cap', () => {
		const sdk = track(createSdk({ batchSize: 1000, maxErrorRepeats: 3 }))

		for (let i = 0; i < 10; i++) sdk.captureError(new Error('looping'))

		expect(sdk.batchQueue).toHaveLength(3)
	})

	it('caps repeats per signature, not globally', () => {
		const sdk = track(createSdk({ batchSize: 1000, maxErrorRepeats: 2 }))

		for (let i = 0; i < 5; i++) sdk.captureError(new Error('first'))
		for (let i = 0; i < 5; i++) sdk.captureError(new Error('second'))

		expect(sdk.batchQueue).toHaveLength(4)
	})
})

describe('queue and batching', () => {
	it('flushes once the batch size is reached', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) })
		const sdk = track(createSdk({ batchSize: 3 }, fetchMock))

		sdk.captureCustomEvent('one', {})
		sdk.captureCustomEvent('two', {})
		expect(fetchMock).not.toHaveBeenCalled()

		sdk.captureCustomEvent('three', {})
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('drops the oldest events instead of growing without bound', () => {
		const sdk = track(createSdk({ batchSize: 10_000, maxQueueSize: 5 }))

		for (let i = 0; i < 20; i++) sdk.captureCustomEvent(`event-${i}`, {})

		expect(sdk.batchQueue).toHaveLength(5)
		expect(sdk.batchQueue.at(-1).payload.name).toBe('event-19')
	})

	it('groups a mixed queue into one payload per event type', () => {
		const sdk = track(createSdk({ batchSize: 10_000 }))

		sdk.captureError(new Error('boom'))
		sdk.captureCustomEvent('signup', {})
		sdk.captureMetric('latency', 120)

		const batch = sdk.mergeBatch(sdk.batchQueue)
		expect(Object.keys(batch).sort()).toEqual(['customEvents', 'errors'])
		expect(batch.errors).toHaveLength(1)
		expect(batch.customEvents).toHaveLength(2)
	})

	it('sends the API key and the ingest mutation', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) })
		const sdk = track(createSdk({ batchSize: 1 }, fetchMock))

		sdk.captureCustomEvent('signup', { plan: 'pro' })
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe('https://api.test/graphql')
		expect(init.headers['X-API-Key']).toBe('sk_test')
		expect(JSON.parse(init.body).query).toContain('ingestBatch')
	})
})

describe('transport failures', () => {
	it('re-queues events when the network fails', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
		const sdk = track(createSdk({ batchSize: 1000 }, fetchMock))
		vi.spyOn(console, 'error').mockImplementation(() => {})

		sdk.captureCustomEvent('signup', {})
		await sdk.flush()

		expect(sdk.batchQueue).toHaveLength(1)
		expect(sdk.consecutiveFailures).toBe(1)
	})

	it('backs off further after each consecutive failure', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
		const sdk = track(createSdk({ batchSize: 1000, flushInterval: 1000 }, fetchMock))
		vi.spyOn(console, 'error').mockImplementation(() => {})

		sdk.captureCustomEvent('signup', {})
		await sdk.flush()
		const firstDelay = sdk.nextRetryAt - Date.now()

		sdk.nextRetryAt = 0
		await sdk.flush()
		const secondDelay = sdk.nextRetryAt - Date.now()

		expect(secondDelay).toBeGreaterThan(firstDelay)
	})

	it('does not retry while the backoff window is open', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
		const sdk = track(createSdk({ batchSize: 1000 }, fetchMock))
		vi.spyOn(console, 'error').mockImplementation(() => {})

		sdk.captureCustomEvent('signup', {})
		await sdk.flush()
		await sdk.flush()

		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('drops a batch the backend rejects as invalid, instead of retrying forever', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
		const sdk = track(createSdk({ batchSize: 1000 }, fetchMock))
		vi.spyOn(console, 'error').mockImplementation(() => {})

		sdk.captureCustomEvent('signup', {})
		await sdk.flush()

		expect(sdk.batchQueue).toHaveLength(0)
		expect(sdk.nextRetryAt).toBe(0)
	})

	it('retries a server error', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
		const sdk = track(createSdk({ batchSize: 1000 }, fetchMock))
		vi.spyOn(console, 'error').mockImplementation(() => {})

		sdk.captureCustomEvent('signup', {})
		await sdk.flush()

		expect(sdk.batchQueue).toHaveLength(1)
	})

	it('drops a batch GraphQL rejected with an errors array', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ errors: [{ message: 'Validation failed' }] }),
		})
		const sdk = track(createSdk({ batchSize: 1000 }, fetchMock))
		vi.spyOn(console, 'error').mockImplementation(() => {})

		sdk.captureCustomEvent('signup', {})
		await sdk.flush()

		expect(sdk.batchQueue).toHaveLength(0)
	})

	it('clears the failure count once a flush succeeds', async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) })
		const sdk = track(createSdk({ batchSize: 1000 }, fetchMock))
		vi.spyOn(console, 'error').mockImplementation(() => {})

		sdk.captureCustomEvent('signup', {})
		await sdk.flush()
		sdk.nextRetryAt = 0
		await sdk.flush()

		expect(sdk.consecutiveFailures).toBe(0)
		expect(sdk.batchQueue).toHaveLength(0)
	})
})

describe('business flows', () => {
	it('emits one event with steps and duration when a flow completes', () => {
		const sdk = track(createSdk({ batchSize: 10_000 }))

		const flow = sdk.startFlow('checkout', { context: { cartId: 'c1' } })
		flow.step('address_entered')
		vi.advanceTimersByTime(2_000)
		flow.step('payment_submitted', { method: 'card' })
		flow.complete({ orderId: 'o1' })

		const events = sdk.batchQueue.filter((item) => item.payload.name === 'business_flow')
		expect(events).toHaveLength(1)

		const data = events[0].payload.data
		expect(data.status).toBe('completed')
		expect(data.flow).toBe('checkout')
		expect(data.durationMs).toBe(2_000)
		expect(data.steps.map((step) => step.name)).toEqual(['address_entered', 'payment_submitted'])
		expect(data.lastStep).toBe('payment_submitted')
		expect(data.context).toEqual({ cartId: 'c1' })
		expect(data.result).toEqual({ orderId: 'o1' })
	})

	it('reports a failed flow with its reason', () => {
		const sdk = track(createSdk({ batchSize: 10_000 }))

		const flow = sdk.startFlow('checkout')
		flow.step('address_entered')
		flow.fail('payment_declined')

		const data = sdk.batchQueue.at(-1).payload.data
		expect(data.status).toBe('failed')
		expect(data.reason).toBe('payment_declined')
	})

	it('times out a flow that never finishes', () => {
		const sdk = track(createSdk({ batchSize: 10_000 }))

		sdk.startFlow('checkout', { timeout: 5_000 })
		vi.advanceTimersByTime(5_001)

		expect(sdk.batchQueue.at(-1).payload.data.status).toBe('timeout')
	})

	it('ignores steps and second completions after a flow ends', () => {
		const sdk = track(createSdk({ batchSize: 10_000 }))

		const flow = sdk.startFlow('checkout')
		flow.complete()
		flow.step('too_late')
		flow.complete()

		const events = sdk.batchQueue.filter((item) => item.payload.name === 'business_flow')
		expect(events).toHaveLength(1)
		expect(events[0].payload.data.steps).toHaveLength(0)
	})

	it('marks flows still open when the page goes away as abandoned', () => {
		// finalize() closes open flows and immediately flushes them, so the
		// evidence is in the request body rather than the queue.
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) })
		const sdk = track(createSdk({ batchSize: 10_000 }, fetchMock))

		sdk.startFlow('checkout')
		sdk.finalize()

		const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
		const flowEvent = sent.variables.input.customEvents.find((event) => event.name === 'business_flow')
		expect(flowEvent.data.status).toBe('abandoned')
		expect(fetchMock.mock.calls[0][1].keepalive).toBe(true)
	})
})

describe('custom events', () => {
	it('tags events with the identified user and session', () => {
		const sdk = track(createSdk({ batchSize: 10_000 }))
		sdk.setUser('user_1')

		sdk.captureCustomEvent('signup', { plan: 'pro' })

		const payload = sdk.batchQueue.at(-1).payload
		expect(payload.userId).toBe('user_1')
		expect(payload.sessionId).toMatch(/^s_/)
	})

	it('records a metric as a named custom event', () => {
		const sdk = track(createSdk({ batchSize: 10_000 }))

		sdk.captureMetric('search_latency_ms', 420, { page: 'inbox' })

		const payload = sdk.batchQueue.at(-1).payload
		expect(payload.name).toBe('metric')
		expect(payload.data).toEqual({ metric: 'search_latency_ms', value: 420, tags: { page: 'inbox' } })
	})

	it('reuses one session id across events', () => {
		const sdk = track(createSdk({ batchSize: 10_000 }))

		sdk.captureCustomEvent('a', {})
		sdk.captureCustomEvent('b', {})

		const [first, second] = sdk.batchQueue.slice(-2)
		expect(first.payload.sessionId).toBe(second.payload.sessionId)
	})
})

describe('teardown', () => {
	it('restores the patched fetch and XHR methods', () => {
		const originalFetch = window.fetch
		const originalOpen = XMLHttpRequest.prototype.open
		const originalSend = XMLHttpRequest.prototype.send

		const sdk = createSdk()
		expect(window.fetch).not.toBe(originalFetch)

		sdk.destroy()

		expect(window.fetch).toBe(originalFetch)
		expect(XMLHttpRequest.prototype.open).toBe(originalOpen)
		expect(XMLHttpRequest.prototype.send).toBe(originalSend)
	})

	it('does not report requests the SDK itself makes', () => {
		const sdk = track(createSdk())
		expect(sdk.isOwnRequest('https://api.test/graphql')).toBe(true)
		expect(sdk.isOwnRequest('https://example.com/api/cart')).toBe(false)
	})
})
