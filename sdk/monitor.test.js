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

	it('posts to the ingest endpoint as a CORS simple request', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({}) })
		const sdk = track(createSdk({ batchSize: 1 }, fetchMock))

		sdk.captureCustomEvent('signup', { plan: 'pro' })
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe('https://api.test/ingest?key=sk_test')
		// text/plain and no custom headers: no preflight round trip per batch.
		expect(init.headers).toEqual({ 'Content-Type': 'text/plain' })
		const body = JSON.parse(init.body)
		expect(body.batchId).toMatch(/^b_[\w-]+$/)
		expect(body.customEvents[0].name).toBe('signup')
	})

	it('keeps every request under the 64KB keepalive/beacon limit', () => {
		const sdk = track(createSdk({ batchSize: 10_000, maxQueueSize: 10_000 }))
		for (let i = 0; i < 100; i++) sdk.captureCustomEvent('big', { blob: 'x'.repeat(2_000) })

		const batches = []
		for (let batch = sdk.takeBatch(); batch; batch = sdk.takeBatch()) batches.push(batch)

		expect(batches.length).toBeGreaterThan(1)
		expect(batches.reduce((sum, batch) => sum + batch.items.length, 0)).toBe(100)
		for (const batch of batches) expect(sdk.body(batch).length).toBeLessThanOrEqual(60 * 1024)
	})

	it('drops a single event too large to ever send rather than blocking the queue', () => {
		const sdk = track(createSdk({ batchSize: 10_000 }))
		sdk.captureCustomEvent('huge', { blob: 'x'.repeat(100_000) })
		sdk.captureCustomEvent('small', {})

		const batch = sdk.takeBatch()
		expect(batch.items.map((item) => item.payload.name)).toEqual(['small'])
	})
})

describe('transport failures', () => {
	it('re-queues events when the network fails', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
		const sdk = track(createSdk({ batchSize: 1000 }, fetchMock))
		vi.spyOn(console, 'error').mockImplementation(() => {})

		sdk.captureCustomEvent('signup', {})
		await sdk.flush()

		expect(sdk.retryBatch.items).toHaveLength(1)
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

		expect(sdk.retryBatch.items).toHaveLength(1)
	})

	// The backend uses the id to skip a batch it already stored, so a retry
	// after a lost response must not get a fresh one.
	it('resends a failed batch with its original id', async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({ ok: true, status: 202, json: async () => ({}) })
		const sdk = track(createSdk({ batchSize: 1000 }, fetchMock))
		vi.spyOn(console, 'error').mockImplementation(() => {})

		sdk.captureCustomEvent('signup', {})
		await sdk.flush()
		sdk.nextRetryAt = 0
		await sdk.flush()

		const [first, second] = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).batchId)
		expect(second).toBe(first)
	})

	it('retries when rate limited, waiting at least as long as Retry-After', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			headers: new Headers({ 'Retry-After': '120' }),
			json: async () => ({}),
		})
		const sdk = track(createSdk({ batchSize: 1000, flushInterval: 1000 }, fetchMock))
		vi.spyOn(console, 'error').mockImplementation(() => {})

		sdk.captureCustomEvent('signup', {})
		await sdk.flush()

		expect(sdk.retryBatch.items).toHaveLength(1)
		expect(sdk.nextRetryAt - Date.now()).toBeGreaterThanOrEqual(120_000)
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
		expect(sdk.retryBatch).toBeNull()
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

		// jsdom has no sendBeacon, so this exercises the keepalive fallback.
		const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
		const flowEvent = sent.customEvents.find((event) => event.name === 'business_flow')
		expect(flowEvent.data.status).toBe('abandoned')
		expect(fetchMock.mock.calls[0][1].keepalive).toBe(true)
	})

	it('hands the final flush to sendBeacon when the browser has it', () => {
		const beacon = vi.fn().mockReturnValue(true)
		Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({}) })
		const sdk = track(createSdk({ batchSize: 10_000 }, fetchMock))

		sdk.captureCustomEvent('signup', {})
		sdk.finalize()

		expect(beacon).toHaveBeenCalledWith('https://api.test/ingest?key=sk_test', expect.any(Blob))
		expect(fetchMock).not.toHaveBeenCalled()
		delete navigator.sendBeacon
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

