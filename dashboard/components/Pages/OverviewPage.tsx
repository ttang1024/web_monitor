import React, { useState } from 'react';
import { Icons } from '../ui/Icons';
import { Application } from '../../types';

interface OverviewPageProps {
  apps: Application[];
  onSelectApp: (app: Application) => void;
  onCreateApp: (data: { name: string; framework: Application['framework'] }) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ apps, onSelectApp, onCreateApp }) => {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    framework: Application['framework'];
  }>({
    name: '',
    framework: 'react'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    
    onCreateApp(formData);
    setFormData({ name: '', framework: 'react' });
    setShowModal(false);
  };

  return (
    <div className="animate-fade-in max-w-6xl mx-auto py-12 px-6 relative">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Projects</h1>
          <p className="text-slate-500 dark:text-slate-400">Select a project to view monitoring dashboards and insights.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-lg shadow-primary-900/20"
        >
          <Icons.Plus size={18} />
          <span>New Project</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {apps.map((app) => (
          <div 
            key={app.id}
            onClick={() => onSelectApp(app)}
            className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 cursor-pointer hover:border-primary-500/50 hover:shadow-xl hover:shadow-primary-900/5 transition-all duration-300 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <Icons.ArrowRight className="text-primary-500" />
            </div>

            <div className="flex items-center justify-between mb-6">
              <div className={`
                w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold uppercase
                ${app.framework === 'next' ? 'bg-black text-white border border-slate-700 shadow-lg' : 
                  app.framework === 'react' ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900' : 
                  app.framework === 'vue' ? 'bg-green-100 dark:bg-green-950 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-900' :
                  app.framework === 'angular' ? 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900' :
                  'bg-yellow-100 dark:bg-yellow-950 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-900'}
              `}>
                {app.framework === 'next' ? 'N' : app.framework === 'react' ? 'R' : app.framework === 'vue' ? 'V' : app.framework === 'angular' ? 'A' : 'JS'}
              </div>
              <div className={`
                px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5
                ${app.health === 'healthy' ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/20' : 
                  app.health === 'warning' ? 'bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/20' : 
                  'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20'}
              `}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                    app.health === 'healthy' ? 'bg-green-500' : 
                    app.health === 'warning' ? 'bg-yellow-500' : 
                    'bg-red-500'
                }`}></div>
                <span className="capitalize">{app.health}</span>
              </div>
            </div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                {app.name}
            </h3>
            <div className="flex items-center gap-3 text-sm text-slate-500 mb-6">
                <span className="capitalize flex items-center gap-1">
                    {app.framework === 'react' && <Icons.Activity size={12} />}
                    {app.framework}
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                <span>Production</span>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Avg Latency</div>
                    <div className="text-slate-700 dark:text-slate-200 font-mono text-sm">
                        {Math.floor(Math.random() * 200) + 50}ms
                    </div>
                </div>
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Error Rate</div>
                    <div className="text-slate-700 dark:text-slate-200 font-mono text-sm">
                         {(Math.random() * 0.5).toFixed(2)}%
                    </div>
                </div>
            </div>
          </div>
        ))}

        <button 
          onClick={() => setShowModal(true)}
          className="border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center gap-3 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-400 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-all min-h-[200px] group"
        >
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 flex items-center justify-center transition-colors">
                <Icons.Plus size={24} />
            </div>
            <span className="font-medium">Create New Project</span>
        </button>
      </div>

      {/* Create Project Modal */}
      {showModal && (
        <>
          <div 
            className="fixed inset-0 bg-slate-950/50 dark:bg-slate-950/80 backdrop-blur-sm z-50 animate-fade-in"
            onClick={() => setShowModal(false)}
          ></div>
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Create New Project</h2>
              <button 
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <Icons.X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Project Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder="e.g. Analytics Dashboard"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Framework</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['react', 'next', 'vue', 'angular', 'node'] as const).map((fw) => (
                    <button
                      key={fw}
                      type="button"
                      onClick={() => setFormData({...formData, framework: fw})}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-lg border text-sm capitalize transition-all
                        ${formData.framework === fw 
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 text-primary-600 dark:text-primary-400' 
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'}
                      `}
                    >
                      <div className={`w-2 h-2 rounded-full ${formData.framework === fw ? 'bg-primary-500' : 'bg-slate-400 dark:bg-slate-700'}`}></div>
                      {fw}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!formData.name.trim()}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};