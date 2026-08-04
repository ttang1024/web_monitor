const INGEST_BATCH_MUTATION = `
	mutation IngestBatch($input: BatchIngestInput!) {
		ingestBatch(input: $input)
	}
`

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

		this.userId = this.options.userId || null
		this.sessionId = this.resolveSessionId()
		this.samplePerformance = Math.random() < this.options.sampleRate

		// Web Vitals accumulated over the page's lifetime, reported once on first hide.
		this.vitals = { lcp: null, cls: null, fid: null }
		this.clsSession = { value: 0, entries: [] }

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

		// --- API monitoring ---
		if (this.options.instrumentFetch) this.instrumentFetch()
		if (this.options.instrumentXhr) this.instrumentXhr()

		// --- Page performance ---
		if (this.samplePerformance && typeof PerformanceObserver !== 'undefined') {
			this.observeWebVitals()
			this.captureNavigationTiming()
		}

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
		const signature = `${error.type}|${error.message}|${error.source || ''}|${error.lineNo || ''}`
		const count = (this.errorCounts.get(signature) || 0) + 1
		this.errorCounts.set(signature, count)
		if (count > this.options.maxErrorRepeats) return

		this.addToBatch('errors', { ...error, ...this.baseFields() })
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
			try {
				const response = await original(input, init)
				if (response.status >= 400) {
					this.captureApiError(url, method, response.status, {
						message: `HTTP ${response.status} ${response.statusText} (${Math.round(performance.now() - start)}ms)`.trim(),
					})
				}
				return response
			} catch (error) {
				this.captureApiError(url, method, null, error)
				throw error
			}
		}
	}

	instrumentXhr() {
		if (!window.XMLHttpRequest) return
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
				this.addEventListener('load', () => {
					if (this.status >= 400) {
						sdk.captureApiError(info.url, info.method, this.status, {
							message: `HTTP ${this.status} ${this.statusText}`.trim(),
						})
					}
				})
				this.addEventListener('error', () => {
					sdk.captureApiError(info.url, info.method, null, { message: 'Network error' })
				})
				this.addEventListener('timeout', () => {
					sdk.captureApiError(info.url, info.method, null, { message: 'Request timed out' })
				})
			}
			return sdk.originalXhrSend.apply(this, args)
		}
	}

	captureApiError(requestUrl, method, status, error) {
		this.addToBatch('apiErrors', {
			type: status ? 'http_error' : 'network_error',
			requestUrl,
			method,
			status,
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

		this.tryObserve('first-input', entries => {
			const first = entries[0]
			if (first && this.vitals.fid === null) {
				this.vitals.fid = first.processingStart - first.startTime
			}
		})
	}

	tryObserve(type, callback) {
		try {
			const observer = new PerformanceObserver(list => callback(list.getEntries()))
			observer.observe({ type, buffered: true })
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

	// LCP/CLS/FID keep growing until the user leaves; report them once, on first hide.
	reportVitals() {
		if (!this.samplePerformance) return
		const { lcp, cls, fid } = this.vitals
		if (lcp === null && cls === null && fid === null) return

		this.addToBatch('performance', {
			...this.baseFields(),
			device: this.deviceInfo(),
			metrics: { lcp, cls, fid },
		})
		this.vitals = { lcp: null, cls: null, fid: null }
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

	// A response the backend will never accept — bad API key, malformed or
	// oversized payload. Retrying it just burns requests forever, so it is
	// dropped. 408/429 are the exceptions: those do succeed later.
	isPermanentFailure(status) {
		return status >= 400 && status < 500 && status !== 408 && status !== 429
	}

	async flush({ final = false } = {}) {
		if (this.batchQueue.length === 0 || !this.transportFetch) return
		// Backing off after a failure — but a final flush always tries.
		if (!final && Date.now() < this.nextRetryAt) return

		const items = this.batchQueue
		this.batchQueue = []

		try {
			const response = await this.transportFetch(`${this.baseUrl}/graphql`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-Key': this.apiKey,
				},
				body: JSON.stringify({
					query: INGEST_BATCH_MUTATION,
					variables: { input: this.mergeBatch(items) },
				}),
				// keepalive lets the final flush survive page unload.
				keepalive: final,
			})

			if (!response.ok) {
				if (this.isPermanentFailure(response.status)) {
					this.onFlushSucceeded()
					if (!final) console.error(`Monitoring batch rejected (HTTP ${response.status}), dropped`)
					return
				}
				throw new Error(`HTTP ${response.status}`)
			}

			// GraphQL reports rejected input as 200 + an errors array. Those are
			// permanent too, so the batch is dropped rather than replayed.
			if (!final) {
				const body = await response.json().catch(() => null)
				if (body?.errors?.length) {
					this.onFlushSucceeded()
					console.error('Monitoring batch rejected:', body.errors[0]?.message)
					return
				}
			}

			this.onFlushSucceeded()
		} catch (error) {
			// Put the items back so a later interval retries them.
			this.batchQueue = [...items, ...this.batchQueue].slice(-this.options.maxQueueSize)
			this.onFlushFailed()
			if (!final) console.error('Failed to send monitoring data:', error)
		}
	}

	onFlushSucceeded() {
		this.consecutiveFailures = 0
		this.nextRetryAt = 0
	}

	// Exponential backoff with jitter: a backend that is down (or a browser that
	// is offline) sees one retry every few minutes instead of one every tick.
	onFlushFailed() {
		this.consecutiveFailures += 1
		const delay = Math.min(
			this.options.flushInterval * 2 ** (this.consecutiveFailures - 1),
			this.options.maxRetryDelay
		)
		this.nextRetryAt = Date.now() + delay * (0.5 + Math.random() * 0.5)
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
