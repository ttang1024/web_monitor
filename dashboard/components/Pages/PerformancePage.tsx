import React, { useMemo } from 'react';
import { Icons } from '../ui/Icons';
import { CHART_COLORS } from '../../constants';
import { SimpleAreaChart } from '../charts/BaseCharts';
import { TimeRange } from '../../types';
import { useApi } from '../../hooks/useApi';
import { DateRange, businessFlows, dashboardStats, performanceTimeSeries, slowRequests, webVitals } from '../../services/api';
import { bucketFor, formatTimeLabel } from '../../services/timeRange';

interface PerformancePageProps {
  timeRange: TimeRange;
  range: DateRange;
  theme?: 'light' | 'dark';
}

interface VitalCard {
  name: string;
  value: string;
  rawValue: number | null;
  unit: string;
  score: 'good' | 'needs-improvement' | 'poor';
  delta: string;
}

// Google's Core Web Vitals thresholds (field data, P75).
const THRESHOLDS: Record<string, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  FCP: { good: 1800, poor: 3000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
};

function scoreOf(name: string, value: number | null): VitalCard['score'] {
  if (value === null) return 'good';
  const threshold = THRESHOLDS[name];
  if (!threshold) return 'good';
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

/** Weighted Lighthouse-style score from the vitals we actually measure. */
function performanceScore(vitals: { name: string; value: number | null }[]): number | null {
  const weights: Record<string, number> = { LCP: 0.3, INP: 0.2, CLS: 0.2, FCP: 0.15, TTFB: 0.15 };
  let total = 0;
  let weight = 0;

  for (const vital of vitals) {
    const threshold = THRESHOLDS[vital.name];
    const vitalWeight = weights[vital.name];
    if (vital.value === null || !threshold || !vitalWeight) continue;
    // 100 at or below "good", 0 at or above "poor", linear in between.
    const ratio = (threshold.poor - vital.value) / (threshold.poor - threshold.good);
    total += Math.max(0, Math.min(1, ratio)) * 100 * vitalWeight;
    weight += vitalWeight;
  }

  return weight === 0 ? null : Math.round(total / weight);
}

export const PerformancePage: React.FC<PerformancePageProps> = ({ timeRange, range, theme = 'dark' }) => {
  const vitals = useApi(() => webVitals(range), [range.startDate, range.endDate]);
  const bucket = bucketFor(timeRange);
  const series = useApi(() => performanceTimeSeries(range, bucket), [range.startDate, range.endDate, bucket]);
  const stats = useApi(() => dashboardStats(range), [range.startDate, range.endDate]);
  const flows = useApi(() => businessFlows(range), [range.startDate, range.endDate]);
  const slow = useApi(() => slowRequests(range), [range.startDate, range.endDate]);

  const vitalCards: VitalCard[] = useMemo(() => {
    const data = vitals.data;
    const format = (value: number | null, digits = 0) => (value === null ? '—' : value.toFixed(digits));

    return [
      { name: 'LCP', rawValue: data?.lcp ?? null, value: format(data?.lcp ?? null), unit: 'ms', score: scoreOf('LCP', data?.lcp ?? null), delta: 'P75' },
      { name: 'FCP', rawValue: data?.fcp ?? null, value: format(data?.fcp ?? null), unit: 'ms', score: scoreOf('FCP', data?.fcp ?? null), delta: 'P75' },
      { name: 'INP', rawValue: data?.inp ?? null, value: format(data?.inp ?? null), unit: 'ms', score: scoreOf('INP', data?.inp ?? null), delta: 'P75' },
      { name: 'CLS', rawValue: data?.cls ?? null, value: format(data?.cls ?? null, 3), unit: '', score: scoreOf('CLS', data?.cls ?? null), delta: 'P75' },
      { name: 'TTFB', rawValue: data?.ttfb ?? null, value: format(data?.ttfb ?? null), unit: 'ms', score: scoreOf('TTFB', data?.ttfb ?? null), delta: 'P75' },
    ];
  }, [vitals.data]);

  const lcpTrend = useMemo(
    () =>
      (series.data ?? []).map((point) => ({
        time: formatTimeLabel(point.timestamp, bucket),
        value: Math.round(point.avgLCP),
      })),
    [series.data, bucket]
  );

  const score = performanceScore(vitalCards.map((card) => ({ name: card.name, value: card.rawValue })));
  const slowPages = stats.data?.topSlowPages ?? [];
  const sampleCount = vitals.data?.sampleCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Performance</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Core Web Vitals at P75 across {sampleCount.toLocaleString()} page load{sampleCount === 1 ? '' : 's'} in this window.
          </p>
        </div>
        <button
          onClick={() => { vitals.refetch(); series.refetch(); stats.refetch(); flows.refetch(); slow.refetch(); }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Refresh"
        >
          <Icons.Refresh size={18} className={vitals.loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {vitals.error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icons.AlertTriangle size={16} />
          <span>{vitals.error}</span>
          <button onClick={vitals.refetch} className="ml-auto underline">Retry</button>
        </div>
      )}

      {sampleCount === 0 && !vitals.loading && !vitals.error && (
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300">
          No page-load samples in this window yet. Install the SDK with one of your project keys and load a page.
        </div>
      )}

      {/* Web Vitals Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {vitalCards.map((vital) => (
          <div key={vital.name} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">{vital.name}</h3>
              {vital.rawValue !== null && (
                <span className={`px-2 py-0.5 rounded text-xs font-bold capitalize
                  ${vital.score === 'good' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                    vital.score === 'poor' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'}`}>
                  {vital.score}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{vital.value}</span>
              <span className="text-slate-500 text-sm">{vital.unit}</span>
            </div>
            <div className="text-xs mt-2 flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <Icons.Activity size={12} />
              75th percentile
            </div>
          </div>
        ))}
      </div>

      {/* Main Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">LCP Trend (average per {bucket})</h3>
          </div>
          <div className="h-64">
            {series.loading && !series.data ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading…</div>
            ) : lcpTrend.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">No samples in this window</div>
            ) : (
              <SimpleAreaChart data={lcpTrend} color={CHART_COLORS.warning} theme={theme} />
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center mb-4
              ${score === null ? 'border-slate-300 dark:border-slate-700' :
                score >= 90 ? 'border-green-500' : score >= 50 ? 'border-yellow-500' : 'border-red-500'}`}>
               <span className="text-3xl font-bold text-slate-900 dark:text-white">{score ?? '—'}</span>
            </div>
            <h3 className="text-slate-900 dark:text-white font-semibold mb-1">Performance Score</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs px-4">Weighted from measured LCP, INP, CLS, FCP and TTFB at P75.</p>
        </div>
      </div>

      {/* Slowest Pages Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">Slowest Pages</h3>
          <span className="text-xs text-slate-500">by average load time</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs">
              <tr>
                <th className="px-6 py-3">Page</th>
                <th className="px-6 py-3 text-right">Avg Load</th>
                <th className="px-6 py-3 text-right">Samples</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {slowPages.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-500">No page-load samples yet.</td>
                </tr>
              ) : (
                slowPages.map((page) => (
                  <tr key={page.url} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-primary-600 dark:text-primary-400 truncate max-w-[420px]" title={page.url}>{page.url}</td>
                    <td className="px-6 py-4 text-right text-slate-900 dark:text-slate-300 font-bold">{Math.round(page.avgLoadTime)}ms</td>
                    <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">{page.sampleCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Successful requests slower than the SDK's slowRequestMs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">Slow API Requests</h3>
          <span className="text-xs text-slate-500">successful calls over the SDK's slowRequestMs (3s by default)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs">
              <tr>
                <th className="px-6 py-3">Endpoint</th>
                <th className="px-6 py-3 text-right">Slow calls</th>
                <th className="px-6 py-3 text-right">Avg</th>
                <th className="px-6 py-3 text-right">Slowest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {slow.error ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-red-500">{slow.error}</td>
                </tr>
              ) : (slow.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    {slow.loading ? 'Loading…' : 'No slow requests in this window.'}
                  </td>
                </tr>
              ) : (
                slow.data!.map((request) => (
                  <tr key={`${request.method} ${request.url}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-mono truncate max-w-[480px]" title={request.url}>
                      <span className="text-slate-500 dark:text-slate-400 mr-2">{request.method}</span>
                      <span className="text-primary-600 dark:text-primary-400">{request.url}</span>
                    </td>
                    <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">{request.count}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-slate-300">{Math.round(request.avgDurationMs)}ms</td>
                    <td className="px-6 py-4 text-right text-amber-600 dark:text-amber-400">{Math.round(request.maxDurationMs)}ms</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Business flows recorded with monitor.startFlow() */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">Business Flows</h3>
          <span className="text-xs text-slate-500">journeys tracked with startFlow()</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs">
              <tr>
                <th className="px-6 py-3">Flow</th>
                <th className="px-6 py-3 text-right">Started</th>
                <th className="px-6 py-3 text-right">Completed</th>
                <th className="px-6 py-3 text-right">Failed</th>
                <th className="px-6 py-3 text-right">Timed out</th>
                <th className="px-6 py-3 text-right">Abandoned</th>
                <th className="px-6 py-3 text-right">Avg duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {flows.error ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-red-500">{flows.error}</td>
                </tr>
              ) : (flows.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    {flows.loading ? 'Loading…' : 'No business flows in this window.'}
                  </td>
                </tr>
              ) : (
                flows.data!.map((flow) => {
                  const completion = flow.total > 0 ? Math.round((flow.completed / flow.total) * 100) : 0;
                  return (
                    <tr key={flow.flow} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-900 dark:text-slate-200">{flow.flow}</td>
                      <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">{flow.total}</td>
                      <td className="px-6 py-4 text-right font-bold text-green-600 dark:text-green-400">
                        {flow.completed} <span className="font-normal text-slate-400">({completion}%)</span>
                      </td>
                      <td className="px-6 py-4 text-right text-red-600 dark:text-red-400">{flow.failed}</td>
                      <td className="px-6 py-4 text-right text-amber-600 dark:text-amber-400">{flow.timedOut}</td>
                      <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">{flow.abandoned}</td>
                      <td className="px-6 py-4 text-right text-slate-900 dark:text-slate-300">{Math.round(flow.avgDurationMs)}ms</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
