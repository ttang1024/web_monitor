// React integration: one SDK instance for the app, a hook to reach it,
// and a hook that ties a business flow to a component's lifetime.
// (Reference example — not wired into index.html.)

import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import MonitoringSDK from '../sdk/monitor'

const MonitoringContext = createContext(null)

export function MonitoringProvider({ apiKey, userId, children }) {
	// Memoize so re-renders don't create a second SDK instance
	const sdk = useMemo(() => new MonitoringSDK(apiKey, { baseUrl: 'http://localhost:4000' }), [apiKey])

	useEffect(() => {
		if (userId) sdk.setUser(userId)
	}, [sdk, userId])

	// Tear down (flush + un-patch fetch/XHR) when the provider unmounts
	useEffect(() => () => sdk.destroy(), [sdk])

	// Track SPA route changes as page views
	useEffect(() => {
		const onRouteChange = () =>
			sdk.captureCustomEvent('page_view', { path: window.location.pathname })
		window.addEventListener('popstate', onRouteChange)
		return () => window.removeEventListener('popstate', onRouteChange)
	}, [sdk])

	return <MonitoringContext.Provider value={sdk}>{children}</MonitoringContext.Provider>
}

export const useMonitoring = () => useContext(MonitoringContext)

// Start a business flow when a component mounts; if it's still unfinished on
// unmount, mark where the user stopped. Returns the flow handle.
export function useFlow(name, options) {
	const monitor = useMonitoring()
	const flowRef = useRef(null)

	if (monitor && !flowRef.current) {
		flowRef.current = monitor.startFlow(name, options)
	}

	useEffect(() => {
		return () => flowRef.current?.fail('component_unmounted')
	}, [])

	return flowRef.current
}

// Usage in the healthcare example:
//
// function FirstMessageScreen({ patientId }) {
// 	const flow = useFlow('patient_first_message', { timeout: 60000, context: { patientId } })
//
// 	const send = async text => {
// 		await api.sendMessage(patientId, text)
// 		flow.step('message_sent')
// 	}
//
// 	useOnBadgeShown(() => flow.step('unread_badge_shown'))
// 	useOnDoctorAssigned(doctorId => {
// 		flow.step('doctor_assigned', { doctorId })
// 		flow.complete()
// 	})
//
// 	return <MessageComposer onSend={send} />
// }
