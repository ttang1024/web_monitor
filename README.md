# Web page monitor

A monitoring SaaS platform: a browser SDK, a GraphQL API, and a React dashboard.

![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![GraphQL](https://img.shields.io/badge/GraphQL-16-E10098?logo=graphql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green)

![Dashboard walkthrough](demos/demo.gif)

| Directory    | What it is                                                        |
| ------------ | ----------------------------------------------------------------- |
| `sdk/`       | Browser SDK (`monitor.js`): collects and batches events           |
| `backend/`   | Express + Apollo on Prisma/MySQL: `/graphql` and `/ingest`        |
| `dashboard/` | React + Vite dashboard (issues, performance, events, alerts, projects)    |
| `examples/`  | Runnable demos per monitoring layer, see `examples/README.md`     |

## What it monitors

The SDK runs inside your web pages and reports what happens in the visitor's
browser.

**What it can monitor**

| Area                | What is captured                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| JavaScript errors   | Uncaught errors with stack, file, line and column; unhandled promise rejections; errors you report with `captureError` |
| Resource failures   | Images, scripts and stylesheets that fail to load                                                               |
| API calls | `fetch` and `XMLHttpRequest` calls that return HTTP 4xx/5xx, fail on the network, or time out, with their duration |
| Slow API calls | Successful calls slower than `slowRequestMs` (3 seconds by default), grouped per endpoint |
| Page load speed | DNS, TCP, TTFB, response, DOM ready, full load and First Contentful Paint for each page load |
| Page views | Full page loads plus single-page-app route changes (`history.pushState` and back/forward) |
| Web Vitals | LCP, CLS and INP, reported when the visitor leaves the page |
| Visitors' devices   | Browser, operating system and mobile or desktop, from the user agent                                          |
| Business flows      | Multi-step journeys (`startFlow`) ending as completed, failed, timed out or abandoned, with each step's timing |
| Custom events | Named events from `captureCustomEvent` with counts, distinct users and each occurrence's data; numeric metrics from `captureMetric` with average, min, max and a trend chart |
| Alerts              | New issues, error spikes, error rate and slow page loads, recorded in the dashboard and optionally sent to a webhook |

Identical errors are capped per page so a loop cannot flood the backend.
Performance data can be sampled with `sampleRate`; errors are never sampled out.

**What it cannot monitor**

- **Anything outside the browser.** Servers, databases, background jobs and
  native mobile apps are not covered. Only pages that load the SDK report.
- **Uptime.** There are no synthetic checks, so if your site is down and nobody
  visits it, nothing is reported.
- **Every API call.** Fast successful calls are not recorded, so there is no
  throughput or overall success rate. Request and response bodies are never
  captured.
- **Other network channels.** WebSockets, Server-Sent Events and
  `navigator.sendBeacon` calls are not instrumented.
- **Route change speed.** Single-page-app route changes count as page views,
  but browsers don't measure their timing, so load times and LCP cover full
  page loads only. Hash-only URL changes (`#/orders`) are not counted.
- **Errors before the SDK starts,** unless you add the
  [early error snippet](#catch-errors-before-the-sdk-loads).
- **Readable errors from other domains** without `crossorigin` and CORS
  headers: they report only "Script error." See
  [Cross-origin script errors](examples/README.md#cross-origin-script-errors).
  Stack traces are not mapped back through source maps.
- **Session replay, heatmaps or user analytics.** No screen recording and no
  page-view funnels.

Data is kept for `RETENTION_DAYS` (90 by default) and then deleted.

## Quick start

```bash
cp .env.example .env          # set JWT_SECRET, MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD
docker compose up --build     # dashboard :8080, API :4000, MySQL, Redis
```

Sign up in the dashboard, then copy the install snippet from the **Projects** page.

## Local development

```bash
# Backend (http://localhost:4000/graphql)
cd backend && npm install
docker compose up -d && cp .env.example .env
npm run db:migrate && npm run dev

# Dashboard (http://localhost:3000)
cd dashboard && npm install
cp .env.example .env.local && npm run dev
```

All backend config is validated at boot in `backend/src/lib/env.ts`; see
`backend/.env.example` for the full list.

## SDK

See [What it monitors](#what-it-monitors) for what the SDK collects.

```js
import MonitoringSDK from '@web-monitor/sdk'

const monitor = new MonitoringSDK('sk_your_api_key', {
	baseUrl: 'https://api.yourmonitoring.com',
})

monitor.setUser('user_12345')
monitor.captureCustomEvent('user_signup', { plan: 'pro' })

const flow = monitor.startFlow('checkout', { timeout: 60000 })
flow.step('payment_submitted')
flow.complete() // or flow.fail('card_declined')
```

Options worth knowing (defaults shown):

```js
new MonitoringSDK('sk_your_api_key', {
	sampleRate: 1, // share of page loads that report performance
	slowRequestMs: 3000, // report successful requests at least this slow; 0 turns it off
	trackRouteChanges: true, // count single-page-app URL changes as page views
})
```

See `examples/` for more, including React integration.

### Catch errors before the SDK loads

Errors thrown before `new MonitoringSDK(...)` runs are normally missed. Put
this at the very top of `<head>`, before any other script. It holds early
errors until the SDK starts and reports them, then does nothing.

```html
<script>
	window.__monitorQueue = []
	;['error', 'unhandledrejection'].forEach(function (type) {
		addEventListener(type, function (event) {
			if (window.__monitorQueue) window.__monitorQueue.push(event)
		}, true)
	})
</script>
```

## Tests

```bash
npm install && npm run lint
cd backend   && npm test
cd sdk       && npm test
cd dashboard && npm test && npm run typecheck
```

CI (`.github/workflows/ci.yml`) also runs MySQL integration tests and checks
Prisma migrations and generated GraphQL types.

## License

MIT, see [LICENSE](LICENSE).
