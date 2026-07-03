import React, { useMemo } from 'react';
import { Icons } from '../ui/Icons';
import { MOCK_WEB_VITALS, MOCK_PERFORMANCE_ROUTES, generateTimeSeriesData, MOCK_COLORS } from '../../constants';
import { SimpleAreaChart } from '../charts/BaseCharts';
import { Environment } from '../../types';

interface PerformancePageProps {
  environment?: Environment;
  theme?: 'light' | 'dark';
}

export const PerformancePage: React.FC<PerformancePageProps> = ({ environment = 'production', theme = 'dark' }) => {
  // Cast environment to Environment to avoid "Argument of type 'string' is not assignable to parameter of type 'Environment'" error
  const trendData = useMemo(() => generateTimeSeriesData(24, 1500, 300, 1, undefined, environment as Environment), [environment]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Performance</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Monitor Core Web Vitals and throughput metrics.</p>
      </div>

      {/* Web Vitals Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {MOCK_WEB_VITALS.map((vital) => (
          <div key={vital.name} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">{vital.name}</h3>
              <span className={`px-2 py-0.5 rounded text-xs font-bold capitalize 
                ${vital.score === 'good' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 
                  vital.score === 'poor' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 
                  'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'}`}>
                {vital.score}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{vital.value}</span>
              <span className="text-slate-500 text-sm">{vital.unit}</span>
            </div>
            <div className={`text-xs mt-2 flex items-center gap-1 ${vital.delta.startsWith('+') ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {vital.delta.startsWith('+') ? <Icons.Activity size={12} /> : <Icons.Check size={12} />}
              {vital.delta} vs last week
            </div>
          </div>
        ))}
      </div>

      {/* Main Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">LCP Trend (P75)</h3>
          </div>
          <div className="h-64">
             <SimpleAreaChart data={trendData} color={MOCK_COLORS.warning} theme={theme} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <div className="w-32 h-32 rounded-full border-4 border-green-500 flex items-center justify-center mb-4">
               <span className="text-3xl font-bold text-slate-900 dark:text-white">98</span>
            </div>
            <h3 className="text-slate-900 dark:text-white font-semibold mb-1">Performance Score</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs px-4">Based on weighted average of Web Vitals field data.</p>
        </div>
      </div>

      {/* Slowest Routes Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">Most Regressed Transactions</h3>
          <button className="text-primary-600 dark:text-primary-400 text-sm hover:underline">View All</button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs">
            <tr>
              <th className="px-6 py-3">Transaction Name</th>
              <th className="px-6 py-3 text-right">Avg Duration</th>
              <th className="px-6 py-3 text-right">P95</th>
              <th className="px-6 py-3 text-right">Throughput (rpm)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {MOCK_PERFORMANCE_ROUTES.map((route, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-4 font-mono text-primary-600 dark:text-primary-400">{route.path}</td>
                <td className="px-6 py-4 text-right text-slate-700 dark:text-slate-300">{route.avgDuration}ms</td>
                <td className="px-6 py-4 text-right text-slate-900 dark:text-slate-300 font-bold">{route.p95}ms</td>
                <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">{route.throughput}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};