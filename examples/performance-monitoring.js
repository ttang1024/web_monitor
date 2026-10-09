// Layer: page performance.
// Navigation timing (DNS, TCP, TTFB, response, DOM, load) and Web Vitals
// (FCP, LCP, CLS, INP) are captured automatically — nothing to call.
// These helpers demonstrate what the numbers respond to, and how to add
// your own timings for interface latency the browser can't infer.

// Force a layout shift so the CLS value moves. CLS is accumulated over the
// page's lifetime and reported when the page is hidden.
export function triggerLayoutShift() {
	const banner = document.createElement('div')
	banner.textContent = 'Late-loading banner (this shifts the layout below it)'
	banner.style.cssText = 'padding:40px;background:#fde68a'
	document.body.prepend(banner)
	setTimeout(() => banner.remove(), 2000)
}

// Measure a specific interaction's latency and report it as a metric —
// the "interface latency" that navigation timing doesn't cover.
export async function measureInteractionLatency(monitor) {
	const start = performance.now()

	// Simulate the work behind a click: fetch + render
	await new Promise(resolve => setTimeout(resolve, 120 + Math.random() * 300))

	monitor.captureMetric('open_patient_chart_ms', Math.round(performance.now() - start), {
		screen: 'inbox',
	})
}

// Report a long-task style measurement for a known-heavy code path
export function measureHeavyComputation(monitor) {
	const start = performance.now()
	let n = 0
	for (let i = 0; i < 5_000_000; i++) n += Math.sqrt(i)
	monitor.captureMetric('risk_score_computation_ms', Math.round(performance.now() - start))
	return n
}
