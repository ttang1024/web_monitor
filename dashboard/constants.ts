import { WidgetConfig, ChartType, MetricType } from './types';

export const INITIAL_WIDGETS: WidgetConfig[] = [
  { id: '1', title: 'Page Views', type: ChartType.Area, metric: MetricType.PageViews, w: 2, h: 1 },
  { id: '2', title: 'Errors', type: ChartType.Line, metric: MetricType.ErrorCount, w: 2, h: 1 },
  { id: '3', title: 'Core Web Vitals: LCP (ms)', type: ChartType.Bar, metric: MetricType.LCP, w: 1, h: 1 },
  { id: '4', title: 'API Failures', type: ChartType.Line, metric: MetricType.ApiFailures, w: 1, h: 1 },
  { id: '5', title: 'Browser Mix', type: ChartType.Pie, metric: MetricType.BrowserMix, w: 2, h: 1 },
  { id: '6', title: 'Slowest Routes', type: ChartType.Bar, metric: MetricType.PageLoad, w: 4, h: 1 },
];

export const CHART_COLORS = {
  primary: '#059669', // Emerald 600 — rgb(5, 150, 105)
  secondary: '#ec4899', // Pink 500
  success: '#22c55e', // Green 500
  warning: '#f59e0b', // Amber 500
  danger: '#ef4444', // Red 500
  neutral: '#94a3b8', // Slate 400
  grid: '#334155', // Slate 700
};
