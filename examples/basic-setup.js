// Basic SDK setup: create a configured monitor instance and identify the user.
// All other examples take this instance as their first argument.

import MonitoringSDK from '../sdk/monitor.js'

export function createMonitor(apiKey = 'sk_your_api_key_here') {
	const monitor = new MonitoringSDK(apiKey, {
		baseUrl: 'http://localhost:4000',
		batchSize: 10, // send after 10 queued events…
		flushInterval: 3000, // …or every 3 seconds, whichever comes first
		sampleRate: 1, // report performance for 100% of page loads
		flowTimeout: 5000, // business flows time out after 5s unless overridden
		instrumentFetch: true, // auto-capture failing fetch() calls
		instrumentXhr: true, // auto-capture failing XMLHttpRequests
	})

	// Attach the logged-in user to every custom event and business flow
	monitor.setUser('demo_user_123')

	return monitor
}

// Call when the SDK is no longer needed (e.g. SPA teardown, logout):
// stops timers, un-patches fetch/XHR, and flushes whatever is queued.
export function teardownMonitor(monitor) {
	monitor.destroy()
}
