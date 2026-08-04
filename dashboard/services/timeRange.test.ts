import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketFor, formatRelative, formatTimeLabel, toDateRange, trendHoursFor } from './timeRange';

const NOW = new Date('2026-08-04T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toDateRange', () => {
  it('ends the window at now', () => {
    expect(toDateRange('1h').endDate).toBe(NOW.toISOString());
  });

  it('subtracts the range duration to find the start', () => {
    expect(toDateRange('15m').startDate).toBe('2026-08-04T11:45:00.000Z');
    expect(toDateRange('24h').startDate).toBe('2026-08-03T12:00:00.000Z');
    expect(toDateRange('7d').startDate).toBe('2026-07-28T12:00:00.000Z');
  });

  it('uses the custom window when one is supplied', () => {
    const range = toDateRange('custom', {
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-08-02T00:00:00.000Z',
    });

    expect(range).toEqual({
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-02T00:00:00.000Z',
    });
  });

  // Selecting "custom" opens a picker; until it is applied there is no window
  // to use, and the dashboard still has to request something.
  it('falls back to 24h when custom is selected with no window yet', () => {
    expect(toDateRange('custom')).toEqual(toDateRange('24h'));
  });

  it('falls back to 24h when the custom window is half-filled', () => {
    expect(toDateRange('custom', { start: '2026-08-01T00:00:00.000Z', end: '' })).toEqual(toDateRange('24h'));
  });
});

describe('bucketFor', () => {
  it('uses daily buckets for a week and hourly for anything shorter', () => {
    expect(bucketFor('7d')).toBe('day');
    expect(bucketFor('24h')).toBe('hour');
    expect(bucketFor('15m')).toBe('hour');
  });
});

describe('trendHoursFor', () => {
  it('scales the sparkline window with the selected range', () => {
    expect(trendHoursFor('7d')).toBe(168);
    expect(trendHoursFor('24h')).toBe(24);
    // A 15-minute view against 24h of buckets would be almost entirely empty.
    expect(trendHoursFor('15m')).toBe(6);
    expect(trendHoursFor('1h')).toBe(6);
  });
});

describe('formatTimeLabel', () => {
  it('shows a date for daily buckets and a clock time for hourly ones', () => {
    expect(formatTimeLabel('2026-08-04T12:00:00.000Z', 'day')).toMatch(/Aug/);
    expect(formatTimeLabel('2026-08-04T12:00:00.000Z', 'hour')).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('formatRelative', () => {
  it('collapses a very recent timestamp to "just now"', () => {
    expect(formatRelative(new Date(NOW.getTime() - 5_000).toISOString())).toBe('just now');
  });

  // Minutes are rounded, not floored, so the "just now" boundary sits at 30
  // seconds rather than 60.
  it('rounds to the nearest minute at the boundary', () => {
    expect(formatRelative(new Date(NOW.getTime() - 29_000).toISOString())).toBe('just now');
    expect(formatRelative(new Date(NOW.getTime() - 31_000).toISOString())).toBe('1m ago');
  });

  it('steps up through minutes, hours and days', () => {
    expect(formatRelative(new Date(NOW.getTime() - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(formatRelative(new Date(NOW.getTime() - 3 * 3_600_000).toISOString())).toBe('3h ago');
    expect(formatRelative(new Date(NOW.getTime() - 2 * 86_400_000).toISOString())).toBe('2d ago');
  });
});
