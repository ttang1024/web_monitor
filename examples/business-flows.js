// Layer: business-flow monitoring.
// Instead of asking "did anything crash?", verify the business journey
// completed. Each flow emits one `business_flow` event with its final status
// (completed | failed | timeout | abandoned), every step's offset from the
// start, the last step reached, and the total duration.

// The happy path from the healthcare example: a new patient sends their first
// message, the unread badge appears, and a doctor picks the patient up.
export function patientFirstMessageCompleted(monitor) {
	const flow = monitor.startFlow('patient_first_message', {
		timeout: 60000,
		context: { patientId: 'p_123', clinicId: 'c_9' },
	})

	flow.step('message_sent')

	// In real code these steps fire from the actual UI/socket events
	setTimeout(() => flow.step('unread_badge_shown'), 300)
	setTimeout(() => {
		flow.step('doctor_assigned', { doctorId: 'd_456' })
		flow.complete()
	}, 900)
}

// The journey breaks at a known point: fail with a reason so the dashboard
// can group drop-offs by cause.
export function patientFirstMessageFailed(monitor) {
	const flow = monitor.startFlow('patient_first_message', {
		context: { patientId: 'p_124' },
	})

	flow.step('message_sent')
	flow.fail('unread_badge_missing')
}

// Nothing crashes, but nobody picks up the patient: after the timeout the
// flow reports `timeout` with the last step reached — the silent failure
// business-flow monitoring exists to catch.
export function patientFirstMessageTimeout(monitor) {
	const flow = monitor.startFlow('patient_first_message', {
		timeout: 5000,
		context: { patientId: 'p_125' },
	})

	flow.step('message_sent')
	flow.step('unread_badge_shown')
	// no doctor_assigned, no complete(): reported as `timeout` after 5s
}

// A second journey, to show flows are general: checkout funnel.
// If the user closes the tab mid-flow, the SDK reports it as `abandoned`.
export function checkoutFlow(monitor) {
	const flow = monitor.startFlow('checkout', {
		timeout: 120000,
		context: { cartValue: 8900, currency: 'USD' },
	})

	flow.step('cart_reviewed')
	setTimeout(() => flow.step('payment_details_entered'), 400)
	setTimeout(() => {
		flow.step('payment_confirmed', { provider: 'stripe' })
		flow.complete({ orderId: 'o_789' })
	}, 1100)
}
