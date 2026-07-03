# Web page monitor

It's a monitoring SaaS platform.

-   [Web page monitor](#web-page-monitor)
    -   [Backend Setup Instructions](#backend-setup-instructions)
        -   [1. Install dependencies](#1-install-dependencies)
        -   [2. Start MySQL](#2-start-mysql)
        -   [3. Configure environment variables](#3-configure-environment-variables)
        -   [4. Create and apply migrations](#4-create-and-apply-migrations)
        -   [5. Run the Application](#5-run-the-application)
    -   [Frontend SDK Usage](#frontend-sdk-usage)
        -   [1. Basic Usage](#1-basic-usage)
        -   [2. Business-flow monitoring](#2-business-flow-monitoring)
        -   [3. React Integration](#3-react-integration)

## Backend Setup Instructions

The backend is a **Node.js + TypeScript** app exposing a single **GraphQL** API (Apollo Server + Express), backed by **MySQL** via Prisma. SDK ingestion, dashboard queries, and auth are all served from one `/graphql` endpoint.

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Start MySQL

```bash
docker compose up -d
```

This starts a `mysql:8` container (`monitoring_saas` database, root password `yourpassword`, port `3306`) matching `docker-compose.yml`.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Key variables in `.env`:

-   `DATABASE_URL` — MySQL connection string for Prisma
-   `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE` — JWT signing config
-   `ALLOWED_ORIGINS` — comma-separated CORS origins for the dashboard
-   `PORT` — API port (default `4000`)

### 4. Create and apply migrations

```bash
npm run db:migrate
```

This runs `prisma migrate dev`, creating the MySQL schema (Tenant, User, ApiKey, ErrorLog, PerformanceMetric, ApiError, CustomEvent, DashboardLayout) from `prisma/schema.prisma`.

### 5. Run the Application

```bash
npm run dev
```

The API will be available at:

-   GraphQL: http://localhost:4000/graphql
-   Health check: http://localhost:4000/health

Useful scripts: `npm run build` (compile to `dist/`), `npm start` (run compiled build), `npm run db:studio` (Prisma Studio DB browser).

## Frontend SDK Usage

The SDK covers four monitoring layers out of the box:

1. **Page performance** — navigation timing (DNS, TCP, TTFB, DOM, load) plus Web Vitals (FCP, LCP, CLS, FID) captured automatically. LCP/CLS/FID are finalized and reported when the page is hidden.
2. **Error monitoring** — JS runtime errors, unhandled promise rejections, and resource load failures are captured automatically; `fetch` and `XMLHttpRequest` are instrumented so any HTTP ≥ 400 response or network failure from a backend API is reported without any manual code.
3. **Business-flow monitoring** — track a user journey end to end with `startFlow`; each flow reports `completed`, `failed`, `timeout`, or `abandoned` (user left mid-flow) with per-step timings.
4. **Custom monitoring** — arbitrary events (`captureCustomEvent`) and numeric metrics (`captureMetric`), tagged with the current user and session.

### 1. Basic Usage

```js
const monitor = new MonitoringSDK('sk_your_api_key_here', {
	baseUrl: 'https://api.yourmonitoring.com',
	batchSize: 10,          // events per batch
	flushInterval: 5000,    // ms between flushes
	sampleRate: 1,          // fraction of page loads reporting performance (errors are never sampled)
	flowTimeout: 30000,     // default business-flow timeout in ms
	instrumentFetch: true,  // auto-capture fetch API errors
	instrumentXhr: true,    // auto-capture XHR API errors
})

// Attach the logged-in user to all custom events
monitor.setUser('user_12345')

// Errors, API failures, and performance are captured automatically.
// Manually report a caught exception:
try {
	riskyOperation()
} catch (err) {
	monitor.captureError(err, { feature: 'checkout' })
}

// Custom events and metrics
monitor.captureCustomEvent('user_signup', { plan: 'pro' })
monitor.captureMetric('search_latency_ms', 420, { page: 'inbox' })
```

### 2. Business-flow monitoring

Verify the actual business journey completed — not just that nothing crashed:

```js
// When a new patient sends their first message:
const flow = monitor.startFlow('patient_first_message', {
	timeout: 60000, // if the journey doesn't finish in 60s it's reported as `timeout`
	context: { patientId, clinicId },
})

flow.step('message_sent')
flow.step('unread_badge_shown')

// Later, when a doctor picks up the patient:
flow.step('doctor_assigned', { doctorId })
flow.complete()

// Or, when the journey breaks:
flow.fail('unread_badge_missing')
```

Every flow emits a single `business_flow` custom event containing the final
status (`completed` / `failed` / `timeout` / `abandoned`), all steps with their
offsets from the start, the last step reached, and the total duration — so a
dashboard query can answer "what fraction of first messages got a doctor within
60 seconds, and where did the rest stop?".

### 3. React Integration

```jsx
// sdk/react/MonitoringProvider.jsx
import { createContext, useContext, useEffect, useMemo } from 'react'
import MonitoringSDK from '../monitor'

const MonitoringContext = createContext(null)

export function MonitoringProvider({ apiKey, children }) {
	// Memoize so a re-render doesn't create a second SDK instance
	const sdk = useMemo(() => new MonitoringSDK(apiKey), [apiKey])

	useEffect(() => () => sdk.destroy(), [sdk])

	useEffect(() => {
		// Track route changes
		const handleRouteChange = () => {
			sdk.captureCustomEvent('page_view', {
				path: window.location.pathname,
			})
		}

		window.addEventListener('popstate', handleRouteChange)
		return () => window.removeEventListener('popstate', handleRouteChange)
	}, [sdk])

	return <MonitoringContext.Provider value={sdk}>{children}</MonitoringContext.Provider>
}

export const useMonitoring = () => useContext(MonitoringContext)
```
