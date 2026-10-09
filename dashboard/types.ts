
export enum ChartType {
  Line = 'line',
  Bar = 'bar',
  Area = 'area',
  Pie = 'pie',
}

/** Every metric here is backed by a real query (see Widget.loadWidgetData). */
export enum MetricType {
  ErrorCount = 'error_count',
  PageLoad = 'page_load',
  FCP = 'fcp',
  LCP = 'lcp',
  PageViews = 'page_views',
  ApiFailures = 'api_failures',
  BrowserMix = 'browser_mix',
}

export type TimeRange = '15m' | '1h' | '24h' | '7d' | 'custom';

export interface CustomTimeRange {
  start: string;
  end: string;
}

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

export interface DashboardState {
  widgets: WidgetConfig[];
  timeRange: TimeRange;
  customTimeRange?: CustomTimeRange;
  isEditMode: boolean;
}

// --- New Types for Pages ---

export type Page = 'overview' | 'dashboard' | 'issues' | 'performance' | 'events' | 'alerts';
