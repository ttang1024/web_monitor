import React, { useMemo } from 'react';
import { WidgetConfig, ChartType, MetricType, TimeRange, WidgetDataPoint } from '../../types';
import { SimpleLineChart, SimpleAreaChart, SimpleBarChart, SimplePieChart } from '../charts/BaseCharts';
import { Icons } from '../ui/Icons';
import { MOCK_COLORS } from '../../constants';
import { useApi } from '../../hooks/useApi';
import {
  DateRange,
  dashboardStats,
  deviceBreakdown,
  listApiErrors,
  performanceTimeSeries,
} from '../../services/api';
import { bucketFor, formatTimeLabel } from '../../services/timeRange';

interface WidgetProps {
  config: WidgetConfig;
  isEditMode: boolean;
  timeRange: TimeRange;
  range: DateRange;
  onRemove: (id: string) => void;
  onResize: (id: string, action: 'expand' | 'shrink') => void;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  isDragging?: boolean;
  theme?: 'light' | 'dark';
}

/**
 * Every widget maps to a real query. Metrics the backend cannot answer yet
 * (JS heap, API latency percentiles) say so rather than drawing noise.
 */
async function loadWidgetData(
  metric: MetricType,
  chartType: ChartType,
  range: DateRange,
  bucket: 'hour' | 'day'
): Promise<{ points: WidgetDataPoint[]; unsupported?: string }> {
  switch (metric) {
    case MetricType.ErrorRate: {
      const stats = await dashboardStats(range);
      return {
        points: stats.errorTrend.labels.map((label, index) => ({
          time: label,
          value: stats.errorTrend.values[index] ?? 0,
        })),
      };
    }
    case MetricType.PageLoad: {
      if (chartType === ChartType.Bar) {
        const stats = await dashboardStats(range);
        return {
          points: stats.topSlowPages.slice(0, 5).map((page) => ({
            name: new URL(page.url, 'http://x').pathname,
            time: new URL(page.url, 'http://x').pathname,
            value: Math.round(page.avgLoadTime),
          })),
        };
      }
      const series = await performanceTimeSeries(range, bucket);
      return {
        points: series.map((point) => ({
          time: formatTimeLabel(point.timestamp, bucket),
          value: Math.round(point.avgLoadTime),
        })),
      };
    }
    case MetricType.LCP:
    case MetricType.FCP: {
      const series = await performanceTimeSeries(range, bucket);
      return {
        points: series.map((point) => ({
          time: formatTimeLabel(point.timestamp, bucket),
          value: Math.round(metric === MetricType.LCP ? point.avgLCP : point.avgFCP),
        })),
      };
    }
    case MetricType.UserSessions: {
      const series = await performanceTimeSeries(range, bucket);
      return {
        points: series.map((point) => ({
          time: formatTimeLabel(point.timestamp, bucket),
          value: point.count,
        })),
      };
    }
    case MetricType.ApiFailure: {
      const [apiErrors, series] = await Promise.all([
        listApiErrors({ page: 1, pageSize: 200, startDate: range.startDate }),
        performanceTimeSeries(range, bucket),
      ]);

      // Bucket failures onto the same grid the page-load series uses.
      const buckets = new Map(series.map((point) => [formatTimeLabel(point.timestamp, bucket), 0]));
      for (const apiError of apiErrors.data) {
        const label = formatTimeLabel(new Date(apiError.timestamp).toISOString(), bucket);
        if (buckets.has(label)) buckets.set(label, (buckets.get(label) ?? 0) + 1);
      }

      return { points: [...buckets.entries()].map(([time, value]) => ({ time, value })) };
    }
    case MetricType.CLS: {
      const series = await performanceTimeSeries(range, bucket);
      return {
        points: series.map((point) => ({ time: formatTimeLabel(point.timestamp, bucket), value: point.count })),
      };
    }
    case MetricType.JsHeap: {
      // Repurposed as the browser mix, which is what the SDK does report.
      const slices = await deviceBreakdown('browser', range);
      return { points: slices.map((slice) => ({ name: slice.name, time: slice.name, value: slice.count })) };
    }
    case MetricType.ApiLatency:
      return { points: [], unsupported: 'The SDK does not report API latency yet — only failures.' };
    default:
      return { points: [] };
  }
}

