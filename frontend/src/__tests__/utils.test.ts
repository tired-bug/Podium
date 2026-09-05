import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  cn,
  timeAgo,
  formatBytes,
  formatNumber,
  slugify,
  truncate,
  getStatusColor,
  getRoleColor,
  parseApiError,
} from '../lib/utils';

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    expect(cn('a', false, undefined, 'b', null, '')).toBe('a b');
  });
});

describe('timeAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats a SQLite-style timestamp without a timezone as UTC, not local time', () => {
    // Regression test for the bug documented in utils.ts: SQLite's
    // datetime('now') produces "YYYY-MM-DD HH:MM:SS" with no timezone
    // marker. Naively passed to `new Date(...)`, JS parses that as *local*
    // time. In any timezone ahead of UTC this makes recent timestamps look
    // like they're in the future, and timeAgo would wrongly compute a
    // negative diff / "0s ago" instead of the real elapsed time.
    vi.useFakeTimers();
    // "Now" is fixed at a known UTC instant.
    vi.setSystemTime(new Date('2026-01-01T12:05:00Z'));

    // A SQLite timestamp for 5 minutes before that instant, in UTC.
    const sqliteTimestamp = '2026-01-01 12:00:00';

    expect(timeAgo(sqliteTimestamp)).toBe('5m ago');
  });

  it('still parses proper ISO timestamps with an explicit Z', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:45Z'));
    expect(timeAgo('2026-01-01T00:00:00Z')).toBe('45s ago');
  });

  it('returns "Unknown" for an unparseable date', () => {
    expect(timeAgo('not-a-date')).toBe('Unknown');
  });
});

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats kilobytes, megabytes, gigabytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });
});

describe('formatNumber', () => {
  it('leaves small numbers as-is', () => {
    expect(formatNumber(42)).toBe('42');
  });

  it('abbreviates thousands and millions', () => {
    expect(formatNumber(1500)).toBe('1.5K');
    expect(formatNumber(2_500_000)).toBe('2.5M');
  });
});

describe('slugify', () => {
  it('lowercases, replaces non-alphanumeric runs with a dash, and trims edge dashes', () => {
    expect(slugify('My Cool Project!!')).toBe('my-cool-project');
    expect(slugify('  --Weird__Name--  ')).toBe('weird-name');
  });
});

describe('truncate', () => {
  it('leaves short strings untouched', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('truncates long strings and appends an ellipsis within maxLen', () => {
    const result = truncate('a very long string indeed', 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith('...')).toBe(true);
  });
});

describe('getStatusColor / getRoleColor', () => {
  it('returns the mapped color for known statuses and a fallback for unknown ones', () => {
    expect(getStatusColor('running')).toBe('var(--status-running)');
    expect(getStatusColor('RUNNING')).toBe('var(--status-running)');
    expect(getStatusColor('something-unmapped')).toBe('var(--text-muted)');
  });

  it('returns the mapped color for known roles and a fallback otherwise', () => {
    expect(getRoleColor('admin')).toBe('var(--accent-purple)');
    expect(getRoleColor('nonsense')).toBe('var(--text-muted)');
  });
});

describe('parseApiError', () => {
  it('prefers response.data.error, then response.data.message, then err.message', () => {
    expect(parseApiError({ response: { data: { error: 'bad request' } } })).toBe('bad request');
    expect(parseApiError({ response: { data: { message: 'server said so' } } })).toBe('server said so');
    expect(parseApiError({ message: 'network down' })).toBe('network down');
  });

  it('falls back to a generic message when nothing usable is present', () => {
    expect(parseApiError({})).toBe('An unexpected error occurred');
  });
});
