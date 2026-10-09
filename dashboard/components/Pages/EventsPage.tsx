import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../ui/Icons';
import { CHART_COLORS } from '../../constants';
import { SimpleAreaChart } from '../charts/BaseCharts';
import { TimeRange } from '../../types';
import { useApi } from '../../hooks/useApi';
import { DateRange, customEventStats, customMetricStats, customMetricTimeSeries, listCustomEvents } from '../../services/api';
import { bucketFor, formatRelative, formatTimeLabel } from '../../services/timeRange';

interface EventsPageProps {
  timeRange: TimeRange;
  range: DateRange;
  theme?: 'light' | 'dark';
}

const PAGE_SIZE = 20;

const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm';
const cardHeader = 'px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-4';
const tableHead = 'bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs';

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center text-slate-500">
        {children}
      </td>
    </tr>
  );
}

/** Data sent with captureCustomEvent() and captureMetric(). Business flows live on the Performance page. */
export const EventsPage: React.FC<EventsPageProps> = ({ timeRange, range, theme = 'dark' }) => {
  const bucket = bucketFor(timeRange);
  const rangeDeps = [range.startDate, range.endDate];

  const metrics = useApi(() => customMetricStats(range), rangeDeps);
  const events = useApi(() => customEventStats(range), rangeDeps);

  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Default the chart to the busiest metric, and keep the choice while it still exists.
  useEffect(() => {
    const names = (metrics.data ?? []).map((metric) => metric.name);
    if (!selectedMetric || !names.includes(selectedMetric)) setSelectedMetric(names[0] ?? null);
  }, [metrics.data, selectedMetric]);

  useEffect(() => setPage(1), [selectedEvent, range.startDate, range.endDate]);

  const series = useApi(
    () => (selectedMetric ? customMetricTimeSeries(selectedMetric, range, bucket) : Promise.resolve([])),
    [selectedMetric, ...rangeDeps, bucket]
  );
  const recent = useApi(
    () => listCustomEvents({ name: selectedEvent ?? undefined, page, pageSize: PAGE_SIZE, ...range }),
    [selectedEvent, page, ...rangeDeps]
  );

  const trend = useMemo(
    () =>
      (series.data ?? []).map((point) => ({
        time: formatTimeLabel(point.timestamp, bucket),
        value: Math.round(point.avg * 100) / 100,
      })),
    [series.data, bucket]
  );

  const error = metrics.error || events.error;
  const isEmpty =
    !metrics.loading && !events.loading && !error && (metrics.data ?? []).length === 0 && (events.data ?? []).length === 0;
  const totalPages = Math.max(1, Math.ceil((recent.data?.total ?? 0) / PAGE_SIZE));

  const refresh = () => {
    metrics.refetch();
    events.refetch();
    series.refetch();
    recent.refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Events</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Custom events and metrics your app sends with captureCustomEvent() and captureMetric().
          </p>
        </div>
        <button
          onClick={refresh}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Refresh"
        >
          <Icons.Refresh size={18} className={metrics.loading || events.loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icons.AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={refresh} className="ml-auto underline">Retry</button>
        </div>
      )}

      {isEmpty && (
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300">
          No custom events or metrics in this window. Send some with{' '}
          <code className="font-mono">monitor.captureCustomEvent('signup', {'{ plan: "pro" }'})</code> or{' '}
          <code className="font-mono">monitor.captureMetric('search_ms', 420)</code>.
        </div>
      )}

      {/* Metrics: summary table and trend for the selected one */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className={`lg:col-span-2 ${card}`}>
          <div className={cardHeader}>
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">Metrics</h3>
            <span className="text-xs text-slate-500">select one to chart it</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-3">Metric</th>
                  <th className="px-4 py-3 text-right">Samples</th>
                  <th className="px-4 py-3 text-right">Avg</th>
                  <th className="px-4 py-3 text-right">Min</th>
                  <th className="px-4 py-3 text-right">Max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(metrics.data ?? []).length === 0 ? (
                  <EmptyRow colSpan={5}>{metrics.loading ? 'Loading…' : 'No metrics in this window.'}</EmptyRow>
                ) : (
                  metrics.data!.map((metric) => (
                    <tr
                      key={metric.name}
                      onClick={() => setSelectedMetric(metric.name)}
                      className={`cursor-pointer transition-colors ${
                        metric.name === selectedMetric
                          ? 'bg-primary-50 dark:bg-primary-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-slate-900 dark:text-slate-200 truncate max-w-[180px]" title={metric.name}>
                        {metric.name}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{metric.count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-300">{formatValue(metric.avg)}</td>
                      <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{formatValue(metric.min)}</td>
                      <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{formatValue(metric.max)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-6">
            {selectedMetric ? (
              <>
                <span className="font-mono">{selectedMetric}</span> (average per {bucket})
              </>
            ) : (
              'Metric trend'
            )}
          </h3>
          <div className="h-64">
            {!selectedMetric ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">No metric selected</div>
            ) : series.loading && !series.data ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading…</div>
            ) : series.error ? (
              <div className="h-full flex items-center justify-center text-red-500 text-sm">{series.error}</div>
            ) : trend.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">No samples in this window</div>
            ) : (
              <SimpleAreaChart data={trend} color={CHART_COLORS.primary} theme={theme} />
            )}
          </div>
        </div>
      </div>

      {/* Events: totals per name */}
      <div className={card}>
        <div className={cardHeader}>
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">Events</h3>
          <span className="text-xs text-slate-500">select one to see its occurrences</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="px-6 py-3">Event</th>
                <th className="px-6 py-3 text-right">Count</th>
                <th className="px-6 py-3 text-right">Users</th>
                <th className="px-6 py-3 text-right">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(events.data ?? []).length === 0 ? (
                <EmptyRow colSpan={4}>{events.loading ? 'Loading…' : 'No events in this window.'}</EmptyRow>
              ) : (
                events.data!.map((event) => (
                  <tr
                    key={event.name}
                    onClick={() => setSelectedEvent(event.name === selectedEvent ? null : event.name)}
                    className={`cursor-pointer transition-colors ${
                      event.name === selectedEvent
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="px-6 py-4 font-mono text-slate-900 dark:text-slate-200">{event.name}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-slate-300">{event.count.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">{event.users.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">{formatRelative(event.lastSeen)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent occurrences, filtered by the selected event */}
      <div className={card}>
        <div className={cardHeader}>
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">
            Recent {selectedEvent ? <span className="font-mono">{selectedEvent}</span> : 'events'}
          </h3>
          {selectedEvent && (
            <button onClick={() => setSelectedEvent(null)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
              Show all events
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="px-6 py-3">When</th>
                <th className="px-6 py-3">Event</th>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Page</th>
                <th className="px-6 py-3">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.error ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-red-500">{recent.error}</td>
                </tr>
              ) : (recent.data?.data ?? []).length === 0 ? (
                <EmptyRow colSpan={5}>{recent.loading ? 'Loading…' : 'No events in this window.'}</EmptyRow>
              ) : (
                recent.data!.data.map((row) => {
                  const data = row.data && Object.keys(row.data).length > 0 ? JSON.stringify(row.data) : '';
                  return (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap" title={row.createdAt}>
                        {formatRelative(row.createdAt)}
                      </td>
                      <td className="px-6 py-3 font-mono text-slate-900 dark:text-slate-200">{row.eventName}</td>
                      <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{row.userId ?? '—'}</td>
                      <td className="px-6 py-3 font-mono text-primary-600 dark:text-primary-400 truncate max-w-[260px]" title={row.url}>
                        {row.url}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 truncate max-w-[320px]" title={data}>
                        {data || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm text-slate-500">
            <span>
              Page {page} of {totalPages} ({recent.data!.total.toLocaleString()} events)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className="px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
