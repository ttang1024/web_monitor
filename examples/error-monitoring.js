// Layer: error monitoring.
// Uncaught JS errors, unhandled promise rejections, and resource load failures
// are captured automatically — these functions just trigger each kind so you
// can watch them arrive in the dashboard.

// Uncaught runtime error → captured by the global `error` handler as `js_error`
export function throwUncaughtError() {
	// setTimeout so the error escapes the caller's try/catch (if any)
	setTimeout(() => {
		nonExistentFunction()
	}, 0)
}

// Unhandled rejection → captured as `promise_error`
export function triggerUnhandledRejection() {
	Promise.reject(new Error('Payment token expired'))
}

// Broken <img> → captured as `resource_error` with the failing URL
export function triggerResourceError() {
	const img = document.createElement('img')
	img.src = '/images/does-not-exist.png'
	document.body.appendChild(img)
}

// Caught exception reported manually, with context that shows up in metadata
export function reportCaughtError(monitor) {
	try {
		JSON.parse('{not valid json')
	} catch (err) {
		monitor.captureError(err, { feature: 'settings_import', fileName: 'prefs.json' })
	}
}

// The SDK deduplicates: an error thrown in a loop is only reported
// `maxErrorRepeats` times (default 10), so a render loop can't flood the backend.
export function triggerRepeatedError() {
	for (let i = 0; i < 100; i++) {
		setTimeout(() => {
			throw new Error('Same error, every frame')
		}, 0)
	}
}
