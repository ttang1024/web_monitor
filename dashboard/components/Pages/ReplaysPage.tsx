import React from 'react';
import { Icons } from '../ui/Icons';
import { MOCK_REPLAYS } from '../../constants';

interface ReplaysPageProps {
  theme?: 'light' | 'dark';
}

export const ReplaysPage: React.FC<ReplaysPageProps> = () => {
  return (
    <div className="space-y-6">
       <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Session Replays</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Watch real user sessions to reproduce bugs.</p>
        </div>
         <div className="relative flex-1 sm:w-64">
            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Filter by email or ID..." 
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md py-2 pl-9 pr-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-primary-500"
            />
          </div>
      </div>

      <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
        <Icons.AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>
          <strong>Sample data.</strong> The SDK does not record session replays yet, so these rows are placeholders —
          every other page shows live data from your own events.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {MOCK_REPLAYS.map((replay) => (
          <div key={replay.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-6 hover:border-slate-300 dark:hover:border-slate-700 transition-all group shadow-sm">
            
            {/* User Info */}
            <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 border border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-xs">
                {replay.userEmail.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-200 truncate">{replay.userEmail}</h3>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-mono">
                    {replay.id}
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                   <span className="flex items-center gap-1"><Icons.Globe size={12}/> {replay.platform}</span>
                   <span className="flex items-center gap-1"><Icons.Clock size={12}/> {replay.timestamp}</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-8 text-sm w-full sm:w-auto justify-between sm:justify-end">
              <div className="text-center">
                <div className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider mb-1">Duration</div>
                <div className="font-mono text-slate-700 dark:text-slate-200">{replay.duration}</div>
              </div>
              <div className="text-center">
                <div className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider mb-1">Events</div>
                <div className="font-mono text-slate-700 dark:text-slate-200">{replay.eventCount}</div>
              </div>
               <div className="text-center">
                <div className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider mb-1">Errors</div>
                <div className={`font-mono font-bold ${replay.errorCount > 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-500'}`}>
                  {replay.errorCount}
                </div>
              </div>
            </div>

            {/* Action */}
            <button className="hidden sm:flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-lg shadow-primary-900/20">
              <Icons.Zap size={16} fill="currentColor" />
              Play
            </button>
            
            {/* Mobile Play Button */}
            <button className="sm:hidden w-full bg-primary-600 text-white py-2 rounded font-medium flex items-center justify-center gap-2">
               <Icons.Zap size={16} fill="currentColor" /> Play Session
            </button>

          </div>
        ))}
      </div>
    </div>
  );
};