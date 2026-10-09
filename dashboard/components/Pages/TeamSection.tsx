import React, { useState } from 'react';
import { Icons } from '../ui/Icons';
import { useApi } from '../../hooks/useApi';
import { Tenant, User, UserRole, createUser, listUsers, updateUser } from '../../services/api';
import { formatRelative } from '../../services/timeRange';

interface TeamSectionProps {
  currentUser: User;
  tenant: Tenant;
}

const EMPTY_FORM = { email: '', firstName: '', lastName: '', role: 'User' as UserRole, initialPassword: '' };

/**
 * Tenant members. Admins add people (with an initial password they hand over),
 * change roles and deactivate accounts; deactivation ends that user's sessions.
 */
export const TeamSection: React.FC<TeamSectionProps> = ({ currentUser, tenant }) => {
  const isAdmin = currentUser.role === 'Admin';
  const users = useApi(() => listUsers(), []);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCount = (users.data ?? []).filter((user) => user.isActive).length;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      users.refetch();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await run(() => createUser(form))) {
      setForm(EMPTY_FORM);
      setShowForm(false);
    }
  };

  const input =
    'w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-primary-500';

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Team</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activeCount} of {tenant.maxUsers} seats on the {tenant.plan} plan
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm((open) => !open)}
            disabled={activeCount >= tenant.maxUsers}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icons.Plus size={16} /> Add member
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {showForm && isAdmin && (
        <form
          onSubmit={handleCreate}
          className="mb-4 grid grid-cols-1 md:grid-cols-6 gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
        >
          <input
            className={`${input} md:col-span-2`}
            type="email"
            required
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className={input}
            required
            placeholder="First name"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          <input
            className={input}
            required
            placeholder="Last name"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
          <select
            className={input}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
          >
            <option value="User">Member</option>
            <option value="Admin">Admin</option>
          </select>
          <input
            className={input}
            type="password"
            required
            minLength={8}
            placeholder="Initial password"
            autoComplete="new-password"
            value={form.initialPassword}
            onChange={(e) => setForm({ ...form, initialPassword: e.target.value })}
          />
          <div className="md:col-span-6 flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              Create member
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs">
            <tr>
              <th className="px-6 py-3">Member</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3">Last sign-in</th>
              <th className="px-6 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(users.data ?? []).map((user) => {
              const isSelf = user.id === currentUser.id;
              return (
                <tr key={user.id} className={user.isActive ? '' : 'opacity-50'}>
                  <td className="px-6 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {user.firstName} {user.lastName}{' '}
                      {isSelf && <span className="text-xs text-slate-400">(you)</span>}
                    </div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                  </td>
                  <td className="px-6 py-3">
                    {isAdmin && !isSelf ? (
                      <select
                        className="bg-transparent text-sm text-slate-700 dark:text-slate-300"
                        value={user.role}
                        disabled={busy}
                        onChange={(e) => run(() => updateUser(user.id, { role: e.target.value as UserRole }))}
                      >
                        <option value="User">Member</option>
                        <option value="Admin">Admin</option>
                      </select>
                    ) : (
                      <span className="text-slate-700 dark:text-slate-300">
                        {user.role === 'Admin' ? 'Admin' : 'Member'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'never'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {isAdmin && !isSelf ? (
                      <button
                        disabled={busy}
                        onClick={() => run(() => updateUser(user.id, { isActive: !user.isActive }))}
                        className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {user.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">{user.isActive ? 'Active' : 'Inactive'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