describe('early errors', () => {
	afterEach(() => {
		window.__monitorQueue = undefined
	})

	it('reports errors the inline snippet caught before the SDK loaded, then stops the queue', () => {
		window.__monitorQueue = [
			new ErrorEvent('error', { message: 'too early', filename: 'app.js', lineno: 3 }),
			Object.assign(new Event('unhandledrejection'), { reason: new Error('early rejection') }),
		]

		const sdk = track(createSdk({ batchSize: 100 }))

		expect(sdk.batchQueue.map(({ payload }) => [payload.type, payload.message])).toEqual([
			['js_error', 'too early'],
			['promise_error', 'early rejection'],
		])
		expect(window.__monitorQueue).toBeNull()
	})
})

describe('slow requests', () => {
	it('reports a successful request slower than the limit, with its duration', () => {
		const sdk = track(createSdk({ batchSize: 100, slowRequestMs: 1000 }))

		sdk.recordResponse('https://example.com/api/search', 'GET', 200, 'OK', 2500)
		sdk.recordResponse('https://example.com/api/cart', 'GET', 200, 'OK', 400)

		expect(sdk.batchQueue).toHaveLength(1)
		expect(sdk.batchQueue[0].payload).toMatchObject({
			type: 'slow_request',
			requestUrl: 'https://example.com/api/search',
			status: 200,
			durationMs: 2500,
		})
	})

	it('reports an HTTP error as a failure whatever its speed', () => {
		const sdk = track(createSdk({ batchSize: 100, slowRequestMs: 1000 }))

		sdk.recordResponse('https://example.com/api/cart', 'POST', 500, 'Server Error', 5000)

		expect(sdk.batchQueue[0].payload).toMatchObject({ type: 'http_error', status: 500, durationMs: 5000 })
	})

	it('caps a slow endpoint hit repeatedly, and can be turned off', () => {
		const capped = track(createSdk({ batchSize: 100, slowRequestMs: 1000, maxErrorRepeats: 2 }))
		for (let i = 0; i < 5; i++) capped.recordResponse('https://example.com/api/poll', 'GET', 200, 'OK', 2000)
		expect(capped.batchQueue).toHaveLength(2)

		const off = track(createSdk({ batchSize: 100, slowRequestMs: 0 }))
		off.recordResponse('https://example.com/api/poll', 'GET', 200, 'OK', 60000)
		expect(off.batchQueue).toHaveLength(0)
	})
})

describe('route changes', () => {
	afterEach(() => {
		window.history.replaceState(null, '', '/')
	})

	it('counts each new URL as a page view, ignoring pushes to the same URL', () => {
		const sdk = track(createSdk({ batchSize: 100 }))

		window.history.pushState(null, '', '/orders')
		window.history.pushState(null, '', '/orders')
		window.history.pushState(null, '', '/orders?page=2')

		const views = sdk.batchQueue.filter(({ payload }) => payload.navigationType === 'route')
		expect(views.map(({ payload }) => new URL(payload.url).pathname + new URL(payload.url).search)).toEqual([
			'/orders',
			'/orders?page=2',
		])
	})

	it('counts back and forward navigation', () => {
		const sdk = track(createSdk({ batchSize: 100 }))
		window.history.replaceState(null, '', '/previous')

		window.dispatchEvent(new PopStateEvent('popstate'))

		expect(sdk.batchQueue.map(({ payload }) => payload.navigationType)).toEqual(['route'])
	})

	it('restores pushState on teardown', () => {
		const original = window.history.pushState
		const sdk = createSdk()
		expect(window.history.pushState).not.toBe(original)

		sdk.destroy()

		expect(window.history.pushState).toBe(original)
	})
})

describe('INP', () => {
	const interaction = (interactionId, duration) => ({ interactionId, duration })

	it('is the slowest interaction, counting each interaction once', () => {
		const sdk = track(createSdk())

		sdk.recordInteraction(interaction(1, 80))
		sdk.recordInteraction(interaction(1, 120)) // keyup of the same keypress
		sdk.recordInteraction(interaction(2, 60))
		sdk.recordInteraction({ interactionId: 0, duration: 900 }) // not an interaction

		expect(sdk.vitals.inp).toBe(120)
		expect(sdk.interactionCount).toBe(2)
	})

	it('ignores one outlier for every 50 interactions', () => {
		const sdk = track(createSdk())

		sdk.recordInteraction(interaction(1, 2000))
		for (let id = 2; id <= 50; id++) sdk.recordInteraction(interaction(id, 100))

		expect(sdk.vitals.inp).toBe(100)
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
		expect(sdk.isOwnRequest('https://api.test/ingest?key=sk_test')).toBe(true)
		expect(sdk.isOwnRequest('https://example.com/api/cart')).toBe(false)
	})
})
