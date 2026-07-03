import { WidgetConfig, ChartType, MetricType, Issue, WebVital, RoutePerformance, ReplaySession, Application, TimeRange, Environment, CustomTimeRange } from './types';

export const INITIAL_WIDGETS: WidgetConfig[] = [
  { id: '1', title: 'Total User Sessions', type: ChartType.Area, metric: MetricType.UserSessions, w: 2, h: 1 },
  { id: '2', title: 'Global Error Rate (%)', type: ChartType.Line, metric: MetricType.ErrorRate, w: 2, h: 1 },
  { id: '3', title: 'Core Web Vitals: LCP (ms)', type: ChartType.Bar, metric: MetricType.LCP, w: 1, h: 1 },
  { id: '4', title: 'API Failure Rate', type: ChartType.Line, metric: MetricType.ApiFailure, w: 1, h: 1 },
  { id: '5', title: 'API Latency P95 (ms)', type: ChartType.Line, metric: MetricType.ApiLatency, w: 2, h: 1 },
  { id: '6', title: 'Browser Distribution', type: ChartType.Pie, metric: MetricType.JsHeap, w: 1, h: 1 }, 
  { id: '7', title: 'Slowest Routes', type: ChartType.Bar, metric: MetricType.PageLoad, w: 3, h: 1 },
];

export const MOCK_APPS: Application[] = [
  { id: 'app-1', name: 'E-commerce Storefront', framework: 'next', health: 'healthy' },
  { id: 'app-2', name: 'Merchant Dashboard', framework: 'react', health: 'warning' },
  { id: 'app-3', name: 'Payment Service', framework: 'node', health: 'healthy' },
];

export const MOCK_SUMMARY_METRICS = [
  { label: 'System Health', value: '98%', status: 'healthy', trend: '+1%' },
  { label: 'Active Sessions', value: '2,420', status: 'neutral', trend: '+12%' },
  { label: 'Avg Response Time', value: '145ms', status: 'healthy', trend: '-15ms' },
  { label: 'Error Rate', value: '0.42%', status: 'warning', trend: '+0.1%' },
];

export const MOCK_COLORS = {
  primary: '#059669', // Emerald 600 — rgb(5, 150, 105)
  secondary: '#ec4899', // Pink 500
  success: '#22c55e', // Green 500
  warning: '#f59e0b', // Amber 500
  danger: '#ef4444', // Red 500
  neutral: '#94a3b8', // Slate 400
  grid: '#334155', // Slate 700
};

