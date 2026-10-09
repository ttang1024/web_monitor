// Browsers cap a keepalive fetch or sendBeacon body at 64KB in total; staying
// under it means the final flush on page hide actually gets out.
const MAX_REQUEST_BYTES = 60 * 1024

const DEFAULT_OPTIONS = {
	baseUrl: 'https://api.yourmonitoring.com',
	batchSize: 10,
	flushInterval: 5000,
	// Fraction of page loads that report performance metrics (errors are never sampled out).
	sampleRate: 1,
	maxQueueSize: 200,
	// Per-page cap for identical errors, so an error inside a loop cannot flood the backend.
	maxErrorRepeats: 10,
	flowTimeout: 30000,
	instrumentFetch: true,
	instrumentXhr: true,
	// Successful requests at least this slow (ms) are reported as slow_request; 0 turns it off.
	slowRequestMs: 3000,
	// Count single-page-app URL changes (history.pushState, back/forward) as page views.
	trackRouteChanges: true,
	// Ceiling for the backoff applied after failed flushes.
	maxRetryDelay: 5 * 60 * 1000,
}

class MonitoringSDK {
	constructor(apiKey, options = {}) {
		this.apiKey = apiKey
		this.options = { ...DEFAULT_OPTIONS, ...options }
		this.baseUrl = this.options.baseUrl

		this.batchQueue = []
		this.errorCounts = new Map()
		this.activeFlows = new Map()
		this.observers = []
		this.flowCounter = 0
		this.finalized = false
		this.consecutiveFailures = 0
		this.nextRetryAt = 0
		this.retryBatch = null
		this.sending = false

		this.userId = this.options.userId || null
		this.sessionId = this.resolveSessionId()
		this.samplePerformance = Math.random() < this.options.sampleRate

		// Web Vitals accumulated over the page's lifetime, reported once on first hide.
		this.vitals = { lcp: null, cls: null, inp: null }
		this.clsSession = { value: 0, entries: [] }
		// The slowest interactions seen so far, for INP.
		this.interactions = []
		this.interactionCount = 0

		// Keep an unpatched fetch for the SDK's own transport.
		this.transportFetch =
			typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null

		if (typeof window !== 'undefined') {
			this.init()
		}
	}

