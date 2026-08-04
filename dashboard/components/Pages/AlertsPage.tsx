import React, { useState } from 'react';
import { Icons } from '../ui/Icons';
import { useApi } from '../../hooks/useApi';
import {
  AlertCondition,
  AlertRule,
  AlertRuleInput,
  AlertSeverity,
  createAlertRule,
  deleteAlertRule,
  listAlertNotifications,
  listAlertRules,
  markAlertNotificationsRead,
  updateAlertRule,
} from '../../services/api';
import { formatRelative } from '../../services/timeRange';

/**
 * Each condition measures something different, so the threshold means something
 * different too. Carrying the unit and help text next to the condition keeps the
 * form honest about what the number the user types actually does.
 */
const CONDITIONS: Record<
  AlertCondition,
  { label: string; unit: string; help: string; usesThreshold: boolean; defaultThreshold: number }
> = {
  NewIssue: {
    label: 'New issue appears',
    unit: '',
    help: 'Fires the first time an error is seen. No threshold — any new issue counts.',
    usesThreshold: false,
    defaultThreshold: 0,
  },
  ErrorSpike: {
    label: 'Error spike',
    unit: 'occurrences',
    help: 'Fires when total error occurrences in the window go above the threshold.',
    usesThreshold: true,
    defaultThreshold: 100,
  },
  ErrorRate: {
    label: 'Error rate',
    unit: '%',
    help: 'Fires when errors exceed this share of all events. Ignored below 20 events, where the percentage is noise.',
    usesThreshold: true,
    defaultThreshold: 5,
  },
  SlowPageLoad: {
    label: 'Slow page loads',
    unit: 'ms',
    help: 'Fires when the average load time over the window goes above the threshold.',
    usesThreshold: true,
    defaultThreshold: 3000,
  },
};

const SEVERITIES: AlertSeverity[] = ['Info', 'Warning', 'Critical'];

const severityStyles: Record<AlertSeverity, string> = {
  Info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50',
  Warning:
    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900/50',
  Critical: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50',
};

const emptyForm = (): AlertRuleInput => ({
  name: '',
  condition: 'ErrorSpike',
  threshold: CONDITIONS.ErrorSpike.defaultThreshold,
  windowMinutes: 60,
  severity: 'Warning',
  cooldownMinutes: 60,
  webhookUrl: '',
  isEnabled: true,
});

function describeRule(rule: AlertRule): string {
  const condition = CONDITIONS[rule.condition];
  const measure = condition.usesThreshold
    ? ` above ${rule.threshold}${condition.unit ? ` ${condition.unit}` : ''}`
    : '';
  return `${condition.label}${measure} over ${rule.windowMinutes}m`;
}

