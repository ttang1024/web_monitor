import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './components/ui/Icons';
import { Widget } from './components/Dashboard/Widget';
import { AIAnalysisPanel } from './components/Dashboard/AIAnalysisPanel';
import { AddWidgetModal } from './components/Dashboard/AddWidgetModal';
import { CustomTimeRangePicker } from './components/Dashboard/CustomTimeRangeModal';
import { IssuesPage } from './components/Pages/IssuesPage';
import { PerformancePage } from './components/Pages/PerformancePage';
import { ReplaysPage } from './components/Pages/ReplaysPage';
import { OverviewPage } from './components/Pages/OverviewPage';
import { AuthPage } from './components/Pages/AuthPage';
import { DashboardState, WidgetConfig, TimeRange, Environment, ChartType, MetricType, Page, Application, CustomTimeRange } from './types';
import { INITIAL_WIDGETS, MOCK_SUMMARY_METRICS, MOCK_APPS } from './constants';

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  const [activePage, setActivePage] = useState<Page>('overview');
  
  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  // Dashboard specific state
  const [dashboardState, setDashboardState] = useState<DashboardState>({
    widgets: INITIAL_WIDGETS,
    timeRange: '24h',
    environment: 'production',
    isEditMode: false,
  });

  // Drag & Drop State
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);

  const [apps, setApps] = useState<Application[]>(MOCK_APPS);
  const [selectedApp, setSelectedApp] = useState<Application>(MOCK_APPS[0]);
  const [showAppMenu, setShowAppMenu] = useState(false);
  const [loadingApp, setLoadingApp] = useState(false);

  const [showAI, setShowAI] = useState(false);
  const [showAddWidgetModal, setShowAddWidgetModal] = useState(false);
  const [showCustomTimePicker, setShowCustomTimePicker] = useState(false);

  // Apply theme class to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAuthMode('login');
  };

  // --- Dashboard Handlers ---
  const toggleEditMode = () => setDashboardState(s => ({ ...s, isEditMode: !s.isEditMode }));

  const removeWidget = (id: string) => {
    setDashboardState(s => ({
      ...s,
      widgets: s.widgets.filter(w => w.id !== id)
    }));
  };

  // Drag Handlers
  const handleDragStart = (id: string) => {
    setDraggedWidgetId(id);
  };

  const handleDragEnter = (targetId: string) => {
    if (!draggedWidgetId || draggedWidgetId === targetId) return;

    setDashboardState(prev => {
      const newWidgets = [...prev.widgets];
      const draggedIndex = newWidgets.findIndex(w => w.id === draggedWidgetId);
      const targetIndex = newWidgets.findIndex(w => w.id === targetId);
      
      if (draggedIndex === -1 || targetIndex === -1) return prev;

      // Swap
      const [removed] = newWidgets.splice(draggedIndex, 1);
      newWidgets.splice(targetIndex, 0, removed);

      return { ...prev, widgets: newWidgets };
    });
  };

  const handleDragEnd = () => {
    setDraggedWidgetId(null);
  };

  const resizeWidget = (id: string, action: 'expand' | 'shrink') => {
    setDashboardState(prev => {
      const newWidgets = prev.widgets.map(w => {
        if (w.id !== id) return w;
        let newW = w.w;
        if (action === 'expand') newW = Math.min(newW + 1, 4); // Max 4 cols
        if (action === 'shrink') newW = Math.max(newW - 1, 1); // Min 1 col
        return { ...w, w: newW };
      });
      return { ...prev, widgets: newWidgets };
    });
  };

  const handleAddWidget = (config: { title: string; metric: MetricType; type: ChartType; w: number }) => {
    const newWidget: WidgetConfig = {
      id: Date.now().toString(),
      title: config.title,
      type: config.type,
      metric: config.metric,
      w: config.w,
      h: 1
    };
    setDashboardState(s => ({ ...s, widgets: [...s.widgets, newWidget] }));
    setShowAddWidgetModal(false);
  };

  const handleAppChange = (app: Application) => {
    if (app.id === selectedApp.id) return;
    setShowAppMenu(false);
    setLoadingApp(true);
    // Simulate network delay for switching app context
    setTimeout(() => {
        setSelectedApp(app);
        setLoadingApp(false);
    }, 600);
  };

  const handleSelectAppFromOverview = (app: Application) => {
    setSelectedApp(app);
    setActivePage('dashboard');
  };

  const handleCreateApp = (newAppData: { name: string; framework: Application['framework'] }) => {
    const newApp: Application = {
      id: `app-${Date.now()}`,
      name: newAppData.name,
      framework: newAppData.framework,
      health: 'healthy' // Default to healthy for new apps
    };
    setApps([...apps, newApp]);
  };

  const handleTimeRangeChange = (range: TimeRange) => {
    if (range === 'custom') {
      setShowCustomTimePicker(!showCustomTimePicker);
    } else {
      setDashboardState(s => ({ ...s, timeRange: range }));
      setShowCustomTimePicker(false);
    }
  };

  const handleCustomTimeApply = (range: CustomTimeRange) => {
    setDashboardState(s => ({ 
      ...s, 
      timeRange: 'custom',
      customTimeRange: range 
    }));
    setShowCustomTimePicker(false);
  };

  if (!isAuthenticated) {
    return (
      <>
        {/* Helper to toggle theme on auth page too */}
        <div className="fixed top-4 right-4 z-50">
           <button
             onClick={toggleTheme}
             className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 p-2 rounded-full transition-all"
          >
             {theme === 'dark' ? <Icons.Sun size={18} /> : <Icons.Moon size={18} />}
          </button>
        </div>
        <AuthPage 
          mode={authMode} 
          onAuth={() => setIsAuthenticated(true)} 
          onSwitchMode={setAuthMode} 
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans transition-colors duration-200">
      {/* Top Navigation */}
      <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between sticky top-0 z-40 shadow-sm transition-colors duration-200">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-primary-600 dark:text-primary-500 cursor-pointer" onClick={() => setActivePage('overview')}>
                <Icons.Activity size={24} strokeWidth={2.5} />
                <span className="text-slate-900 dark:text-white font-bold text-lg tracking-tight">ObsPro</span>
             </div>
             
             {/* Divider & App Selector - Hidden on Overview */}
             {activePage !== 'overview' && (
               <>
                 <div className="h-6 w-px bg-slate-200 dark:bg-slate-800"></div>

                 {/* App Selector */}
                 <div className="relative">
                    <button 
                        onClick={() => setShowAppMenu(!showAppMenu)}
                        className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded px-2 py-1.5 transition-colors group"
                    >
                        <div className="w-5 h-5 rounded bg-gradient-to-br from-primary-500 to-teal-500 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                            {selectedApp.name.substring(0,2)}
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white">{selectedApp.name}</span>
                        <Icons.ChevronDown size={14} className="text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                    </button>

                    {showAppMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowAppMenu(false)}></div>
                            <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl z-20 py-1 overflow-hidden animate-fade-in">
                                <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
                                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Select Application</span>
                                </div>
                                {apps.map(app => (
                                    <button
                                        key={app.id}
                                        onClick={() => handleAppChange(app)}
                                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between group ${selectedApp.id === app.id ? 'bg-slate-100 dark:bg-slate-800/50' : ''}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold uppercase transition-colors
                                                ${app.framework === 'next' ? 'bg-black text-white' : 
                                                  app.framework === 'react' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400' : 
                                                  'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
                                                }
                                            `}>
                                                {app.framework === 'next' ? 'N' : app.framework === 'react' ? 'R' : 'js'}
                                            </div>
                                            <div>
                                                <div className={`text-sm font-medium ${selectedApp.id === app.id ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>{app.name}</div>
                                                <div className="text-xs text-slate-500 capitalize">{app.framework} • {app.health}</div>
                                            </div>
                                        </div>
                                        {selectedApp.id === app.id && <Icons.Check size={16} className="text-primary-500" />}
                                    </button>
                                ))}
                                <div className="border-t border-slate-200 dark:border-slate-800 p-2">
                                    <button 
                                      onClick={() => { setShowAppMenu(false); setActivePage('overview'); }}
                                      className="w-full py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded flex items-center justify-center gap-2"
                                    >
                                        <Icons.Plus size={12} /> Create New App
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                 </div>
               </>
             )}
          </div>

          {/* Navigation - Hidden on Overview */}
          {activePage !== 'overview' && (
            <nav className="hidden md:flex items-center gap-1">
              {['Dashboard', 'Issues', 'Performance', 'Replays'].map((item) => {
                const pageKey = item.toLowerCase() as Page;
                const isActive = activePage === pageKey;
                return (
                  <button 
                    key={item} 
                    onClick={() => setActivePage(pageKey)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors 
                      ${isActive 
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50'}`}
                  >
                    {item}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-4">
          
          {/* Controls - Hidden on Overview */}
          {activePage !== 'overview' && (
            <>
              <div className="relative">
                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-md p-0.5 border border-slate-200 dark:border-slate-700">
                  {(['15m', '1h', '24h', '7d', 'custom'] as TimeRange[]).map(t => (
                    <button
                      key={t}
                      onClick={() => handleTimeRangeChange(t)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize
                        ${dashboardState.timeRange === t 
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      {t === 'custom' ? (
                         <span className="flex items-center gap-1">
                            <Icons.Calendar size={12} />
                            Custom
                         </span>
                      ) : t}
                    </button>
                  ))}
                </div>
                
                {/* Custom Time Range Display */}
                {dashboardState.timeRange === 'custom' && dashboardState.customTimeRange && (
                    <div className="absolute top-full right-0 mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                       {new Date(dashboardState.customTimeRange.start).toLocaleString([], {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'})} - {new Date(dashboardState.customTimeRange.end).toLocaleString([], {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                    </div>
                )}
                
                {/* Custom Picker Popover */}
                {showCustomTimePicker && (
                  <CustomTimeRangePicker 
                    onClose={() => setShowCustomTimePicker(false)}
                    onApply={handleCustomTimeApply}
                    initialRange={dashboardState.customTimeRange}
                  />
                )}
              </div>

              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800"></div>

              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${dashboardState.environment === 'production' ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                <select 
                  className="bg-transparent text-sm text-slate-600 dark:text-slate-300 font-medium focus:outline-none cursor-pointer"
                  value={dashboardState.environment}
                  onChange={(e) => setDashboardState(s => ({ ...s, environment: e.target.value as Environment }))}
                >
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Local/Dev</option>
                </select>
              </div>

               <button 
                className="ml-2 text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 p-2 rounded-full transition-all"
                onClick={() => setShowAI(true)}
                title="Ask AI"
              >
                <Icons.AI size={18} />
              </button>
            </>
          )}

          <button
             onClick={toggleTheme}
             className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 p-2 rounded-full transition-all"
             title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
             {theme === 'dark' ? <Icons.Sun size={18} /> : <Icons.Moon size={18} />}
          </button>
          
          <button
             onClick={handleLogout}
             className="text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 p-2 rounded-full transition-all"
             title="Log Out"
          >
             <Icons.LogOut size={18} />
          </button>

          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary-500 to-teal-500 border border-slate-200 dark:border-slate-700 ring-2 ring-slate-100 dark:ring-slate-900 cursor-pointer"></div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative">
        <div className="max-w-[1600px] mx-auto w-full">
          
          {activePage === 'overview' ? (
             <OverviewPage 
               apps={apps}
               onSelectApp={handleSelectAppFromOverview} 
               onCreateApp={handleCreateApp}
             />
          ) : (
            <>
              {loadingApp ? (
                  <div className="flex flex-col items-center justify-center py-40 animate-fade-in">
                      <Icons.Refresh className="animate-spin text-primary-500 mb-4" size={32} />
                      <p className="text-slate-400 text-sm">Loading data for <span className="text-slate-900 dark:text-white font-medium">{selectedApp.name}</span>...</p>
                  </div>
              ) : (
                <div className="p-6">
                  {/* Dashboard View */}
                  {activePage === 'dashboard' && (
                    <div className="animate-fade-in">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Frontend Overview</h1>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">{selectedApp.name}</span>
                          </div>
                          <p className="text-slate-500 dark:text-slate-400 text-sm">Real-time visibility into user experience and system health.</p>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {dashboardState.isEditMode ? (
                            <>
                              <button 
                                onClick={() => setShowAddWidgetModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-md transition-colors shadow-lg shadow-primary-900/20"
                              >
                                <Icons.Plus size={16} />
                                Add Widget
                              </button>
                              
                              <button 
                                onClick={toggleEditMode}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-md border border-slate-300 dark:border-slate-700 transition-colors"
                              >
                                <Icons.CheckMark size={16} className="text-green-600 dark:text-green-500" />
                                Done
                              </button>
                            </>
                          ) : (
                            <button 
                              onClick={toggleEditMode}
                              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-md border border-slate-200 dark:border-slate-800 transition-colors"
                            >
                              <Icons.Settings size={16} />
                              Customize Layout
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Summary Section */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        {MOCK_SUMMARY_METRICS.map((m) => (
                          <div key={m.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg flex items-center justify-between shadow-sm">
                            <div>
                              <div className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold tracking-wider">{m.label}</div>
                              <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{m.value}</div>
                            </div>
                            <div className={`text-xs font-medium px-2 py-1 rounded ${
                              m.status === 'healthy' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                              m.status === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                              'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            }`}>
                              {m.trend}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-min relative">
                        {dashboardState.widgets.map((widget) => (
                          <Widget 
                            key={widget.id} 
                            config={widget} 
                            isEditMode={dashboardState.isEditMode}
                            isDragging={draggedWidgetId === widget.id}
                            appId={selectedApp.id}
                            timeRange={dashboardState.timeRange}
                            environment={dashboardState.environment}
                            customTimeRange={dashboardState.customTimeRange}
                            onRemove={removeWidget}
                            onResize={resizeWidget}
                            onDragStart={handleDragStart}
                            onDragEnter={handleDragEnter}
                            onDragEnd={handleDragEnd}
                            theme={theme}
                          />
                        ))}
                        
                        {dashboardState.isEditMode && (
                          <div 
                            className="border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-lg p-4 flex flex-col items-center justify-center min-h-[280px] bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900/80 transition-colors cursor-pointer" 
                            onClick={() => setShowAddWidgetModal(true)}
                          >
                              <Icons.Plus size={32} className="text-slate-400 dark:text-slate-600 mb-2" />
                              <span className="text-slate-500 font-medium">Add New Widget</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sub Pages */}
                  {activePage === 'issues' && <IssuesPage environment={dashboardState.environment} theme={theme} />}
                  {activePage === 'performance' && <PerformancePage environment={dashboardState.environment} theme={theme} />}
                  {activePage === 'replays' && <ReplaysPage theme={theme} />}
                </div>
              )}
            </>
          )}

        </div>
      </main>

      {/* AI Panel */}
      {showAI && (
        <AIAnalysisPanel 
          dashboardState={dashboardState} 
          onClose={() => setShowAI(false)} 
        />
      )}

      {/* Add Widget Modal */}
      {showAddWidgetModal && (
        <AddWidgetModal 
          onClose={() => setShowAddWidgetModal(false)}
          onAdd={handleAddWidget}
        />
      )}
    </div>
  );
};

export default App;