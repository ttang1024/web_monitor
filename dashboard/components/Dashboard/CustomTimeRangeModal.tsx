import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../ui/Icons';
import { CustomTimeRange } from '../../types';

interface CustomTimeRangePickerProps {
  onClose: () => void;
  onApply: (range: CustomTimeRange) => void;
  initialRange?: CustomTimeRange;
}

export const CustomTimeRangePicker: React.FC<CustomTimeRangePickerProps> = ({ onClose, onApply, initialRange }) => {
  const [start, setStart] = useState(initialRange?.start || '');
  const [end, setEnd] = useState(initialRange?.end || '');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Use type assertion for the target
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    // Add event listener with a small delay to prevent immediate closing if the button click triggered this
    const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
    }, 10);

    return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!start || !end) {
      setError("Select start and end times");
      return;
    }

    if (new Date(start) >= new Date(end)) {
      setError("Invalid range");
      return;
    }

    onApply({ start, end });
  };

  return (
    <div ref={ref} className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-4 animate-fade-in origin-top-right">
      <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Icons.Calendar size={14} className="text-primary-500" />
            Custom Range
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <Icons.X size={14} />
          </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Start Time</label>
            <input 
              type="datetime-local" 
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-2 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              step="1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">End Time</label>
            <input 
              type="datetime-local" 
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-2 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              step="1"
            />
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-500 flex items-center gap-1 bg-red-50 dark:bg-red-900/20 p-1.5 rounded">
            <Icons.AlertTriangle size={10} />
            {error}
          </div>
        )}

        <button 
          type="submit"
          className="w-full py-1.5 rounded bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors text-xs shadow-sm shadow-primary-900/20"
        >
          Apply Range
        </button>
      </form>
    </div>
  );
};