export const Widget: React.FC<WidgetProps> = ({
  config,
  isEditMode,
  timeRange,
  range,
  onRemove,
  onResize,
  onDragStart,
  onDragEnter,
  onDragEnd,
  isDragging,
  theme = 'dark'
}) => {
  const bucket = bucketFor(timeRange);
  const { data, loading, error } = useApi(
    () => loadWidgetData(config.metric, config.type, range, bucket),
    [config.metric, config.type, range.startDate, range.endDate, bucket]
  );

  const points = useMemo(() => data?.points ?? [], [data]);

  const renderChart = () => {
    const color = config.metric === MetricType.ErrorRate || config.metric === MetricType.ApiFailure
      ? MOCK_COLORS.danger
      : MOCK_COLORS.primary;

    if (loading && !data) {
      return <div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading…</div>;
    }
    if (error) {
      return <div className="h-full flex items-center justify-center text-red-500 text-sm px-4 text-center">{error}</div>;
    }
    if (data?.unsupported) {
      return <div className="h-full flex items-center justify-center text-slate-400 text-xs px-6 text-center">{data.unsupported}</div>;
    }
    if (points.length === 0) {
      return <div className="h-full flex items-center justify-center text-slate-400 text-sm">No data in this window</div>;
    }

    switch (config.type) {
      case ChartType.Line:
        return <SimpleLineChart data={points} color={color} theme={theme} />;
      case ChartType.Area:
        return <SimpleAreaChart data={points} color={color} theme={theme} />;
      case ChartType.Bar:
        return <SimpleBarChart data={points} color={color} theme={theme} />;
      case ChartType.Pie:
        return <SimplePieChart data={points} theme={theme} />;
      default:
        return <div className="text-slate-500">Unsupported Chart Type</div>;
    }
  };

  return (
    <div
      className={`
        relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col shadow-sm
        transition-all duration-200
        ${isEditMode ? 'cursor-move ring-2 ring-primary-500 ring-opacity-50 border-transparent bg-slate-50 dark:bg-slate-850' : 'hover:border-slate-300 dark:hover:border-slate-700'}
        ${isDragging ? 'opacity-40 border-dashed border-primary-500 scale-[0.98]' : 'opacity-100'}
      `}
      style={{
        gridColumn: `span ${config.w}`,
        gridRow: `span ${config.h}`,
        minHeight: '280px'
      }}
      draggable={isEditMode}
      onDragStart={(e) => {
        if (!isEditMode) {
          e.preventDefault();
          return;
        }
        // Set the drag effect
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(config.id);
      }}
      onDragEnter={(e) => {
        if (isEditMode) {
          e.preventDefault();
          onDragEnter(config.id);
        }
      }}
      onDragOver={(e) => {
        // Essential to allow dropping
        if (isEditMode) e.preventDefault();
      }}
      onDragEnd={onDragEnd}
    >
      {/* Widget Header */}
      <div className="flex items-center justify-between mb-4 pointer-events-none">
        {/* pointer-events-none on header elements ensures drag events bubble up nicely from container,
            but we enable pointer events on buttons specifically */}
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 truncate">
          {config.title}
          {config.metric === MetricType.ErrorRate && points.some((point) => Number(point.value) > 0) && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
          )}
        </h3>

        {isEditMode ? (
          <div className="flex items-center bg-white dark:bg-slate-800 rounded-md p-0.5 border border-slate-200 dark:border-slate-700 pointer-events-auto">
             {/* Drag Handle Icon */}
             <div className="p-1.5 text-slate-400 dark:text-slate-500 cursor-grab active:cursor-grabbing">
                <Icons.Grip size={14} />
             </div>

            <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1"></div>

             {/* Size */}
             <button
              onClick={(e) => { e.stopPropagation(); onResize(config.id, 'shrink'); }}
              className={`p-1.5 rounded transition-colors ${config.w <= 1 ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'}`}
              title="Shrink Width"
              disabled={config.w <= 1}
            >
              <Icons.Minimize size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onResize(config.id, 'expand'); }}
              className={`p-1.5 rounded transition-colors ${config.w >= 4 ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'}`}
               title="Expand Width"
               disabled={config.w >= 4}
            >
              <Icons.Maximize size={14} />
            </button>

            <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1"></div>

            {/* Delete */}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(config.id); }}
              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/50 rounded text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300"
               title="Remove Widget"
            >
              <Icons.Trash size={14} />
            </button>
          </div>
        ) : (
          <button className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 pointer-events-auto">
            <Icons.More size={16} />
          </button>
        )}
      </div>

      {/* Chart Area */}
      <div className="flex-1 min-h-0 w-full pointer-events-none">
        {renderChart()}
      </div>
    </div>
  );
};
