import React, { useState } from 'react';
import { Icons } from '../ui/Icons';
import { MetricType, ChartType } from '../../types';

interface AddWidgetModalProps {
  onClose: () => void;
  onAdd: (config: { title: string; metric: MetricType; type: ChartType; w: number }) => void;
}

const METRIC_OPTIONS = [
  { value: MetricType.ErrorCount, label: 'Errors', description: 'Error occurrences over time' },
  { value: MetricType.PageLoad, label: 'Page Load Time', description: 'Avg time to full load' },
  { value: MetricType.PageViews, label: 'Page Views', description: 'Pages loaded per interval' },
  { value: MetricType.ApiFailures, label: 'API Failures', description: 'Failed requests over time' },
  { value: MetricType.BrowserMix, label: 'Browser Mix', description: 'Page views by browser' },
  { value: MetricType.LCP, label: 'LCP (Core Web Vital)', description: 'Largest Contentful Paint' },
  { value: MetricType.FCP, label: 'FCP', description: 'First Contentful Paint' },
];

const CHART_OPTIONS = [
  { value: ChartType.Line, label: 'Line Chart', icon: Icons.Activity },
  { value: ChartType.Bar, label: 'Bar Chart', icon: Icons.BarChart },
  { value: ChartType.Area, label: 'Area Chart', icon: Icons.Grid },
  { value: ChartType.Pie, label: 'Pie Chart', icon: Icons.PieChart },
];

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({ onClose, onAdd }) => {
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState<MetricType>(MetricType.ErrorCount);
  const [chartType, setChartType] = useState<ChartType>(ChartType.Line);
  const [width, setWidth] = useState(2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      title: title || METRIC_OPTIONS.find(m => m.value === metric)?.label || 'New Widget',
      metric,
      type: chartType,
      w: width
    });
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm z-50 animate-fade-in" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Add Dashboard Widget</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Select metrics and visualization type.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <Icons.X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Metric Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Select Metric</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {METRIC_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => {
                    setMetric(opt.value);
                    if (!title) setTitle(opt.label);
                  }}
                  className={`
                    p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3
                    ${metric === opt.value 
                      ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 ring-1 ring-primary-500/50' 
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-900'}
                  `}
                >
                  <div className={`mt-1 w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${metric === opt.value ? 'border-primary-500' : 'border-slate-400 dark:border-slate-600'}`}>
                    {metric === opt.value && <div className="w-2 h-2 rounded-full bg-primary-500" />}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${metric === opt.value ? 'text-primary-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>{opt.label}</div>
                    <div className="text-xs text-slate-500">{opt.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visualization & Config Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Chart Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Visualization</label>
              <div className="grid grid-cols-2 gap-2">
                {CHART_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setChartType(opt.value)}
                    className={`
                      flex flex-col items-center justify-center gap-2 p-3 rounded-lg border transition-all
                      ${chartType === opt.value
                        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'}
                    `}
                  >
                    <opt.icon size={20} />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Widget Size & Title */}
            <div className="space-y-4">
               <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Widget Title</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Error Rate Trend"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Grid Width (1-4 cols)</label>
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-1">
                  {[1, 2, 3, 4].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWidth(w)}
                      className={`
                        flex-1 py-1.5 text-xs font-medium rounded transition-colors
                        ${width === w 
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}
                      `}
                    >
                      {w}x
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Widget will span {width} column{width > 1 ? 's' : ''} on the dashboard grid.
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-6 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-colors text-sm font-medium shadow-lg shadow-primary-900/20"
            >
              Add Widget
            </button>
          </div>
        </form>
      </div>
    </>
  );
};