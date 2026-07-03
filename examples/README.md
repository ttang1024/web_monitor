# SDK Examples

Demonstration functions for each layer of the monitoring SDK. Every function
takes the `monitor` instance as its argument (created in `basic-setup.js`),
except the ones that trigger automatic capture and need no SDK reference.

| File | Layer |
| --- | --- |
| `basic-setup.js` | Creating and configuring the SDK, `setUser`, teardown |
| `error-monitoring.js` | JS errors, rejections, resource failures, manual capture, dedup |
| `api-monitoring.js` | Auto-captured fetch/XHR failures, manual API errors |
| `performance-monitoring.js` | CLS demo, custom interaction-latency metrics |
| `business-flows.js` | End-to-end journeys: completed / failed / timeout / abandoned |
| `custom-monitoring.js` | Custom events and numeric metrics |
| `react-integration.jsx` | Provider, `useMonitoring`, and a `useFlow` hook (reference only) |
| `index.html` | Runnable page with a button per function |

## Running

ES modules don't load from `file://`, so serve the repo root over HTTP:

```bash
# from the repo root
cd backend && npm run dev        # backend on localhost:4000
npx serve .                      # in another terminal, from the repo root
```

Then open `http://localhost:3000/examples/`, put a real API key into
`basic-setup.js` (or keep the placeholder to just watch requests fail), and
click the buttons while watching the network tab and the dashboard.