// Helper to generate time series data
// Added optional multiplier for variability across apps
export const generateTimeSeriesData = (
  points: number, 
  baseValue: number, 
  volatility: number, 
  multiplier: number = 1,
  timeRange?: TimeRange,
  environment?: Environment,
  customTimeRange?: CustomTimeRange
) => {
  const data = [];
  const now = new Date();
  
  // Environment scaling factor
  let envFactor = 1;
  if (environment === 'staging') envFactor = 0.4;
  if (environment === 'development') envFactor = 0.1;

  const adjustedBase = baseValue * multiplier * envFactor;
  // Reduce volatility for lower numbers to avoid negative or weird spikes relative to base
  const adjustedVolatility = Math.max(1, volatility * envFactor);
  
  let effectivePoints = points;
  let intervalMs = 5 * 60 * 1000; // Default 5 mins
  let isDate = false;

  let endTime = now.getTime();

  if (timeRange) {
    switch (timeRange) {
      case '15m':
        effectivePoints = 15;
        intervalMs = 60 * 1000; // 1 min
        break;
      case '1h':
        effectivePoints = 12; // 60 / 5
        intervalMs = 5 * 60 * 1000; // 5 min
        break;
      case '24h':
        effectivePoints = 24;
        intervalMs = 60 * 60 * 1000; // 1 hour
        break;
      case '7d':
        effectivePoints = 7;
        intervalMs = 24 * 60 * 60 * 1000; // 1 day
        isDate = true;
        break;
      case 'custom':
        if (customTimeRange && customTimeRange.start && customTimeRange.end) {
          const start = new Date(customTimeRange.start).getTime();
          const end = new Date(customTimeRange.end).getTime();
          endTime = end;
          const duration = end - start;
          
          if (duration > 0) {
            // Calculate interval to fit the points
            intervalMs = duration / (points - 1);
            
            // If duration is longer than 24h, show dates
            if (duration > 24 * 60 * 60 * 1000) {
              isDate = true;
            }
          }
        } else {
            // Fallback for custom without data
            effectivePoints = 24;
            intervalMs = 60 * 60 * 1000; 
            isDate = true;
        }
        break;
    }
  }

  for (let i = 0; i < effectivePoints; i++) {
    // Calculate time working backwards from end time
    const time = new Date(endTime - ((effectivePoints - 1) - i) * intervalMs);
    let timeLabel = '';
    
    if (isDate) {
        timeLabel = time.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } else {
        timeLabel = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    data.push({
      time: timeLabel,
      value: Math.max(0, Math.round(adjustedBase + (Math.random() - 0.5) * adjustedVolatility)),
    });
  }
  return data;
};

// Helper for pie chart data
export const generateDistributionData = () => [
  { name: 'Chrome', value: 65 },
  { name: 'Safari', value: 20 },
  { name: 'Firefox', value: 10 },
  { name: 'Edge', value: 5 },
];

// Helper for multi-bar data (Routes)
export const generateRouteData = () => [
  { name: '/checkout', value: 2400 },
  { name: '/dashboard', value: 1200 },
  { name: '/api/users', value: 800 },
  { name: '/landing', value: 450 },
  { name: '/settings', value: 300 },
];

// --- Mock Data for Pages ---

export const MOCK_ISSUES: Issue[] = [
  {
    id: 'ERR-001',
    type: 'TypeError',
    message: "Cannot read properties of undefined (reading 'map')",
    events: 1420,
    users: 850,
    lastSeen: '2m ago',
    firstSeen: '2 days ago',
    status: 'unresolved',
    graphData: generateTimeSeriesData(10, 50, 20),
    tags: {
      browser: 'Chrome 120.0',
      os: 'Windows 10',
      url: '/checkout/payment',
      release: 'v2.4.1'
    },
    stackTrace: `TypeError: Cannot read properties of undefined (reading 'map')
    at PaymentForm.renderItems (webpack://app/src/components/PaymentForm.tsx:142:24)
    at PaymentForm.render (webpack://app/src/components/PaymentForm.tsx:180:12)
    at finishClassComponent (webpack://app/node_modules/react-dom/cjs/react-dom.development.js:17485:31)
    at updateClassComponent (webpack://app/node_modules/react-dom/cjs/react-dom.development.js:17435:24)
    at beginWork (webpack://app/node_modules/react-dom/cjs/react-dom.development.js:19073:16)
    at HTMLUnknownElement.callCallback (webpack://app/node_modules/react-dom/cjs/react-dom.development.js:3945:14)`,
    breadcrumbs: [
      { timestamp: '10:41:20', type: 'navigation', category: 'nav', message: 'Navigated to /checkout', level: 'info' },
      { timestamp: '10:41:22', type: 'ui', category: 'click', message: 'User clicked "Pay Now"', level: 'info' },
      { timestamp: '10:41:23', type: 'http', category: 'xhr', message: 'POST /api/v1/order [500]', level: 'error' },
      { timestamp: '10:41:23', type: 'console', category: 'error', message: 'Failed to load order items', level: 'error' },
    ]
  },
  {
    id: 'ERR-002',
    type: 'UnhandledRejection',
    message: "NetworkError: Failed to fetch",
    events: 843,
    users: 320,
    lastSeen: '15m ago',
    firstSeen: '5 hours ago',
    status: 'unresolved',
    graphData: generateTimeSeriesData(10, 30, 10),
    tags: {
      browser: 'Safari 17.0',
      os: 'iOS 17',
      url: '/dashboard',
      release: 'v2.4.1'
    },
    stackTrace: `Error: NetworkError: Failed to fetch
    at fetchData (webpack://app/src/services/api.ts:45:12)
    at async Dashboard.loadMetrics (webpack://app/src/pages/Dashboard.tsx:89:5)`,
    breadcrumbs: [
      { timestamp: '09:15:00', type: 'navigation', category: 'nav', message: 'Navigated to /dashboard', level: 'info' },
      { timestamp: '09:15:01', type: 'http', category: 'xhr', message: 'GET /api/metrics [0]', level: 'error' },
    ]
  },
  {
    id: 'ERR-003',
    type: 'ReferenceError',
    message: "window.analytics is not defined",
    events: 210,
    users: 45,
    lastSeen: '1h ago',
    firstSeen: '1 week ago',
    status: 'resolved',
    graphData: generateTimeSeriesData(10, 5, 2),
    tags: {
      browser: 'Firefox 115',
      os: 'MacOS 14',
      url: '/',
      release: 'v2.3.9'
    },
    stackTrace: `ReferenceError: window.analytics is not defined
    at logPageview (webpack://app/src/utils/analytics.ts:12:3)
    at App.componentDidMount (webpack://app/src/App.tsx:45:5)`,
    breadcrumbs: [
      { timestamp: '08:00:00', type: 'navigation', category: 'nav', message: 'Navigated to /', level: 'info' },
    ]
  },
  {
    id: 'ERR-004',
    type: 'ChunkLoadError',
    message: "Loading chunk 3 failed.",
    events: 125,
    users: 90,
    lastSeen: '4h ago',
    firstSeen: '2 days ago',
    status: 'ignored',
    graphData: generateTimeSeriesData(10, 10, 5),
    tags: {
      browser: 'Chrome Mobile',
      os: 'Android 13',
      url: '/settings',
      release: 'v2.4.0'
    },
    stackTrace: `ChunkLoadError: Loading chunk 3 failed.
    (error: https://cdn.example.com/assets/3.a1b2c.js)
    at __webpack_require__.f.j (webpack://app/webpack/runtime/jsonp chunk loading:12:1)
    at ensureChunk (webpack://app/webpack/runtime/ensure chunk:6:1)
    at loadComponent (webpack://app/src/router.tsx:42:12)`,
    breadcrumbs: [
      { timestamp: '04:20:10', type: 'navigation', category: 'nav', message: 'Navigated to /settings', level: 'info' },
      { timestamp: '04:20:12', type: 'ui', category: 'interaction', message: 'User tapped "Security"', level: 'info' },
    ]
  },
  {
    id: 'ERR-005',
    type: 'Invariant Violation',
    message: "Minified React error #31; visit https://reactjs.org/docs/error-decoder.html",
    events: 56,
    users: 12,
    lastSeen: '1d ago',
    firstSeen: '3 days ago',
    status: 'regressed',
    graphData: generateTimeSeriesData(10, 2, 1),
    tags: {
      browser: 'Edge 119',
      os: 'Windows 11',
      url: '/profile',
      release: 'v2.4.1'
    },
    stackTrace: `Error: Minified React error #31; visit https://reactjs.org/docs/error-decoder.html for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
    at Z (webpack://app/node_modules/react-dom/cjs/react-dom.production.min.js:142:1)
    at ab (webpack://app/node_modules/react-dom/cjs/react-dom.production.min.js:156:1)`,
    breadcrumbs: []
  },
  {
    id: 'ERR-006',
    type: 'TypeError',
    message: "Cannot read properties of null (reading 'value')",
    events: 45,
    users: 8,
    lastSeen: '10m ago',
    firstSeen: '1 day ago',
    status: 'review',
    graphData: generateTimeSeriesData(10, 15, 5),
    tags: {
      browser: 'Chrome 121.0',
      os: 'MacOS 14',
      url: '/login',
      release: 'v2.4.1'
    },
    stackTrace: `TypeError: Cannot read properties of null (reading 'value')
    at LoginForm.handleSubmit (webpack://app/src/components/LoginForm.tsx:55:10)
    at HTMLFormElement.callCallback (webpack://app/node_modules/react-dom/cjs/react-dom.development.js:3945:14)`,
    breadcrumbs: [
      { timestamp: '11:00:01', type: 'navigation', category: 'nav', message: 'Navigated to /login', level: 'info' },
      { timestamp: '11:00:05', type: 'ui', category: 'click', message: 'User clicked "Login"', level: 'info' },
    ]
  }
];

export const MOCK_WEB_VITALS: WebVital[] = [
  { name: 'Largest Contentful Paint (LCP)', value: 2.8, unit: 's', score: 'needs-improvement', delta: '+0.2s' },
  { name: 'First Input Delay (FID)', value: 18, unit: 'ms', score: 'good', delta: '-2ms' },
  { name: 'Cumulative Layout Shift (CLS)', value: 0.05, unit: '', score: 'good', delta: '0' },
  { name: 'Interaction to Next Paint (INP)', value: 240, unit: 'ms', score: 'poor', delta: '+45ms' },
];

export const MOCK_PERFORMANCE_ROUTES: RoutePerformance[] = [
  { path: '/checkout/payment', avgDuration: 1250, p75: 1400, p95: 2100, throughput: 450 },
  { path: '/dashboard/analytics', avgDuration: 850, p75: 920, p95: 1100, throughput: 1200 },
  { path: '/profile/settings', avgDuration: 420, p75: 500, p95: 650, throughput: 300 },
  { path: '/api/search/v2', avgDuration: 2200, p75: 2400, p95: 4500, throughput: 2500 },
  { path: '/landing/hero', avgDuration: 320, p75: 350, p95: 400, throughput: 5600 },
];

export const MOCK_REPLAYS: ReplaySession[] = [
  { id: 'SES-8392', userEmail: 'alex.dev@company.com', duration: '14m 20s', eventCount: 432, errorCount: 2, timestamp: '10 mins ago', platform: 'Windows (Chrome)' },
  { id: 'SES-9281', userEmail: 'sarah.jones@gmail.com', duration: '2m 05s', eventCount: 45, errorCount: 0, timestamp: '25 mins ago', platform: 'MacOS (Safari)' },
  { id: 'SES-1120', userEmail: 'mike.ross@law.com', duration: '45m 10s', eventCount: 1205, errorCount: 5, timestamp: '1 hour ago', platform: 'iOS (Mobile Safari)' },
  { id: 'SES-4492', userEmail: 'anonymous', duration: '5s', eventCount: 4, errorCount: 1, timestamp: '2 hours ago', platform: 'Android (Chrome)' },
  { id: 'SES-5521', userEmail: 'jessica.p@studio.io', duration: '8m 30s', eventCount: 220, errorCount: 0, timestamp: '3 hours ago', platform: 'MacOS (Chrome)' },
];
