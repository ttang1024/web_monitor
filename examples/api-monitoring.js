// Layer: API monitoring.
// fetch() and XMLHttpRequest are instrumented at init, so any HTTP >= 400
// response, network failure, or timeout is reported with no extra code.
// A broken API call becomes as visible as a broken page.

// 404 from the backend → captured automatically as `http_error`
export function callMissingEndpoint() {
	fetch('http://localhost:4000/definitely-not-a-route').catch(() => {})
}

// Unreachable host → captured automatically as `network_error`
export function callUnreachableHost() {
	fetch('http://localhost:9999/api/users').catch(() => {})
}

// Same coverage for legacy XMLHttpRequest code paths
export function callFailingXhr() {
	const xhr = new XMLHttpRequest()
	xhr.open('POST', 'http://localhost:4000/definitely-not-a-route')
	xhr.send(JSON.stringify({ demo: true }))
}

// Manual reporting still works — useful for errors that arrive with HTTP 200,
// e.g. a GraphQL response body containing an errors array.
export function reportApiErrorManually(monitor) {
	monitor.captureApiError(
		'/graphql',
		'POST',
		200,
		new Error('GraphQL: patient not found (PATIENT_NOT_FOUND)')
	)
}