export const AlertsPage: React.FC = () => {
  const rules = useApi(() => listAlertRules(), []);
  const notifications = useApi(() => listAlertNotifications({ pageSize: 50 }), []);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [form, setForm] = useState<AlertRuleInput>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (rule: AlertRule) => {
    setEditing(rule);
    setForm({
      name: rule.name,
      condition: rule.condition,
      threshold: rule.threshold,
      windowMinutes: rule.windowMinutes,
      severity: rule.severity,
      cooldownMinutes: rule.cooldownMinutes,
      webhookUrl: rule.webhookUrl ?? '',
      isEnabled: rule.isEnabled,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    setBusy(true);
    setFormError(null);
    try {
      // An empty webhook field means "no webhook", which the API expects as
      // null — an empty string would fail its URL validation.
      const payload: AlertRuleInput = {
        ...form,
        name: form.name.trim(),
        webhookUrl: form.webhookUrl?.trim() ? form.webhookUrl.trim() : null,
      };

      if (editing) await updateAlertRule(editing.id, payload);
      else await createAlertRule(payload);

      setShowModal(false);
      rules.refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the rule.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (rule: AlertRule) => {
    await updateAlertRule(rule.id, { isEnabled: !rule.isEnabled });
    rules.refetch();
  };

  const handleDelete = async (rule: AlertRule) => {
    if (!confirm(`Delete "${rule.name}"? Its past notifications are removed too.`)) return;
    await deleteAlertRule(rule.id);
    rules.refetch();
    notifications.refetch();
  };

  const handleMarkAllRead = async () => {
    await markAlertNotificationsRead();
    notifications.refetch();
  };

  const condition = CONDITIONS[form.condition];
  const unread = notifications.data?.unread ?? 0;

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Alerts</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Rules are evaluated on a timer against the window ending now. Each one stays quiet for its cooldown
            after firing.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 whitespace-nowrap px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-md transition-colors shadow-lg shadow-primary-900/20 shrink-0"
        >
          <Icons.Plus size={16} />
          New Rule
        </button>
      </div>

      {(rules.error || notifications.error) && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icons.AlertTriangle size={16} />
          <span>{rules.error ?? notifications.error}</span>
          <button
            onClick={() => {
              rules.refetch();
              notifications.refetch();
            }}
            className="ml-auto underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- Rules --- */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Rules
          </h2>

          {rules.loading && !rules.data ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Icons.Refresh className="animate-spin mr-2" size={20} /> Loading rules…
            </div>
          ) : rules.data?.length ? (
            <div className="space-y-3">
              {rules.data.map((rule) => (
                <div
                  key={rule.id}
                  className={`bg-white dark:bg-slate-900 border rounded-lg p-4 transition-colors ${
                    rule.isEnabled
                      ? 'border-slate-200 dark:border-slate-800'
                      : 'border-dashed border-slate-300 dark:border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 dark:text-white truncate">{rule.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-wider ${severityStyles[rule.severity]}`}
                        >
                          {rule.severity}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{describeRule(rule)}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        {rule.lastTriggeredAt
                          ? `Last fired ${formatRelative(rule.lastTriggeredAt)}`
                          : 'Never fired'}
                        {rule.webhookUrl ? ' · webhook set' : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggle(rule)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={rule.isEnabled ? 'Disable this rule' : 'Enable this rule'}
                      >
                        {rule.isEnabled ? <Icons.Bell size={16} /> : <Icons.BellOff size={16} />}
                      </button>
                      <button
                        onClick={() => openEdit(rule)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Edit this rule"
                      >
                        <Icons.Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(rule)}
                        className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Delete this rule"
                      >
                        <Icons.Trash size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-lg py-12 flex flex-col items-center gap-3 text-slate-500">
              <Icons.Bell size={28} className="text-slate-400 dark:text-slate-600" />
              <p className="text-sm">No rules yet — nothing is being watched.</p>
              <button onClick={openCreate} className="text-sm text-primary-600 dark:text-primary-400 underline">
                Create the first one
              </button>
            </div>
          )}
        </section>

        {/* --- Notifications --- */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Notifications
              {unread > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-primary-600 text-white text-[10px] font-bold">
                  {unread} new
                </span>
              )}
            </h2>
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.loading && !notifications.data ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Icons.Refresh className="animate-spin mr-2" size={20} /> Loading notifications…
            </div>
          ) : notifications.data?.data.length ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
              {notifications.data.data.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 ${notification.isRead ? '' : 'bg-primary-50/40 dark:bg-primary-900/10'}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <span className="font-medium text-slate-900 dark:text-white text-sm">
                      {notification.title}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-wider shrink-0 ${severityStyles[notification.severity]}`}
                    >
                      {notification.severity}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 break-words">{notification.body}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 dark:text-slate-500 flex-wrap">
                    <span>{notification.ruleName}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                    <span>{formatRelative(notification.createdAt)}</span>
                    {/* A webhook that failed is worth surfacing: the alert fired,
                        but nothing outside this page was told about it. */}
                    {notification.deliveryError && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                        <span className="text-red-500 dark:text-red-400 flex items-center gap-1">
                          <Icons.AlertTriangle size={11} />
                          webhook failed: {notification.deliveryError}
                        </span>
                      </>
                    )}
                    {notification.deliveredAt && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                        <span className="text-green-600 dark:text-green-400">delivered</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-lg py-12 flex flex-col items-center gap-2 text-slate-500">
              <Icons.CheckCircle size={28} className="text-green-500" />
              <p className="text-sm">Nothing has fired.</p>
            </div>
          )}
        </section>
      </div>

      {/* --- Rule modal --- */}
      {showModal && (
        <>
          <div
            className="fixed inset-0 bg-slate-950/50 dark:bg-slate-950/80 backdrop-blur-sm z-50 animate-fade-in"
            onClick={() => setShowModal(false)}
          ></div>
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {editing ? 'Edit Rule' : 'New Alert Rule'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <Icons.X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder="e.g. Checkout error spike"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Condition
                </label>
                <select
                  value={form.condition}
                  onChange={(e) => {
                    const next = e.target.value as AlertCondition;
                    // The threshold's meaning changes with the condition, so
                    // carrying the old number over would be misleading.
                    setForm({ ...form, condition: next, threshold: CONDITIONS[next].defaultThreshold });
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                >
                  {(Object.keys(CONDITIONS) as AlertCondition[]).map((key) => (
                    <option key={key} value={key}>
                      {CONDITIONS[key].label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{condition.help}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {condition.usesThreshold && (
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Threshold {condition.unit && <span className="text-slate-400">({condition.unit})</span>}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={form.threshold}
                      onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Window <span className="text-slate-400">(minutes)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.windowMinutes}
                    onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Cooldown <span className="text-slate-400">(minutes)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.cooldownMinutes}
                    onChange={(e) => setForm({ ...form, cooldownMinutes: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Severity
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {SEVERITIES.map((severity) => (
                    <button
                      key={severity}
                      type="button"
                      onClick={() => setForm({ ...form, severity })}
                      className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                        form.severity === severity
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 text-primary-600 dark:text-primary-400'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {severity}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Webhook URL <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  type="url"
                  value={form.webhookUrl ?? ''}
                  onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder="https://hooks.slack.com/services/…"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  Posted to when the rule fires. Notifications are recorded here either way.
                </p>
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
                  disabled={!form.name.trim() || busy}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {busy && <Icons.Refresh className="animate-spin" size={16} />}
                  {editing ? 'Save Changes' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
