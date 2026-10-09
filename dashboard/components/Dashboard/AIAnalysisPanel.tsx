import React, { useState } from 'react';
import { Icons } from '../ui/Icons';
import { analyzeDashboard, AIAnalysisResult, DateRange } from '../../services/api';
import { DashboardState } from '../../types';

interface Props {
  dashboardState: DashboardState;
  /** The window on screen; the server reads the metrics for it from the tenant's own data. */
  range: DateRange;
  onClose: () => void;
}

export const AIAnalysisPanel: React.FC<Props> = ({ dashboardState, range, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeDashboard({
        timeRange: dashboardState.timeRange,
        ...range,
      });
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Icons.AI className="text-primary-500" />
          AI Insights
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
          <Icons.X size={20} />
        </button>
      </div>

      {!analysis && !loading && !error && (
        <div className="text-center py-10">
          <div className="bg-slate-100 dark:bg-slate-800/50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Icons.Zap className="text-yellow-500 dark:text-yellow-400" size={32} />
          </div>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            Generate an instant analysis of your current dashboard metrics using Gemini 2.5 Flash.
          </p>
          <button
            onClick={handleAnalyze}
            className="bg-primary-600 hover:bg-primary-500 text-white font-medium py-2 px-6 rounded-full transition-colors w-full flex items-center justify-center gap-2"
          >
            Run Analysis
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Icons.Refresh className="animate-spin text-primary-500" size={32} />
          <p className="text-slate-500 dark:text-slate-400 animate-pulse">Analyzing telemetry data...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-200 p-4 rounded-lg text-sm">
          <p className="font-bold mb-1">Analysis Failed</p>
          {error}
        </div>
      )}

      {analysis && (
        <div className="space-y-6 animate-fade-in">
          {/* Severity Badge */}
          <div className={`
            p-3 rounded-lg flex items-center justify-between
            ${analysis.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200' : 
              analysis.severity === 'high' ? 'bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-200' :
              analysis.severity === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-200' :
              'bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-200'}
          `}>
            <span className="font-semibold uppercase text-xs tracking-wider">System Health</span>
            <span className="font-bold capitalize">{analysis.severity}</span>
          </div>

          <div>
            <h3 className="text-sm uppercase tracking-wider text-slate-500 font-semibold mb-2">Summary</h3>
            <p className="text-slate-700 dark:text-slate-200 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-200 dark:border-slate-800">
              {analysis.summary}
            </p>
          </div>

          <div>
            <h3 className="text-sm uppercase tracking-wider text-slate-500 font-semibold mb-2">Recommendations</h3>
            <ul className="space-y-2">
              {analysis.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/30 p-3 rounded border border-slate-200 dark:border-slate-800/50">
                  <span className="bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300 text-sm">{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={handleAnalyze}
            className="w-full py-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-sm border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
          >
            Refresh Analysis
          </button>
        </div>
      )}
    </div>
  );
};