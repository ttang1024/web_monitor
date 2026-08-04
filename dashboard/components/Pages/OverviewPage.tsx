import React, { useState } from 'react';
import { Icons } from '../ui/Icons';
import { useApi } from '../../hooks/useApi';
import { ApiKey, createApiKey, listApiKeys, revokeApiKey } from '../../services/api';
import { formatRelative } from '../../services/timeRange';

interface OverviewPageProps {
  onOpenDashboards: () => void;
}

const ENVIRONMENTS = ['production', 'staging', 'development'] as const;

const installSnippet = (key: string) => `import MonitoringSDK from '@web-monitor/sdk'

const monitor = new MonitoringSDK('${key}', {
  baseUrl: '${(process.env.API_URL as string | undefined)?.replace(/\/graphql$/, '') || 'http://localhost:4000'}',
})`;

const CopyButton: React.FC<{ value: string; label?: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      {copied ? <Icons.CheckMark size={12} className="text-green-500" /> : <Icons.Copy size={12} />}
      {copied ? 'Copied' : label ?? 'Copy'}
    </button>
  );
};

export const OverviewPage: React.FC<OverviewPageProps> = ({ onOpenDashboards }) => {
  const { data: keys, loading, error, refetch } = useApi(() => listApiKeys(), []);
  const [showModal, setShowModal] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<{ name: string; environment: (typeof ENVIRONMENTS)[number] }>({
    name: '',
    environment: 'production',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setBusy(true);
    setFormError(null);
    try {
      await createApiKey(formData.name.trim(), formData.environment);
      setFormData({ name: '', environment: 'production' });
      setShowModal(false);
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the key.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (key: ApiKey) => {
    if (!confirm(`Revoke "${key.name}"? Pages using this key stop reporting immediately.`)) return;
    await revokeApiKey(key.id);
    refetch();
  };

  const active = (keys ?? []).filter((key) => key.isActive);
  const revoked = (keys ?? []).filter((key) => !key.isActive);

  return (
    <div className="animate-fade-in max-w-6xl mx-auto py-12 px-6 relative">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Projects</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Each project is an API key your pages report with. Install the SDK with one of these keys, then open the
            dashboards.
          </p>
        </div>
        {/* shrink-0 + nowrap: the description beside these buttons must not
            squeeze them until their labels wrap. */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onOpenDashboards}
            className="flex items-center gap-2 whitespace-nowrap bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-md font-medium transition-colors"
          >
            <Icons.Grid size={18} className="shrink-0" />
            <span>Dashboards</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 whitespace-nowrap bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-lg shadow-primary-900/20"
          >
            <Icons.Plus size={18} className="shrink-0" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icons.AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={refetch} className="ml-auto underline">
            Retry
          </button>
        </div>
      )}

      {loading && !keys ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Icons.Refresh className="animate-spin mb-3" size={28} />
          Loading projects…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {active.map((key) => (
            <div
              key={key.id}
              className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 hover:border-primary-500/50 hover:shadow-xl hover:shadow-primary-900/5 transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 border border-primary-100 dark:border-primary-900/50">
                  <Icons.Key size={20} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 capitalize">
                    {key.environment}
                  </span>
                  <button
                    onClick={() => handleRevoke(key)}
                    className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Revoke this key"
                  >
                    <Icons.Ban size={16} />
                  </button>
                </div>
              </div>

              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{key.name}</h3>
              <div className="flex items-center gap-3 text-sm text-slate-500 mb-4">
                <span>Created {formatRelative(key.createdAt)}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                <span>{key.lastUsedAt ? `Last report ${formatRelative(key.lastUsedAt)}` : 'No reports yet'}</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-slate-700 dark:text-slate-300 truncate">
                    {revealed[key.id] ? key.key : `${key.key.slice(0, 7)}${'•'.repeat(24)}`}
                  </code>
                  <button
                    onClick={() => setRevealed((state) => ({ ...state, [key.id]: !state[key.id] }))}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title={revealed[key.id] ? 'Hide key' : 'Reveal key'}
                  >
                    {revealed[key.id] ? <Icons.EyeOff size={16} /> : <Icons.Eye size={16} />}
                  </button>
                  <CopyButton value={key.key} label="Key" />
                </div>

                <details className="group/snippet">
                  <summary className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer select-none">
                    <Icons.Code size={12} /> Install snippet
                  </summary>
                  <div className="mt-2 relative">
                    <pre className="text-[11px] leading-relaxed font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-3 overflow-x-auto text-slate-700 dark:text-slate-300">
                      {installSnippet(key.key)}
                    </pre>
                    <div className="absolute top-2 right-2">
                      <CopyButton value={installSnippet(key.key)} label="Snippet" />
                    </div>
                  </div>
                </details>
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
      )}

      {revoked.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Revoked
          </h2>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
            {revoked.map((key) => (
              <div key={key.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-600 dark:text-slate-300">{key.name}</span>
                <span className="text-slate-400 font-mono text-xs">{key.key.slice(0, 10)}…</span>
                <span className="text-xs uppercase tracking-wider text-slate-400">{key.environment}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

            <form onSubmit={handleCreate} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Project Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder="e.g. Storefront"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Environment
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {ENVIRONMENTS.map((environment) => (
                    <button
                      key={environment}
                      type="button"
                      onClick={() => setFormData({ ...formData, environment })}
                      className={`
                        flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm capitalize transition-all
                        ${
                          formData.environment === environment
                            ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 text-primary-600 dark:text-primary-400'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                        }
                      `}
                    >
                      {environment}
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
                  disabled={!formData.name.trim() || busy}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {busy && <Icons.Refresh className="animate-spin" size={16} />}
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
