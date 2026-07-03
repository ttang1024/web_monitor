// Layer: custom monitoring.
// Arbitrary events and numeric metrics, automatically tagged with the current
// userId (via setUser) and a per-tab sessionId.

// Product events worth counting
export function trackSignup(monitor) {
	monitor.captureCustomEvent('user_signup', { plan: 'pro', referrer: 'newsletter' })
}

export function trackFeatureUsage(monitor) {
	monitor.captureCustomEvent('feature_used', { feature: 'export_csv', rows: 1240 })
}

// SPA page views (call from your router's navigation hook)
export function trackPageView(monitor) {
	monitor.captureCustomEvent('page_view', {
		path: window.location.pathname,
		referrer: document.referrer,
	})
}

// Numeric metrics with tags — for anything you want charted over time
export function trackQueueDepth(monitor) {
	monitor.captureMetric('unread_messages', 7, { role: 'doctor' })
}

export function trackSearchLatency(monitor) {
	monitor.captureMetric('search_latency_ms', Math.round(50 + Math.random() * 400), {
		index: 'patients',
	})
}
