import React, { useMemo, useState } from 'react';
import { Icons } from '../ui/Icons';
import { SimpleLineChart, SparkLineChart } from '../charts/BaseCharts';
import { CHART_COLORS } from '../../constants';
import { TimeRange } from '../../types';
import { useApi } from '../../hooks/useApi';
import {
  DateRange,
  ErrorLog,
  ErrorStatus,
  errorStatusCounts,
  errorTimeSeries,
  listErrors,
  updateErrorStatus,
} from '../../services/api';
import { formatRelative, trendHoursFor } from '../../services/timeRange';

// Helper component for rendering a single line of the stack trace
const StackTraceLine: React.FC<{ line: string; index: number }> = ({ line, index }) => {
  const isErrorHeader = index === 0 && !line.trim().startsWith('at');

  // Render the error message header (e.g., "TypeError: ...")
  if (isErrorHeader) {
    return <span className="text-red-500 dark:text-red-400 font-bold">{line}</span>;
  }

  // Regex to parse standard V8 stack traces: "at FunctionName (File:Line:Col)"
  const frameParts = line.match(/^\s*at\s+(.+?)\s+\((.+)\)$/);

  // If it matches a stack frame with a function name
  if (frameParts) {
    const [, functionName, location] = frameParts;
    return (
      <span>
        <span className="text-slate-500">at </span>
        <span className="text-primary-600 dark:text-primary-400 font-medium">{functionName}</span>
        <span className="text-slate-600"> (</span>
        <span className="text-slate-500 dark:text-slate-400 underline decoration-slate-400 dark:decoration-slate-700 decoration-dotted underline-offset-2 hover:text-primary-600 dark:hover:text-primary-300 cursor-pointer transition-colors" title={`Open ${location}`}>
          {location}
        </span>
        <span className="text-slate-600">)</span>
      </span>
    );
  }

  // Regex for stack frames without function names: "at File:Line:Col"
  const fileMatch = line.match(/^\s*at\s+(.+)$/);
  if (fileMatch) {
    return (
      <span>
        <span className="text-slate-500">at </span>
        <span className="text-slate-500 dark:text-slate-400">{fileMatch[1]}</span>
      </span>
    );
  }

  // Fallback for any other lines
  return <span className="text-slate-500 dark:text-slate-400">{line}</span>;
};

const TABS: { label: string; status: ErrorStatus; countKey: 'unresolved' | 'regressed' | 'resolved' | 'ignored' }[] = [
  { label: 'Unresolved', status: 'Unresolved', countKey: 'unresolved' },
  { label: 'Regressed', status: 'Regressed', countKey: 'regressed' },
  { label: 'Resolved', status: 'Resolved', countKey: 'resolved' },
  { label: 'Ignored', status: 'Ignored', countKey: 'ignored' },
];

/** Browser/OS parsed from the reported user agent — the SDK doesn't send tags. */
function tagsFor(issue: ErrorLog): Record<string, string> {
  const ua = issue.userAgent ?? '';
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /chrome|crios/i.test(ua)
      ? 'Chrome'
      : /firefox|fxios/i.test(ua)
        ? 'Firefox'
        : /safari/i.test(ua)
          ? 'Safari'
          : 'Unknown';
  const os = /windows/i.test(ua)
    ? 'Windows'
    : /android/i.test(ua)
      ? 'Android'
      : /iphone|ipad|ipod/i.test(ua)
        ? 'iOS'
        : /mac os/i.test(ua)
          ? 'macOS'
          : /linux/i.test(ua)
            ? 'Linux'
            : 'Unknown';

  return {
    browser,
    os,
    url: issue.url,
    ...(issue.source ? { source: issue.source } : {}),
  };
}

interface IssueDetailProps {
  issue: ErrorLog;
  trendHours: number;
  onBack: () => void;
  onStatusChange: (id: string, status: ErrorStatus) => void;
  theme?: 'light' | 'dark';
}

