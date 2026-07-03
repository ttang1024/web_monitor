import React, { useState, useEffect } from 'react';
import { Icons } from '../ui/Icons';
import { MOCK_ISSUES } from '../../constants';
import { SimpleLineChart, SparkLineChart } from '../charts/BaseCharts';
import { MOCK_COLORS } from '../../constants';
import { Issue, IssueStatus, Environment } from '../../types';

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

// Sub-component for the detailed view
interface IssueDetailProps {
  issue: Issue;
  onBack: () => void;
  onStatusChange: (id: string, status: IssueStatus) => void;
  onFilterTag: (key: string, value: string) => void;
  theme?: 'light' | 'dark';
}

const IssueDetailView: React.FC<IssueDetailProps> = ({ issue, onBack, onStatusChange, onFilterTag, theme }) => {
  const [isStackTraceExpanded, setIsStackTraceExpanded] = useState(true);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(true);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Navigation */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          title="Back to Issues List"
        >
          <Icons.Move size={20} className="rotate-180" />
        </button>
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-red-500 dark:text-red-400 font-mono text-sm font-bold bg-red-100 dark:bg-red-900/20 px-2 py-0.5 rounded">{issue.type}</span>
              <span className="text-slate-500 font-mono text-sm">{issue.id}</span>
              {issue.status === 'ignored' && (
                <span className="text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-xs uppercase font-bold tracking-wider">Ignored</span>
              )}
               {issue.status === 'resolved' && (
                <span className="text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20 px-2 py-0.5 rounded text-xs uppercase font-bold tracking-wider">Resolved</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate" title={issue.message}>{issue.message}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onStatusChange(issue.id, issue.status === 'resolved' ? 'unresolved' : 'resolved')}
            className={`
              px-4 py-2 rounded-md font-medium text-sm transition-colors
              ${issue.status === 'resolved' 
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700' 
                : 'bg-white dark:bg-white text-slate-900 dark:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-200'}
            `}
          >
            {issue.status === 'resolved' ? 'Reopen Issue' : 'Resolve'}
          </button>
          
          <button 
            onClick={() => onStatusChange(issue.id, issue.status === 'ignored' ? 'unresolved' : 'ignored')}
            className={`
               px-4 py-2 rounded-md font-medium text-sm transition-colors border
               ${issue.status === 'ignored'
                ? 'bg-primary-50 dark:bg-primary-600/10 border-primary-500 dark:border-primary-600 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-600/20'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'}
            `}
          >
            {issue.status === 'ignored' ? 'Stop Ignoring' : 'Ignore'}
          </button>
        </div>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
            <div className="text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold mb-1 flex items-center gap-2">
              <Icons.Zap size={12} /> Total Events
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{issue.events.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
            <div className="text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold mb-1 flex items-center gap-2">
              <Icons.Globe size={12} /> Users Affected
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{issue.users.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
            <div className="text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold mb-1 flex items-center gap-2">
              <Icons.Clock size={12} /> First Seen
            </div>
            <div className="text-lg font-medium text-slate-700 dark:text-slate-200">{issue.firstSeen}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
            <div className="text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold mb-1 flex items-center gap-2">
              <Icons.Activity size={12} /> Last Seen
            </div>
            <div className="text-lg font-medium text-slate-700 dark:text-slate-200">{issue.lastSeen}</div>
          </div>
      </div>

      {/* Frequency Chart */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-lg h-64 flex flex-col shadow-sm">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
            <Icons.BarChart size={16} />
            Event Frequency (Last 24h)
          </h3>
          <div className="flex-1 w-full min-h-0">
            <SimpleLineChart data={issue.graphData} color={MOCK_COLORS.danger} theme={theme} />
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column: Stack Trace & Breadcrumbs */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Stack Trace Section */}
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
                <div className="flex gap-2">
                    <span className="text-xs bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">App Only</span>
                    <span className="text-xs bg-primary-50 dark:bg-primary-600/20 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-500/30 px-2 py-1 rounded">Full Trace</span>
                </div>
              </button>

              {isStackTraceExpanded && (
                <div className="bg-slate-50 dark:bg-[#0d1117] overflow-x-auto font-mono text-xs md:text-sm border-t border-slate-200 dark:border-slate-800">
                  {issue.stackTrace.split('\n').map((line, i) => (
                    <div key={i} className="flex hover:bg-slate-100 dark:hover:bg-slate-800/50 group transition-colors">
                      {/* Line Number Gutter */}
                      <div className="w-12 text-right pr-4 py-1.5 text-slate-400 dark:text-slate-600 select-none border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 group-hover:bg-slate-200 dark:group-hover:bg-slate-800/50">
                          {i + 1}
                      </div>
                      {/* Code Content */}
                      <div className="flex-1 py-1.5 px-4 whitespace-pre break-all">
                        <StackTraceLine line={line} index={i} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* Breadcrumbs / Timeline Section */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
              <button 
                 onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
                 className="w-full bg-slate-50 dark:bg-slate-850 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <Icons.ChevronDown 
                      size={16} 
                      className={`text-slate-400 transition-transform duration-200 ${isTimelineExpanded ? '' : '-rotate-90'}`} 
                    />
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Timeline / Breadcrumbs</h3>
                </div>
              </button>
              
              {isTimelineExpanded && (
                <div className="p-6 bg-slate-50/50 dark:bg-slate-900/50">
                  {issue.breadcrumbs.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">No breadcrumbs recorded for this event.</div>
                  ) : (
                    <div className="relative pl-2 space-y-0 before:content-[''] before:absolute before:left-[27px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                      {issue.breadcrumbs.map((crumb, idx) => (
                        <div key={idx} className="relative flex items-start gap-6 pb-6 last:pb-0 group">
                          {/* Timeline Icon */}
                          <div className={`
                            relative z-10 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-slate-50 dark:ring-slate-900
                            ${crumb.level === 'error' ? 'bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-500/50' : 
                              crumb.level === 'warning' ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/50' : 
                              'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700'}
                          `}>
                             {crumb.category === 'nav' ? <Icons.Globe size={12} /> :
                              crumb.category === 'xhr' ? <Icons.Activity size={12} /> :
                              crumb.category === 'click' ? <Icons.Move size={12} /> :
                              <Icons.Zap size={12} />}
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0 bg-white dark:bg-slate-800/50 p-3 rounded border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{crumb.category}</span>
                                  {crumb.level === 'error' && <span className="text-[10px] bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-200 px-1 rounded">ERROR</span>}
                                </div>
                                <span className="font-mono text-xs text-slate-500">{crumb.timestamp}</span>
                              </div>
                              <p className={`text-sm ${crumb.level === 'error' ? 'text-red-600 dark:text-red-300' : 'text-slate-700 dark:text-slate-300'}`}>
                                {crumb.message}
                              </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>

        {/* Right Sidebar: Tags & AI */}
        <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-slate-50 dark:bg-slate-850 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Tags</h3>
              </div>
              <div className="p-4 space-y-4">
                  {Object.entries(issue.tags).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-xs uppercase font-semibold text-slate-500 mb-1">{key}</span>
                      <button 
                        onClick={() => onFilterTag(key, value)}
                        className="flex items-center justify-between group w-full text-left hover:bg-slate-100 dark:hover:bg-slate-800 p-1 -mx-1 rounded transition-colors"
                        title={`Filter issues by ${key}: ${value}`}
                      >
                          <span className="text-sm text-slate-700 dark:text-slate-200 truncate font-mono">{value}</span>
                          <div className="flex items-center gap-2">
                            <Icons.Search size={12} className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="h-1.5 w-[60px] bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-primary-500 w-[85%]"></div>
                            </div>
                          </div>
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/20 dark:to-slate-900 border border-primary-200 dark:border-primary-900/50 rounded-lg p-4 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-2 opacity-10">
                 <Icons.AI size={64} className="text-primary-900 dark:text-white" />
               </div>
              <h3 className="text-primary-600 dark:text-primary-400 font-semibold text-sm mb-3 flex items-center gap-2">
                  <Icons.AI size={16} />
                  AI Root Cause Analysis
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
                  This error appears to be correlated with the latest <code>v2.4.1</code> release on Windows environments. The stack trace suggests a null pointer exception in the payment rendering logic.
              </p>
              <button className="text-xs bg-primary-100 dark:bg-primary-600/20 hover:bg-primary-200 dark:hover:bg-primary-600/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-500/30 px-3 py-1.5 rounded transition-colors">
                View Similar Issues
              </button>
            </div>
        </div>
      </div>
    </div>
  );
};

interface IssuesPageProps {
  environment?: Environment;
  theme?: 'light' | 'dark';
}

export const IssuesPage: React.FC<IssuesPageProps> = ({ environment = 'production', theme = 'dark' }) => {
  const [issues, setIssues] = useState(MOCK_ISSUES);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'Unresolved' | 'For Review' | 'Regressed' | 'Ignored'>('Unresolved');
  const [tagFilters, setTagFilters] = useState<Record<string, string>>({});
  
  // Settings Menu State
  const [showSettings, setShowSettings] = useState(false);
  const [viewSettings, setViewSettings] = useState({
    showGraph: true,
    compactMode: false
  });

  // Scale issue counts based on environment
  useEffect(() => {
    // 1.0 for prod, 0.3 for staging, 0.05 for dev
    const factor = environment === 'production' ? 1 : environment === 'staging' ? 0.3 : 0.05;
    
    const scaledIssues = MOCK_ISSUES.map(issue => ({
      ...issue,
      events: Math.max(1, Math.round(issue.events * factor)),
      users: Math.max(1, Math.round(issue.users * factor)),
      // Scale graph values as well
      graphData: issue.graphData.map(p => ({
        ...p,
        value: Math.max(0, Math.round(p.value * factor))
      }))
    }));
    setIssues(scaledIssues);
  }, [environment]);

  const selectedIssue = issues.find(i => i.id === selectedIssueId);

  // Status Change Handler
  const handleStatusChange = (id: string, newStatus: IssueStatus) => {
    setIssues(prev => prev.map(issue => 
      issue.id === id ? { ...issue, status: newStatus } : issue
    ));
  };

  const handleTagFilter = (key: string, value: string) => {
    setTagFilters(prev => ({ ...prev, [key]: value }));
    setSelectedIssueId(null);
  };

  const removeTagFilter = (key: string) => {
    setTagFilters(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Filter Logic
  const filteredIssues = issues.filter(issue => {
    // 1. Status Filter
    let statusMatch = false;
    switch (activeTab) {
      case 'Unresolved':
        statusMatch = issue.status === 'unresolved';
        break;
      case 'For Review':
        statusMatch = issue.status === 'review';
        break;
      case 'Regressed':
        statusMatch = issue.status === 'regressed';
        break;
      case 'Ignored':
        statusMatch = issue.status === 'ignored';
        break;
      default:
        statusMatch = true;
    }

    if (!statusMatch) return false;

    // 2. Tag Filters
    if (Object.keys(tagFilters).length > 0) {
        for (const [key, value] of Object.entries(tagFilters)) {
            if (issue.tags[key as keyof typeof issue.tags] !== value) {
                return false;
            }
        }
    }

    return true;
  });

  // If an issue is selected, render the detail view
  if (selectedIssueId && selectedIssue) {
    return (
      <IssueDetailView 
        issue={selectedIssue} 
        onBack={() => setSelectedIssueId(null)}
        onStatusChange={handleStatusChange}
        onFilterTag={handleTagFilter}
        theme={theme}
      />
    );
  }

  // Otherwise, render the list view
  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Issues</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Real-time error tracking and exception grouping.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto relative">
          <div className="relative flex-1 sm:w-64">
            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Search issues..." 
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md py-2 pl-9 pr-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-primary-500"
            />
          </div>
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
                {/* Backdrop to close menu */}
                <div className="fixed inset-0 z-10" onClick={() => setShowSettings(false)}></div>
                
                {/* Menu Dropdown */}
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
            {['Unresolved', 'For Review', 'Regressed', 'Ignored'].map((tab) => (
            <button 
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-primary-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
                {tab}
                <span className={`ml-2 text-xs py-0.5 px-1.5 rounded-full ${activeTab === tab ? 'bg-slate-100 dark:bg-slate-800 text-primary-600 dark:text-primary-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                {issues.filter(i => {
                    if (tab === 'Unresolved') return i.status === 'unresolved';
                    if (tab === 'For Review') return i.status === 'review';
                    if (tab === 'Regressed') return i.status === 'regressed';
                    if (tab === 'Ignored') return i.status === 'ignored';
                    return false;
                }).length}
                </span>
            </button>
            ))}
          </div>

          {/* Active Filters Display */}
          {Object.keys(tagFilters).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pb-3">
                <span className="text-xs text-slate-500 font-semibold uppercase mr-1">Filters:</span>
                {Object.entries(tagFilters).map(([key, value]) => (
                    <button 
                        key={key}
                        onClick={() => removeTagFilter(key)}
                        className="flex items-center gap-1.5 px-2 py-1 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-500/30 text-primary-700 dark:text-primary-300 rounded text-xs hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors group"
                    >
                        <span className="opacity-70 capitalize">{key}:</span>
                        <span className="font-mono">{value}</span>
                        <Icons.X size={12} className="group-hover:text-slate-900 dark:group-hover:text-white" />
                    </button>
                ))}
                <button 
                    onClick={() => setTagFilters({})}
                    className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white underline decoration-slate-400 dark:decoration-slate-700 underline-offset-2 ml-2"
                >
                    Clear all
                </button>
            </div>
          )}
      </div>

      {/* Issues List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden min-h-[400px]">
        <div className="grid grid-cols-12 gap-4 p-3 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          <div className="col-span-6">Issue</div>
          {!viewSettings.compactMode && <div className="col-span-2 text-right">Trend (24h)</div>}
          <div className={`${viewSettings.compactMode ? 'col-span-2' : 'col-span-1'} text-right`}>Events</div>
          <div className={`${viewSettings.compactMode ? 'col-span-2' : 'col-span-1'} text-right`}>Users</div>
          <div className="col-span-2 text-right">Last Seen</div>
        </div>

        {filteredIssues.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Icons.CheckCircle size={48} className="mb-4 text-slate-300 dark:text-slate-700" />
              <p className="font-medium">No issues match current filters</p>
              <button onClick={() => setTagFilters({})} className="text-sm text-primary-500 hover:text-primary-600 dark:hover:text-primary-300 mt-2">Clear all filters</button>
           </div>
        ) : (
          filteredIssues.map((issue) => (
            <div 
              key={issue.id} 
              onClick={() => setSelectedIssueId(issue.id)}
              className={`
                grid grid-cols-12 gap-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors items-center group cursor-pointer
                ${viewSettings.compactMode ? 'p-2' : 'p-4'}
              `}
            >
              
              <div className="col-span-6 flex items-start gap-3">
                {/* Removed Checkbox Input */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-red-500 dark:text-red-400 font-mono text-xs font-bold bg-red-100 dark:bg-red-900/20 px-1.5 py-0.5 rounded">{issue.type}</span>
                    <span className="text-slate-500 text-xs font-mono">{issue.id}</span>
                  </div>
                  <h3 className={`text-sm text-slate-700 dark:text-slate-200 font-medium truncate pr-4 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors ${viewSettings.compactMode ? 'max-w-[300px]' : ''}`}>{issue.message}</h3>
                  {!viewSettings.compactMode && (
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full 
                        ${issue.status === 'unresolved' ? 'bg-red-500' : 
                          issue.status === 'resolved' ? 'bg-green-500' :
                          issue.status === 'ignored' ? 'bg-slate-500' :
                          issue.status === 'regressed' ? 'bg-orange-500' : 'bg-blue-500'}
                      `}></span>
                      <span className="capitalize">{issue.status}</span>
                    </div>
                  )}
                </div>
              </div>

              {!viewSettings.compactMode && (
                <div className="col-span-2 h-8">
                  {viewSettings.showGraph && <SparkLineChart data={issue.graphData} color={MOCK_COLORS.danger} theme={theme} />}
                </div>
              )}

              <div className={`${viewSettings.compactMode ? 'col-span-2' : 'col-span-1'} text-right text-sm text-slate-600 dark:text-slate-300 font-mono`}>
                {issue.events.toLocaleString()}
              </div>

              <div className={`${viewSettings.compactMode ? 'col-span-2' : 'col-span-1'} text-right text-sm text-slate-600 dark:text-slate-300 font-mono`}>
                {issue.users.toLocaleString()}
              </div>

              <div className="col-span-2 text-right text-sm text-slate-500 dark:text-slate-400 flex items-center justify-end gap-2">
                {issue.lastSeen}
                <Icons.Clock size={14} />
              </div>

            </div>
          ))
        )}
      </div>
    </div>
  );
};