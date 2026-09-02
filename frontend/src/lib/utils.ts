export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Backend timestamps come from SQLite's datetime('now'), formatted as
// "YYYY-MM-DD HH:MM:SS" in UTC but with no timezone marker. JS's Date parser
// treats a string like that as *local* time, not UTC — so in any timezone
// ahead of UTC (e.g. UTC+1), every timestamp silently shifts into the future
// and "time ago" math ends up looking an hour (or more) behind. Normalize
// such strings to explicit UTC before parsing; ISO strings that already carry
// a timezone (a trailing Z or +hh:mm) are left untouched.
function toUtcDate(date: string | number | Date): Date {
  if (typeof date === 'string') {
    const hasTz = /Z$|[+-]\d{2}:\d{2}$/.test(date);
    if (!hasTz && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(date)) {
      return new Date(date.replace(' ', 'T') + 'Z');
    }
  }
  return new Date(date);
}

export function formatDate(date: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = toUtcDate(date);
  if (isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString('en-US', options || {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function timeAgo(date: string | number | Date): string {
  const d = toUtcDate(date);
  if (isNaN(d.getTime())) return 'Unknown';
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date, { month: 'short', day: 'numeric' });
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    running: 'var(--status-running)',
    building: 'var(--status-building)',
    stopped: 'var(--status-stopped)',
    failed: 'var(--status-failed)',
    pending: 'var(--status-pending)',
    queued: 'var(--status-queued)',
    exited: 'var(--status-stopped)',
    paused: 'var(--accent-yellow)',
    deploying: 'var(--status-building)',
  };
  return map[status?.toLowerCase()] || 'var(--text-muted)';
}

export function getRoleColor(role: string): string {
  const map: Record<string, string> = {
    admin: 'var(--accent-purple)',
    developer: 'var(--accent-blue)',
    viewer: 'var(--text-muted)',
  };
  return map[role] || 'var(--text-muted)';
}

export function getSeverityColor(severity: string): string {
  const map: Record<string, string> = {
    critical: 'var(--accent-red)',
    warning: 'var(--accent-orange)',
    info: 'var(--accent-blue)',
  };
  return map[severity] || 'var(--text-muted)';
}

export function parseApiError(err: any): string {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.message) return err.message;
  return 'An unexpected error occurred';
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  return Promise.resolve();
}
