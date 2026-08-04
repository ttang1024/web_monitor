
export enum ChartType {
  Line = 'line',
  Bar = 'bar',
  Area = 'area',
  Pie = 'pie',
  Number = 'number',
}

export enum MetricType {
  ErrorRate = 'error_rate',
  PageLoad = 'page_load',
  FCP = 'fcp',
  LCP = 'lcp',
  CLS = 'cls',
  ApiLatency = 'api_latency',
  ApiFailure = 'api_failure',
  JsHeap = 'js_heap',
  UserSessions = 'user_sessions',
}

export type TimeRange = '15m' | '1h' | '24h' | '7d' | 'custom';

export interface CustomTimeRange {
  start: string;
  end: string;
}

export type Environment = 'production' | 'staging' | 'development';

export interface WidgetDataPoint {
  time: string;
  value: number;
  [key: string]: string | number;
}

export interface WidgetConfig {
  id: string;
  title: string;
  type: ChartType;
  metric: MetricType;
  w: number; // grid width (col span)
  h: number; // grid height (row span)
}

/** A project is an API key: the credential a page reports with. */
export interface Application {
  id: string;
  name: string;
  environment: string;
  apiKey: string;
  isActive: boolean;
}

export interface DashboardState {
  widgets: WidgetConfig[];
  timeRange: TimeRange;
  customTimeRange?: CustomTimeRange;
  environment: Environment;
  isEditMode: boolean;
}

export interface AIAnalysisResponse {
  summary: string;
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// --- New Types for Pages ---

export type Page = 'overview' | 'dashboard' | 'issues' | 'performance' | 'replays' | 'alerts';

export interface Breadcrumb {
  timestamp: string;
  type: 'navigation' | 'http' | 'ui' | 'console';
  category: string;
  message: string;
  level: 'info' | 'warning' | 'error';
}

export type IssueStatus = 'unresolved' | 'resolved' | 'ignored' | 'review' | 'regressed';

export interface Issue {
  id: string;
  type: string;
  message: string;
  events: number;
  users: number;
  lastSeen: string;
  firstSeen: string;
  status: IssueStatus;
  graphData: { time: string; value: number }[];
  stackTrace: string;
  breadcrumbs: Breadcrumb[];
  tags: {
    browser: string;
    os: string;
    url: string;
    release: string;
  };
}

export interface WebVital {
  name: string;
  value: number | string;
  unit: string;
  score: 'good' | 'needs-improvement' | 'poor';
  delta: string;
}

export interface RoutePerformance {
  path: string;
  avgDuration: number;
  p75: number;
  p95: number;
  throughput: number;
}

export interface ReplaySession {
  id: string;
  userEmail: string;
  duration: string;
  eventCount: number;
  errorCount: number;
  timestamp: string;
  platform: string;
}