	init() {
		// --- Error monitoring ---
		this.onWindowError = e => this.handleWindowError(e)
		this.onRejection = e => this.handleRejection(e)
		// capture: true so resource load failures (img/script/link) are seen too.
		window.addEventListener('error', this.onWindowError, true)
		window.addEventListener('unhandledrejection', this.onRejection)
		this.drainEarlyErrors()

		// --- API monitoring ---
		if (this.options.instrumentFetch) this.instrumentFetch()
		if (this.options.instrumentXhr) this.instrumentXhr()

		// --- Page performance ---
		if (this.samplePerformance && typeof PerformanceObserver !== 'undefined') {
			this.observeWebVitals()
			this.captureNavigationTiming()
		}
		if (this.samplePerformance && this.options.trackRouteChanges) this.instrumentHistory()

		// --- Transport ---
		this.flushTimer = setInterval(() => this.flush(), this.options.flushInterval)
		this.onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') this.finalize()
		}
		this.onPageHide = () => this.finalize()
		document.addEventListener('visibilitychange', this.onVisibilityChange)
		window.addEventListener('pagehide', this.onPageHide)
	}

	// ------------------------------------------------------------------
	// Context
	// ------------------------------------------------------------------

	setUser(userId) {
		this.userId = userId
	}

	resolveSessionId() {
		try {
			let id = sessionStorage.getItem('monitoring_session_id')
			if (!id) {
				id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
				sessionStorage.setItem('monitoring_session_id', id)
			}
			return id
		} catch {
			return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
		}
	}

	baseFields() {
		return {
			url: window.location.href,
			userAgent: navigator.userAgent,
			timestamp: Date.now(),
		}
	}

	deviceInfo() {
		const ua = navigator.userAgent
		const browser = /edg\//i.test(ua)
			? 'Edge'
			: /chrome|crios/i.test(ua)
				? 'Chrome'
				: /firefox|fxios/i.test(ua)
					? 'Firefox'
					: /safari/i.test(ua)
						? 'Safari'
						: 'Other'
		const os = /windows/i.test(ua)
			? 'Windows'
			: /android/i.test(ua)
				? 'Android'
				: /iphone|ipad|ipod/i.test(ua)
					? 'iOS'
					: /mac os/i.test(ua)
						? 'macOS'
						: /linux/i.test(ua)
							? 'Linux'
							: 'Other'
		const type = /mobi|android|iphone/i.test(ua) ? 'mobile' : 'desktop'
		return { type, browser, os }
	}

	// ------------------------------------------------------------------
	// Layer 1: error monitoring (JS runtime + resources + promises)
	// ------------------------------------------------------------------

	handleWindowError(event) {
		// A window "error" event with a non-window target is a resource load failure.
		if (event.target && event.target !== window && event.target.tagName) {
			const el = event.target
			this.recordError({
				type: 'resource_error',
				message: `Failed to load <${el.tagName.toLowerCase()}>: ${el.src || el.href || ''}`,
				source: el.src || el.href || null,
			})
			return
		}

		this.recordError({
			type: 'js_error',
			message: event.message,
			stack: event.error?.stack,
			source: event.filename,
			lineNo: event.lineno,
			colNo: event.colno,
		})
	}

	handleRejection(event) {
		this.recordError({
			type: 'promise_error',
			message: event.reason?.message || String(event.reason),
			stack: event.reason?.stack,
		})
	}

	// Manual API for caught exceptions: monitor.captureError(err, { context })
	captureError(error, metadata) {
		this.recordError({
			type: 'js_error',
			message: error?.message || String(error),
			stack: error?.stack,
			metadata,
		})
	}

	recordError(error) {
		// The backend requires a non-null message; cross-origin scripts can emit errors without one.
		error.message = error.message || 'Unknown error'
		if (this.overRepeatCap(`${error.type}|${error.message}|${error.source || ''}|${error.lineNo || ''}`)) return

		this.addToBatch('errors', { ...error, ...this.baseFields() })
	}

	// True once the same signature has been reported maxErrorRepeats times on this page.
	overRepeatCap(signature) {
		const count = (this.errorCounts.get(signature) || 0) + 1
		this.errorCounts.set(signature, count)
		return count > this.options.maxErrorRepeats
	}

	// Errors the inline snippet (see README) caught before the SDK loaded.
	drainEarlyErrors() {
		const early = window.__monitorQueue
		window.__monitorQueue = null
		if (!Array.isArray(early)) return
		for (const event of early) {
			if (event.type === 'unhandledrejection') this.handleRejection(event)
			else this.handleWindowError(event)
		}
	}

	// ------------------------------------------------------------------
	// Layer 2: API monitoring (auto fetch/XHR + manual)
	// ------------------------------------------------------------------

	isOwnRequest(url) {
		return typeof url === 'string' && url.startsWith(this.baseUrl)
	}

	instrumentFetch() {
		if (!window.fetch) return
		this.originalFetch = window.fetch
		const original = window.fetch.bind(window)

		window.fetch = async (input, init = {}) => {
			const url =
				typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
			if (this.isOwnRequest(url)) return original(input, init)

			const method = (init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase()
			const start = performance.now()
			const elapsed = () => Math.round(performance.now() - start)
			try {
				const response = await original(input, init)
				this.recordResponse(url, method, response.status, response.statusText, elapsed())
				return response
			} catch (error) {
				this.captureApiError(url, method, null, error, elapsed())
				throw error
			}
		}
	}

	instrumentXhr() {
		if (!window.XMLHttpRequest) return
		// The patched methods below must stay `function`s so `this` is the
		// XMLHttpRequest being sent — which is exactly why the SDK instance has
		// to be reached through a variable instead.
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const sdk = this
		const proto = XMLHttpRequest.prototype
		this.originalXhrOpen = proto.open
		this.originalXhrSend = proto.send

		proto.open = function (method, url, ...rest) {
			this._monitoring = { method: String(method).toUpperCase(), url: String(url) }
			return sdk.originalXhrOpen.call(this, method, url, ...rest)
		}

		proto.send = function (...args) {
			const info = this._monitoring
			if (info && !sdk.isOwnRequest(info.url)) {
				const start = performance.now()
				const elapsed = () => Math.round(performance.now() - start)
				this.addEventListener('load', () => {
					sdk.recordResponse(info.url, info.method, this.status, this.statusText, elapsed())
				})
				this.addEventListener('error', () => {
					sdk.captureApiError(info.url, info.method, null, { message: 'Network error' }, elapsed())
				})
				this.addEventListener('timeout', () => {
					sdk.captureApiError(info.url, info.method, null, { message: 'Request timed out' }, elapsed())
				})
			}
			return sdk.originalXhrSend.apply(this, args)
		}
	}

	// A completed request: an HTTP error, a slow success, or nothing to report.
	recordResponse(requestUrl, method, status, statusText, durationMs) {
		if (status >= 400) {
			this.captureApiError(requestUrl, method, status, { message: `HTTP ${status} ${statusText}`.trim() }, durationMs)
			return
		}
		const limit = this.options.slowRequestMs
		if (!limit || durationMs < limit) return
		// A slow endpoint polled in a loop is capped like a repeating error.
		if (this.overRepeatCap(`slow|${method}|${requestUrl}`)) return
		this.addToBatch('apiErrors', {
			type: 'slow_request',
			requestUrl,
			method,
			status,
			durationMs,
			message: `Took ${durationMs}ms`,
			...this.baseFields(),
		})
	}

	captureApiError(requestUrl, method, status, error, durationMs) {
		this.addToBatch('apiErrors', {
			type: status ? 'http_error' : 'network_error',
			requestUrl,
			method,
			status,
			durationMs,
			message: error?.message,
			...this.baseFields(),
		})
	}

	// ------------------------------------------------------------------
	// Layer 3: page performance (navigation timing + Web Vitals)
	// ------------------------------------------------------------------

	observeWebVitals() {
		this.tryObserve('largest-contentful-paint', entries => {
			const last = entries[entries.length - 1]
			if (last) this.vitals.lcp = last.startTime
		})

		this.tryObserve('layout-shift', entries => {
			for (const entry of entries) {
				if (entry.hadRecentInput) continue
				const session = this.clsSession
				const first = session.entries[0]
				const last = session.entries[session.entries.length - 1]
				// Standard CLS session windows: gap < 1s, window < 5s.
				if (
					session.entries.length &&
					entry.startTime - last.startTime < 1000 &&
					entry.startTime - first.startTime < 5000
				) {
					session.value += entry.value
					session.entries.push(entry)
				} else {
					session.value = entry.value
					session.entries = [entry]
				}
				if (session.value > (this.vitals.cls || 0)) this.vitals.cls = session.value
			}
		})

		// INP: input to next paint for every interaction. 40ms is the lowest
		// threshold browsers honour; first-input catches a fast first tap too.
		const onInteractions = entries => entries.forEach(entry => this.recordInteraction(entry))
		this.tryObserve('event', onInteractions, { durationThreshold: 40 })
		this.tryObserve('first-input', onInteractions)
	}

	/**
	 * INP is the slowest interaction on the page, ignoring one outlier for
	 * every 50 interactions. Keeping the ten slowest is enough to answer that
	 * for pages with up to 500 interactions, the same shortcut web-vitals takes.
	 */
	recordInteraction(entry) {
		if (!entry.interactionId) return
		const existing = this.interactions.find(i => i.id === entry.interactionId)
		if (existing) {
			existing.duration = Math.max(existing.duration, entry.duration)
		} else {
			this.interactionCount += 1
			this.interactions.push({ id: entry.interactionId, duration: entry.duration })
		}
		this.interactions.sort((a, b) => b.duration - a.duration)
		this.interactions.length = Math.min(this.interactions.length, 10)

		const index = Math.min(Math.floor(this.interactionCount / 50), this.interactions.length - 1)
		this.vitals.inp = this.interactions[index].duration
	}

	tryObserve(type, callback, options = {}) {
		try {
			const observer = new PerformanceObserver(list => callback(list.getEntries()))
			observer.observe({ type, buffered: true, ...options })
			this.observers.push(observer)
		} catch {
			// Entry type not supported in this browser — skip it.
		}
	}

	captureNavigationTiming() {
		const send = () => {
			// loadEventEnd settles just after the load event; defer one tick.
			setTimeout(() => {
				const entry = performance.getEntriesByType('navigation')[0]
				if (!entry) return
				const paint = performance.getEntriesByType('paint')
				const fcp = paint.find(p => p.name === 'first-contentful-paint')

				this.addToBatch('performance', {
					...this.baseFields(),
					device: this.deviceInfo(),
					navigationType: 'load',
					metrics: {
						dns: entry.domainLookupEnd - entry.domainLookupStart,
						tcp: entry.connectEnd - entry.connectStart,
						ttfb: entry.responseStart - entry.startTime,
						response: entry.responseEnd - entry.responseStart,
						// Measured from navigation start — the numbers users actually feel.
						dom: entry.domContentLoadedEventEnd - entry.startTime,
						load: entry.loadEventEnd - entry.startTime,
						fcp: fcp ? fcp.startTime : null,
					},
				})
			}, 0)
		}

		if (document.readyState === 'complete') send()
		else window.addEventListener('load', send, { once: true })
	}

	// LCP/CLS/INP keep growing until the user leaves; report them once, on first hide.
	reportVitals() {
		if (!this.samplePerformance) return
		const { lcp, cls, inp } = this.vitals
		if (lcp === null && cls === null && inp === null) return

		this.addToBatch('performance', {
			...this.baseFields(),
			device: this.deviceInfo(),
			metrics: { lcp, cls, inp },
		})
		this.vitals = { lcp: null, cls: null, inp: null }
	}

	// Single-page apps change the URL without loading a page. Each change is a
	// page view; it carries no load timings, since the browser measures none.
	instrumentHistory() {
		this.lastPath = location.pathname + location.search
		this.onRouteChange = () => {
			const path = location.pathname + location.search
			if (path === this.lastPath) return
			this.lastPath = path
			this.addToBatch('performance', {
				...this.baseFields(),
				device: this.deviceInfo(),
				navigationType: 'route',
				metrics: {},
			})
		}

		this.originalPushState = history.pushState
		history.pushState = (...args) => {
			const result = this.originalPushState.apply(history, args)
			this.onRouteChange()
			return result
		}
		window.addEventListener('popstate', this.onRouteChange)
	}

	// ------------------------------------------------------------------
	// Layer 4: business-flow monitoring
	// ------------------------------------------------------------------

	// Track a business journey end to end, e.g.:
	//   const flow = monitor.startFlow('patient_first_message', { timeout: 60000 })
	//   flow.step('message_sent')
	//   flow.step('unread_badge_shown')
	//   flow.complete()            // or flow.fail('doctor_never_assigned')
	// Emits one custom event per flow with status completed | failed | timeout | abandoned,
	// every step with its offset from the start, and the total duration.
	startFlow(name, options = {}) {
		const id = `f_${++this.flowCounter}_${Date.now().toString(36)}`
		const flow = {
			id,
			name,
			startedAt: Date.now(),
			steps: [],
			context: options.context || {},
			done: false,
		}
		flow.timer = setTimeout(
			() => this.finishFlow(flow, 'timeout'),
			options.timeout || this.options.flowTimeout
		)
		this.activeFlows.set(id, flow)

		return {
			step: (stepName, data) => {
				if (flow.done) return
				flow.steps.push({ name: stepName, atMs: Date.now() - flow.startedAt, data })
			},
			complete: data => this.finishFlow(flow, 'completed', data),
			fail: (reason, data) => this.finishFlow(flow, 'failed', data, reason),
		}
	}

	finishFlow(flow, status, data, reason) {
		if (flow.done) return
		flow.done = true
		clearTimeout(flow.timer)
		this.activeFlows.delete(flow.id)

		this.captureCustomEvent('business_flow', {
			flow: flow.name,
			flowId: flow.id,
			status,
			durationMs: Date.now() - flow.startedAt,
			steps: flow.steps,
			lastStep: flow.steps.length ? flow.steps[flow.steps.length - 1].name : null,
			reason: reason || null,
			context: flow.context,
			result: data || null,
		})
	}

	// ------------------------------------------------------------------
	// Custom events & metrics
	// ------------------------------------------------------------------

	captureCustomEvent(name, data) {
		this.addToBatch('customEvents', {
			name,
			data: data || {},
			userId: this.userId,
			sessionId: this.sessionId,
			...this.baseFields(),
		})
	}

	// Numeric custom metric, e.g. monitor.captureMetric('search_latency_ms', 420, { page: 'inbox' })
	captureMetric(name, value, tags) {
		this.captureCustomEvent('metric', { metric: name, value, tags: tags || {} })
	}

	// ------------------------------------------------------------------
	// Transport
	// ------------------------------------------------------------------

	addToBatch(kind, payload) {
		if (this.batchQueue.length >= this.options.maxQueueSize) {
			this.batchQueue.shift()
		}
		this.batchQueue.push({ kind, payload })

		if (this.batchQueue.length >= this.options.batchSize) {
			this.flush()
		}
	}

	mergeBatch(queue) {
		const batch = {}
		for (const { kind, payload } of queue) {
			;(batch[kind] = batch[kind] || []).push(payload)
		}
		return batch
	}

	newBatchId() {
		const random =
			typeof crypto !== 'undefined' && crypto.randomUUID
				? crypto.randomUUID()
				: `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
		return `b_${random}`.replace(/[^\w-]/g, '').slice(0, 64)
	}

	/**
	 * Takes as many queued events as fit in one request, oldest first. An event
	 * too large to fit on its own is dropped rather than blocking the queue.
	 * The batch id travels with the batch through retries, so the backend can
	 * tell a retry of a batch it already stored from a new one.
	 */
	takeBatch() {
		const items = []
		const batchId = this.newBatchId()
		while (this.batchQueue.length > 0) {
			const candidate = [...items, this.batchQueue[0]]
			const size = JSON.stringify({ batchId, ...this.mergeBatch(candidate) }).length
			if (size > MAX_REQUEST_BYTES) {
				if (items.length === 0) this.batchQueue.shift()
				else break
			} else {
				items.push(this.batchQueue.shift())
			}
		}
		return items.length ? { batchId, items } : null
	}

	ingestUrl() {
		// Key in the query string and a text/plain body make this a CORS "simple
		// request": no preflight per batch, and exactly what sendBeacon can send.
		return `${this.baseUrl}/ingest?key=${encodeURIComponent(this.apiKey)}`
	}

	body(batch) {
		return JSON.stringify({ batchId: batch.batchId, ...this.mergeBatch(batch.items) })
	}

	// Rejections that will never succeed: bad key, malformed or oversized
	// payload. 408/429 (and 5xx) do succeed later, so those are retried.
	isPermanentFailure(status) {
		return status >= 400 && status < 500 && status !== 408 && status !== 429
	}

	async flush({ final = false } = {}) {
		if (!this.transportFetch) return
		// Backing off after a failure — but a final flush always tries.
		if (!final && Date.now() < this.nextRetryAt) return
		if (final) return this.flushOnUnload()
		// One request at a time keeps ordering simple and the retry slot single.
		if (this.sending) return

		// A batch that failed before is resent first, with its original id.
		const batch = this.retryBatch || this.takeBatch()
		this.retryBatch = null
		if (!batch) return

		this.sending = true
		try {
			const response = await this.transportFetch(this.ingestUrl(), {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				body: this.body(batch),
			})

			if (response.ok) return this.onFlushSucceeded()

			if (this.isPermanentFailure(response.status)) {
				this.onFlushSucceeded()
				const detail = await response.json().catch(() => null)
				console.error(`Monitoring batch rejected (HTTP ${response.status})${detail?.error ? `: ${detail.error}` : ''}`)
				return
			}

			const retryAfter = Number(response.headers?.get?.('Retry-After'))
			throw Object.assign(new Error(`HTTP ${response.status}`), { retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : 0 })
		} catch (error) {
			this.retryBatch = batch
			this.onFlushFailed(error?.retryAfterMs)
			console.error('Failed to send monitoring data:', error)
		} finally {
			this.sending = false
		}
	}

	/**
	 * On page hide there is no time to wait for responses. Everything left is
	 * handed to sendBeacon (which the browser delivers after the page is gone),
	 * falling back to a keepalive fetch where sendBeacon is missing or refuses.
	 */
	flushOnUnload() {
		const batches = []
		if (this.retryBatch) batches.push(this.retryBatch)
		this.retryBatch = null
		for (let batch = this.takeBatch(); batch; batch = this.takeBatch()) batches.push(batch)

		for (const batch of batches) {
			const body = this.body(batch)
			const beaconed =
				typeof navigator !== 'undefined' &&
				typeof navigator.sendBeacon === 'function' &&
				navigator.sendBeacon(this.ingestUrl(), new Blob([body], { type: 'text/plain' }))
			if (!beaconed) {
				this.transportFetch(this.ingestUrl(), {
					method: 'POST',
					headers: { 'Content-Type': 'text/plain' },
					body,
					keepalive: true,
				}).catch(() => {})
			}
		}
	}

	onFlushSucceeded() {
		this.consecutiveFailures = 0
		this.nextRetryAt = 0
	}

	// Exponential backoff with jitter: a backend that is down (or a browser that
	// is offline) sees one retry every few minutes instead of one every tick.
	// A server-specified Retry-After is honoured when it is longer.
	onFlushFailed(retryAfterMs = 0) {
		this.consecutiveFailures += 1
		const delay = Math.min(
			this.options.flushInterval * 2 ** (this.consecutiveFailures - 1),
			this.options.maxRetryDelay
		)
		this.nextRetryAt = Date.now() + Math.max(delay * (0.5 + Math.random() * 0.5), retryAfterMs)
	}

	// Called when the page is hidden or unloading: close out vitals and
	// in-flight flows, then push everything out with keepalive.
	finalize() {
		if (!this.finalized) {
			this.finalized = true
			this.reportVitals()
			for (const flow of [...this.activeFlows.values()]) {
				this.finishFlow(flow, 'abandoned')
			}
		}
		this.flush({ final: true })
	}

	destroy() {
		clearInterval(this.flushTimer)
		window.removeEventListener('error', this.onWindowError, true)
		window.removeEventListener('unhandledrejection', this.onRejection)
		document.removeEventListener('visibilitychange', this.onVisibilityChange)
		window.removeEventListener('pagehide', this.onPageHide)
		for (const observer of this.observers) observer.disconnect()
		for (const flow of this.activeFlows.values()) clearTimeout(flow.timer)
		this.activeFlows.clear()
		if (this.originalFetch) window.fetch = this.originalFetch
		if (this.originalXhrOpen) XMLHttpRequest.prototype.open = this.originalXhrOpen
		if (this.originalXhrSend) XMLHttpRequest.prototype.send = this.originalXhrSend
		if (this.originalPushState) history.pushState = this.originalPushState
		window.removeEventListener('popstate', this.onRouteChange)
		this.flush({ final: true })
	}
}

// Also exposed as a global so the SDK can be dropped in with a plain
// <script type="module" src="monitor.js"> and used as window.MonitoringSDK.
if (typeof window !== 'undefined') {
	window.MonitoringSDK = MonitoringSDK
}

export default MonitoringSDK
export { MonitoringSDK }
