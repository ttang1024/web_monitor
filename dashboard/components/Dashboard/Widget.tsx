import React, { useMemo } from 'react';
import { WidgetConfig, ChartType, MetricType, TimeRange, Environment, CustomTimeRange } from '../../types';
import { SimpleLineChart, SimpleAreaChart, SimpleBarChart, SimplePieChart } from '../charts/BaseCharts';
import { Icons } from '../ui/Icons';
import { generateTimeSeriesData, generateDistributionData, generateRouteData, MOCK_COLORS } from '../../constants';

interface WidgetProps {
  config: WidgetConfig;
  isEditMode: boolean;
  appId: string;
  timeRange: TimeRange;
  environment: Environment;
  customTimeRange?: CustomTimeRange;
  onRemove: (id: string) => void;
  onResize: (id: string, action: 'expand' | 'shrink') => void;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  isDragging?: boolean;
  theme?: 'light' | 'dark';
}

export const Widget: React.FC<WidgetProps> = ({ 
  config, 
  isEditMode, 
  appId, 
  timeRange,
  environment,
  customTimeRange,
  onRemove, 
  onResize, 
  onDragStart, 
  onDragEnter, 
  onDragEnd,
  isDragging,
  theme = 'dark'
}) => {
  // Generate mock data based on metric type AND appId to simulate different data per app
  const data = useMemo(() => {
    // Create a pseudo-random multiplier based on appId characters
    const multiplier = 0.5 + (appId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 10) / 10;
    
    switch (config.type) {
      case ChartType.Pie:
        return generateDistributionData();
      case ChartType.Bar:
        return generateRouteData();
      default:
        // Simulate different volatility based on metric and app
        const base = (config.metric === MetricType.ErrorRate ? 2 : 200);
        const vol = (config.metric === MetricType.ErrorRate ? 5 : 50);
        // Pass customTimeRange to generator
        return generateTimeSeriesData(20, base, vol, multiplier, timeRange, environment, customTimeRange);
    }
  }, [config.metric, config.type, appId, timeRange, environment, customTimeRange]);

  // Determine chart component
  const renderChart = () => {
    const color = config.metric === MetricType.ErrorRate || config.metric === MetricType.ApiFailure 
      ? MOCK_COLORS.danger 
      : MOCK_COLORS.primary;

    switch (config.type) {
      case ChartType.Line:
        return <SimpleLineChart data={data} color={color} theme={theme} />;
      case ChartType.Area:
        return <SimpleAreaChart data={data} color={color} theme={theme} />;
      case ChartType.Bar:
        return <SimpleBarChart data={data} color={color} theme={theme} />;
      case ChartType.Pie:
        return <SimplePieChart data={data} theme={theme} />;
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
          {config.metric === MetricType.ErrorRate && (
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