const IssueDetailView: React.FC<IssueDetailProps> = ({ issue, trendHours, onBack, onStatusChange, theme }) => {
  const [isStackTraceExpanded, setIsStackTraceExpanded] = useState(true);
  const trend = useApi(() => errorTimeSeries(issue.errorHash, trendHours), [issue.errorHash, trendHours]);

  const graphData = useMemo(
    () =>
      (trend.data ?? []).map((point) => ({
        time: new Date(point.bucketStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: point.count,
      })),
    [trend.data]
  );

  const isResolved = issue.status === 'Resolved';
  const isIgnored = issue.status === 'Ignored';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          title="Back to Issues List"
        >
          <Icons.ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-red-500 dark:text-red-400 font-mono text-sm font-bold bg-red-100 dark:bg-red-900/20 px-2 py-0.5 rounded">{issue.type}</span>
              <span className="text-slate-500 font-mono text-sm">{issue.errorHash}</span>
              {isIgnored && (
                <span className="text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-xs uppercase font-bold tracking-wider">Ignored</span>
              )}
              {isResolved && (
                <span className="text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20 px-2 py-0.5 rounded text-xs uppercase font-bold tracking-wider">Resolved</span>
              )}
              {issue.status === 'Regressed' && (
                <span className="text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/20 px-2 py-0.5 rounded text-xs uppercase font-bold tracking-wider">Regressed</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate" title={issue.message}>{issue.message}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onStatusChange(issue.id, isResolved ? 'Unresolved' : 'Resolved')}
            className={`
              px-4 py-2 rounded-md font-medium text-sm transition-colors
              ${isResolved
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700'
                : 'bg-white dark:bg-white text-slate-900 dark:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-200'}
            `}
          >
            {isResolved ? 'Reopen Issue' : 'Resolve'}
          </button>

          <button
            onClick={() => onStatusChange(issue.id, isIgnored ? 'Unresolved' : 'Ignored')}
            className={`
               px-4 py-2 rounded-md font-medium text-sm transition-colors border
               ${isIgnored
                ? 'bg-primary-50 dark:bg-primary-600/10 border-primary-500 dark:border-primary-600 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-600/20'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'}
            `}
          >
            {isIgnored ? 'Stop Ignoring' : 'Ignore'}
          </button>
        </div>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
            <div className="text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold mb-1 flex items-center gap-2">
              <Icons.Zap size={12} /> Occurrences
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{issue.occurrenceCount.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
            <div className="text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold mb-1 flex items-center gap-2">
              <Icons.Globe size={12} /> Page
            </div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate" title={issue.url}>{issue.url}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
            <div className="text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold mb-1 flex items-center gap-2">
              <Icons.Clock size={12} /> First Seen
            </div>
            <div className="text-lg font-medium text-slate-700 dark:text-slate-200">{formatRelative(issue.createdAt)}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
            <div className="text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold mb-1 flex items-center gap-2">
              <Icons.Activity size={12} /> Last Seen
            </div>
            <div className="text-lg font-medium text-slate-700 dark:text-slate-200">{formatRelative(issue.lastSeenAt)}</div>
          </div>
      </div>

      {/* Frequency Chart */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-lg h-64 flex flex-col shadow-sm">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
            <Icons.BarChart size={16} />
            Event Frequency (last {trendHours}h, hourly)
          </h3>
          <div className="flex-1 w-full min-h-0">
            {trend.loading && !trend.data ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading trend…</div>
            ) : (
              <SimpleLineChart data={graphData} color={CHART_COLORS.danger} theme={theme} />
            )}
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column: Stack Trace */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm transition-all duration-300">
              <button
                onClick={() => setIsStackTraceExpanded(!isStackTraceExpanded)}
                className="w-full bg-slate-50 dark:bg-slate-850 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none"
              >
                <div className="flex items-center gap-2">
                    <Icons.ChevronDown
                      size={16}
                      className={`text-slate-400 transition-transform duration-200 ${isStackTraceExpanded ? '' : '-rotate-90'}`}
                    />
                    <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Stack Trace</h3>
                </div>
                {issue.lineNumber !== null && (
                  <span className="text-xs bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 font-mono">
                    line {issue.lineNumber}{issue.columnNumber !== null ? `:${issue.columnNumber}` : ''}
                  </span>
                )}
              </button>

              {isStackTraceExpanded && (
                <div className="bg-slate-50 dark:bg-[#0d1117] overflow-x-auto font-mono text-xs md:text-sm border-t border-slate-200 dark:border-slate-800">
                  {issue.stackTrace ? (
                    issue.stackTrace.split('\n').map((line, i) => (
                      <div key={i} className="flex hover:bg-slate-100 dark:hover:bg-slate-800/50 group transition-colors">
                        <div className="w-12 text-right pr-4 py-1.5 text-slate-400 dark:text-slate-600 select-none border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 group-hover:bg-slate-200 dark:group-hover:bg-slate-800/50">
                            {i + 1}
                        </div>
                        <div className="flex-1 py-1.5 px-4 whitespace-pre break-all">
                          <StackTraceLine line={line} index={i} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-slate-500 text-sm font-sans">
                      No stack trace was captured for this error.
                    </div>
                  )}
                </div>
              )}
          </div>

          {issue.metadata && Object.keys(issue.metadata).length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-slate-50 dark:bg-slate-850 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Metadata</h3>
              </div>
              <pre className="p-4 text-xs font-mono overflow-x-auto text-slate-700 dark:text-slate-300">
                {JSON.stringify(issue.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Right Sidebar: Tags */}
        <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-slate-50 dark:bg-slate-850 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Tags</h3>
              </div>
              <div className="p-4 space-y-4">
                  {Object.entries(tagsFor(issue)).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-xs uppercase font-semibold text-slate-500 mb-1">{key}</span>
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate font-mono" title={value}>{value}</span>
                    </div>
                  ))}
              </div>
            </div>
        </div>
      </div>
    </div>
  );
};

interface IssuesPageProps {
  timeRange: TimeRange;
  range: DateRange;
  theme?: 'light' | 'dark';
}

export const IssuesPage: React.FC<IssuesPageProps> = ({ timeRange, range, theme = 'dark' }) => {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ErrorStatus>('Unresolved');
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');

  const [showSettings, setShowSettings] = useState(false);
  const [viewSettings, setViewSettings] = useState({ showGraph: true, compactMode: false });

  const trendHours = trendHoursFor(timeRange);

  const issues = useApi(
    () => listErrors({ page: 1, pageSize: 50, status: activeTab, search: search || undefined, startDate: range.startDate }),
    [activeTab, search, range.startDate]
  );
  const counts = useApi(() => errorStatusCounts(), [issues.data]);

  const selectedIssue = issues.data?.data.find((issue) => issue.id === selectedIssueId);

  const handleStatusChange = async (id: string, status: ErrorStatus) => {
    await updateErrorStatus(id, status);
    setSelectedIssueId(null);
    issues.refetch();
    counts.refetch();
  };

  if (selectedIssueId && selectedIssue) {
    return (
      <IssueDetailView
        issue={selectedIssue}
        trendHours={trendHours}
        onBack={() => setSelectedIssueId(null)}
        onStatusChange={handleStatusChange}
        theme={theme}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Issues</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Errors grouped by signature, newest activity first.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto relative">
          <form
            className="relative flex-1 sm:w-64"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(pendingSearch.trim());
            }}
          >
            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder="Search messages…"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md py-2 pl-9 pr-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-primary-500"
            />
          </form>
          <button
            onClick={issues.refetch}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh"
          >
            <Icons.Refresh size={18} className={issues.loading ? 'animate-spin' : ''} />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`
                bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors
                ${showSettings ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700' : ''}
              `}
            >
              <Icons.Settings size={18} />
            </button>

            {showSettings && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSettings(false)}></div>
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl z-20 py-1 overflow-hidden animate-fade-in">
                  <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
                     <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">View Settings</span>
                  </div>
                  <label className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                     <span className="text-sm text-slate-700 dark:text-slate-300">Show Graph</span>
                     <div
                        className={`w-9 h-5 rounded-full relative transition-colors ${viewSettings.showGraph ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                        onClick={() => setViewSettings(s => ({ ...s, showGraph: !s.showGraph }))}
                     >
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${viewSettings.showGraph ? 'translate-x-4' : 'translate-x-0'}`}></div>
                     </div>
                  </label>
                   <label className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                     <span className="text-sm text-slate-700 dark:text-slate-300">Compact Mode</span>
                     <div
                        className={`w-9 h-5 rounded-full relative transition-colors ${viewSettings.compactMode ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                        onClick={() => setViewSettings(s => ({ ...s, compactMode: !s.compactMode }))}
                     >
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${viewSettings.compactMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                     </div>
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-800 pb-0">
          <div className="flex items-center gap-6">
            {TABS.map((tab) => (
            <button
                key={tab.status}
                onClick={() => setActiveTab(tab.status)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.status ? 'border-primary-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
                {tab.label}
                <span className={`ml-2 text-xs py-0.5 px-1.5 rounded-full ${activeTab === tab.status ? 'bg-slate-100 dark:bg-slate-800 text-primary-600 dark:text-primary-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                {counts.data ? counts.data[tab.countKey] : '—'}
                </span>
            </button>
            ))}
          </div>

          {search && (
            <div className="flex flex-wrap items-center gap-2 pb-3">
                <span className="text-xs text-slate-500 font-semibold uppercase mr-1">Search:</span>
                <button
                    onClick={() => { setSearch(''); setPendingSearch(''); }}
                    className="flex items-center gap-1.5 px-2 py-1 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-500/30 text-primary-700 dark:text-primary-300 rounded text-xs hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors group"
                >
                    <span className="font-mono">{search}</span>
                    <Icons.X size={12} className="group-hover:text-slate-900 dark:group-hover:text-white" />
                </button>
            </div>
          )}
      </div>

      {issues.error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icons.AlertTriangle size={16} />
          <span>{issues.error}</span>
          <button onClick={issues.refetch} className="ml-auto underline">Retry</button>
        </div>
      )}

      {/* Issues List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden min-h-[400px]">
        <div className="grid grid-cols-12 gap-4 p-3 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          <div className="col-span-6">Issue</div>
          {!viewSettings.compactMode && <div className="col-span-2 text-right">Trend ({trendHours}h)</div>}
          <div className={`${viewSettings.compactMode ? 'col-span-3' : 'col-span-2'} text-right`}>Events</div>
          <div className="col-span-2 text-right">Last Seen</div>
        </div>

        {issues.loading && !issues.data ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Icons.Refresh className="animate-spin mb-3" size={28} />
            Loading issues…
          </div>
        ) : (issues.data?.data.length ?? 0) === 0 ? (
           <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Icons.CheckCircle size={48} className="mb-4 text-slate-300 dark:text-slate-700" />
              <p className="font-medium">No {activeTab.toLowerCase()} issues in this window</p>
              <p className="text-sm mt-1">Errors reported by the SDK show up here within a few seconds.</p>
           </div>
        ) : (
          issues.data!.data.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              trendHours={trendHours}
              compact={viewSettings.compactMode}
              showGraph={viewSettings.showGraph}
              theme={theme}
              onSelect={() => setSelectedIssueId(issue.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

interface IssueRowProps {
  issue: ErrorLog;
  trendHours: number;
  compact: boolean;
  showGraph: boolean;
  theme?: 'light' | 'dark';
  onSelect: () => void;
}

const IssueRow: React.FC<IssueRowProps> = ({ issue, trendHours, compact, showGraph, theme, onSelect }) => {
  // Sparklines are fetched per row and only when they're actually visible.
  const trend = useApi(
    () => (showGraph && !compact ? errorTimeSeries(issue.errorHash, trendHours) : Promise.resolve([])),
    [issue.errorHash, trendHours, showGraph, compact]
  );

  const graphData = (trend.data ?? []).map((point) => ({
    time: new Date(point.bucketStart).toLocaleTimeString([], { hour: '2-digit' }),
    value: point.count,
  }));

  return (
    <div
      onClick={onSelect}
      className={`
        grid grid-cols-12 gap-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors items-center group cursor-pointer
        ${compact ? 'p-2' : 'p-4'}
      `}
    >
      <div className="col-span-6 flex items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-red-500 dark:text-red-400 font-mono text-xs font-bold bg-red-100 dark:bg-red-900/20 px-1.5 py-0.5 rounded">{issue.type}</span>
            <span className="text-slate-500 text-xs font-mono">{issue.errorHash}</span>
          </div>
          <h3 className="text-sm text-slate-700 dark:text-slate-200 font-medium truncate pr-4 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{issue.message}</h3>
          {!compact && (
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full
                ${issue.status === 'Unresolved' ? 'bg-red-500' :
                  issue.status === 'Resolved' ? 'bg-green-500' :
                  issue.status === 'Ignored' ? 'bg-slate-500' : 'bg-orange-500'}
              `}></span>
              <span>{issue.status}</span>
              <span className="truncate">· {issue.url}</span>
            </div>
          )}
        </div>
      </div>

      {!compact && (
        <div className="col-span-2 h-8">
          {showGraph && graphData.length > 0 && <SparkLineChart data={graphData} color={CHART_COLORS.danger} theme={theme} />}
        </div>
      )}

      <div className={`${compact ? 'col-span-3' : 'col-span-2'} text-right text-sm text-slate-600 dark:text-slate-300 font-mono`}>
        {issue.occurrenceCount.toLocaleString()}
      </div>

      <div className="col-span-2 text-right text-sm text-slate-500 dark:text-slate-400 flex items-center justify-end gap-2">
        {formatRelative(issue.lastSeenAt)}
        <Icons.Clock size={14} />
      </div>
    </div>
  );
};
