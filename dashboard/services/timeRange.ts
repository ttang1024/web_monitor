import { CustomTimeRange, TimeRange } from '../types';
import { DateRange } from './api';

const DURATIONS: Record<Exclude<TimeRange, 'custom'>, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

/** Turns the header's time-range picker into the ISO window the API expects. */
export function toDateRange(range: TimeRange, custom?: CustomTimeRange): DateRange {
  if (range === 'custom' && custom?.start && custom?.end) {
    return { startDate: new Date(custom.start).toISOString(), endDate: new Date(custom.end).toISOString() };
  }

  const duration = DURATIONS[(range === 'custom' ? '24h' : range) as Exclude<TimeRange, 'custom'>];
  const end = new Date();
  return { startDate: new Date(end.getTime() - duration).toISOString(), endDate: end.toISOString() };
}

/** Hourly buckets are too fine for a week; daily is too coarse for an hour. */
export function bucketFor(range: TimeRange): 'hour' | 'day' {
  return range === '7d' ? 'day' : 'hour';
}

/** How many hourly buckets an issue sparkline should cover for this range. */
export function trendHoursFor(range: TimeRange): number {
  if (range === '7d') return 24 * 7;
  if (range === '15m' || range === '1h') return 6;
  return 24;
}

export function formatTimeLabel(iso: string, bucket: 'hour' | 'day'): string {
  const date = new Date(iso);
  return bucket === 'day'
    ? date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
