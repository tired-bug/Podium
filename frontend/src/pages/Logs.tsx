import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ScrollText, Search, Trash2, ChevronDown, Radio } from 'lucide-react';
import { Card, EmptyState, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { parseApiError } from '../lib/utils';
import api from '../lib/api';

interface LogEntry {
  id: number;
  deployment_id: string;
  deployment_name?: string;
  timestamp: string;
  level: string;
  message: string;
  stream: string;
}

const LEVEL_COLORS: Record<string, { text: string; bg: string }> = {
  error:   { text: 'var(--accent-red)',    bg: 'var(--accent-red-dim)' },
  warn:    { text: 'var(--accent-orange)', bg: 'var(--accent-orange-dim)' },
  warning: { text: 'var(--accent-orange)', bg: 'var(--accent-orange-dim)' },
  info:    { text: 'var(--text-secondary)', bg: 'transparent' },
  debug:   { text: 'var(--text-muted)',    bg: 'transparent' },
};

const LEVEL_OPTIONS = [
  { value: 'all', label: 'All logs' },
  { value: 'error', label: 'Errors' },
  { value: 'warn', label: 'Warnings' },
  { value: 'info', label: 'Info' },
];

const HTTP_LINE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s+(\d{3})\s+([\d.]+\s*ms)(.*)$/;

function statusColor(status: string): string {
  const n = parseInt(status, 10);
  if (n >= 500) return 'var(--accent-red)';
  if (n >= 400) return 'var(--accent-orange)';
  if (n >= 300) return 'var(--accent-blue)';
  return 'var(--accent-green)';
}

function MessageLine({ message }: { message: string }) {
  const match = message.match(HTTP_LINE);
  if (match) {
    const [, method, path, status, duration, rest] = match;
    return (
      <>
        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{method}</span>{' '}
        <span style={{ color: 'var(--text-secondary)' }}>{path}</span>{' '}
        <span style={{ color: statusColor(status), fontWeight: 700 }}>{status}</span>{' '}
        <span style={{ color: 'var(--text-muted)' }}>{duration}</span>
        {rest && <span style={{ color: 'var(--text-muted)' }}>{rest}</span>}
      </>
    );
  }
  return <span style={{ color: 'var(--text-secondary)' }}>{message}</span>;
}

function dayKey(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Logs() {
  const { success, error: showError } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('all');
  const [deploymentId, setDeploymentId] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [live, setLive] = useState(true);
  const [offset, setOffset] = useState(0);
  const [cloudDeps, setCloudDeps] = useState<Array<{ id: string; name: string }>>([]);
  const [now, setNow] = useState(new Date());
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const LIMIT = 200;

  // Deployment filter options — pulled from the real platform-wide deployment
  // list (same source as the Dashboard/Cloud pages), not the legacy table.
  useEffect(() => {
    api.get('/api/cloud').then(r => setCloudDeps(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  const fetchLogs = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(currentOffset),
        ...(deploymentId !== 'all' ? { deploymentId } : {}),
        ...(level !== 'all' ? { level } : {}),
        ...(search ? { search } : {}),
      });
      const { data } = await api.get(`/api/logs?${params}`);
      if (reset) {
        setLogs(data.logs);
        setOffset(0);
      } else {
        setLogs(prev => [...data.logs, ...prev]);
      }
      setTotal(data.total);
    } catch (err) { showError(parseApiError(err)); }
    finally { setLoading(false); }
  }, [deploymentId, level, search, offset]);

  useEffect(() => { fetchLogs(true); }, [deploymentId, level]);

  useEffect(() => {
    if (!live) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [deploymentId, level, live]);

  const lastNewestIdRef = useRef<number | null>(null);
  useEffect(() => {
    const newestId = logs.length ? logs[logs.length - 1].id : null;
    const hasNewLog = newestId !== null && newestId !== lastNewestIdRef.current;
    if (autoScroll && hasNewLog && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    lastNewestIdRef.current = newestId;
  }, [logs, autoScroll]);

  const handleScroll = () => {
    const el = logsContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const handleClear = async () => {
    if (deploymentId === 'all') { showError('Select a deployment to clear its logs'); return; }
    try {
      await api.delete(`/api/logs/${deploymentId}`);
      success('Logs cleared');
      setLogs([]);
    } catch (err) { showError(parseApiError(err)); }
  };

  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warn' || l.level === 'warning').length;

  const depOptions = [
    { value: 'all', label: 'All Deployments' },
    ...cloudDeps.map(d => ({ value: d.id, label: d.name })),
  ];

  const activeDepLabel = deploymentId === 'all' ? null : (cloudDeps.find(d => d.id === deploymentId)?.name ?? null);

  // Group logs by calendar day, in order, for sticky day headers (Render-style).
  const groups = useMemo(() => {
    const out: Array<{ day: string; entries: LogEntry[] }> = [];
    for (const log of logs) {
      const key = dayKey(log.timestamp);
      const last = out[out.length - 1];
      if (last && last.day === key) last.entries.push(log);
      else out.push({ day: key, entries: [log] });
    }
    return out;
  }, [logs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {}
      <Card style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} at{' '}
                {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </span>
              <button
                onClick={() => setLive(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  padding: '4px 10px', borderRadius: 'var(--radius-pill)', border: 'none',
                  background: live ? 'var(--accent-green-dim)' : 'var(--bg-tertiary)',
                  color: live ? 'var(--accent-green)' : 'var(--text-muted)',
                  fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-sans)',
                }}
              >
                <Radio size={11} style={{ animation: live ? 'pulse-dot 1.4s ease-in-out infinite' : 'none' }} />
                {live ? 'Live' : 'Paused'}
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
              {activeDepLabel ? (
                <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{activeDepLabel}</span>
              ) : (
                <span>All deployments</span>
              )}
              <span>·</span>
              <span>{total} total log entries</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {errorCount > 0 && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-red)', padding: '3px 10px', background: 'var(--accent-red-dim)', borderRadius: 'var(--radius-pill)' }}>
                {errorCount} errors
              </span>
            )}
            {warnCount > 0 && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-orange)', padding: '3px 10px', background: 'var(--accent-orange-dim)', borderRadius: 'var(--radius-pill)' }}>
                {warnCount} warnings
              </span>
            )}
            <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={handleClear}>Clear</Button>
          </div>
        </div>
      </Card>

      {}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          value={level}
          onChange={e => setLevel(e.target.value)}
          options={LEVEL_OPTIONS}
          wrapStyle={{ minWidth: 130 }}
        />
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') fetchLogs(true); }}
            placeholder="Search logs"
            style={{
              width: '100%', padding: '8px 12px 8px 34px',
              background: 'var(--bg-secondary)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <Select
          value={deploymentId}
          onChange={e => setDeploymentId(e.target.value)}
          options={depOptions}
          wrapStyle={{ minWidth: 180 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>
      </div>

      {}
      <Card style={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 500, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={20} width={`${60 + i * 8}%`} />)}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState icon={<ScrollText size={36} />} title="No logs found" description="Logs will appear here when your deployments produce output." />
        ) : (
          <div
            ref={logsContainerRef}
            onScroll={handleScroll}
            style={{
              flex: 1, overflowY: 'auto',
              fontFamily: 'var(--font-mono)', fontSize: '12px',
              background: 'var(--bg-primary)',
            }}
          >
            {}
            {logs.length < total && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <Button size="sm" variant="ghost" icon={<ChevronDown size={13} />}
                  onClick={() => { setOffset(prev => prev + LIMIT); fetchLogs(); }}>
                  Load older logs
                </Button>
              </div>
            )}

            {groups.map(group => (
              <div key={group.day}>
                <div style={{
                  position: 'sticky', top: 0, zIndex: 1,
                  padding: '6px 16px', fontSize: '11px', fontWeight: 700,
                  color: 'var(--text-secondary)', background: 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border-muted)',
                }}>
                  {group.day}
                </div>
                {group.entries.map((log, idx) => {
                  const lc = LEVEL_COLORS[log.level?.toLowerCase()] || LEVEL_COLORS.info;
                  return (
                    <div key={`${log.id}-${idx}`} style={{
                      display: 'flex', gap: 12, padding: '2px 16px',
                      background: lc.bg, alignItems: 'flex-start',
                    }}>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '11px', paddingTop: 1, width: 78 }}>
                        {new Date(log.timestamp).toLocaleTimeString(undefined, { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      {log.deployment_name && (
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '11px', paddingTop: 1 }}>
                          [{log.deployment_name}]
                        </span>
                      )}
                      {log.level && log.level !== 'info' && (
                        <span style={{ color: lc.text, flexShrink: 0, fontSize: '11px', fontWeight: 700, paddingTop: 1 }}>
                          {log.level.toUpperCase().slice(0, 5)}
                        </span>
                      )}
                      <span style={{ lineHeight: 1.7, wordBreak: 'break-all' }}>
                        <MessageLine message={log.message} />
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </Card>
    </div>
  );
}
