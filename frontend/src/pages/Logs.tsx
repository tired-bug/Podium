import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollText, Search, Trash2, ChevronDown } from 'lucide-react';
import { Card, EmptyState, SectionHeader, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Select, Tabs } from '../components/ui/Modal';
import { useDeployments } from '../hooks/useDeployments';
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

const LEVEL_TABS = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Errors' },
  { id: 'warn', label: 'Warnings' },
  { id: 'info', label: 'Info' },
];

export default function Logs() {
  const { deployments } = useDeployments();
  const { success, error: showError } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('all');
  const [deploymentId, setDeploymentId] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [offset, setOffset] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const LIMIT = 200;

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

  // Poll for new logs every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [deploymentId, level]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
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
    ...deployments.map(d => ({ value: d.id, label: d.name })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>
      <SectionHeader
        title="Logs"
        subtitle={`${total} total log entries`}
        action={
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
        }
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          value={deploymentId}
          onChange={e => setDeploymentId(e.target.value)}
          options={depOptions}
          wrapStyle={{ minWidth: 200 }}
        />
        <Tabs tabs={LEVEL_TABS} active={level} onChange={setLevel} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') fetchLogs(true); }}
            placeholder="Search logs... (press Enter)"
            style={{
              width: '100%', padding: '7px 10px 7px 32px',
              background: 'var(--bg-secondary)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none',
            }}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>
      </div>

      {/* Log viewer */}
      <Card style={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 500 }}>
        {/* Header bar */}
        <div style={{
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--bg-secondary)', flexShrink: 0,
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Showing {logs.length} of {total} entries
          </span>
        </div>

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
              flex: 1, overflowY: 'auto', padding: '8px 16px',
              fontFamily: 'var(--font-mono)', fontSize: '12px',
              background: 'var(--bg-primary)',
            }}
          >
            {/* Load more */}
            {logs.length < total && (
              <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                <Button size="sm" variant="ghost" icon={<ChevronDown size={13} />}
                  onClick={() => { setOffset(prev => prev + LIMIT); fetchLogs(); }}>
                  Load older logs
                </Button>
              </div>
            )}

            {logs.map((log, idx) => {
              const lc = LEVEL_COLORS[log.level?.toLowerCase()] || LEVEL_COLORS.info;
              return (
                <div key={`${log.id}-${idx}`} style={{
                  display: 'flex', gap: 12, padding: '1.5px 6px',
                  borderRadius: 3, background: lc.bg, marginBottom: 1,
                  alignItems: 'flex-start',
                }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '11px', paddingTop: 1 }}>
                    {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span style={{ color: lc.text, flexShrink: 0, width: 44, fontSize: '11px', fontWeight: 700, paddingTop: 1 }}>
                    {(log.level || 'INFO').toUpperCase().slice(0, 5)}
                  </span>
                  {log.deployment_name && (
                    <span style={{ color: 'var(--accent-purple)', flexShrink: 0, fontSize: '11px', paddingTop: 1 }}>
                      [{log.deployment_name}]
                    </span>
                  )}
                  <span style={{ color: 'var(--text-primary)', lineHeight: 1.5, wordBreak: 'break-all' }}>
                    {log.message}
                  </span>
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        )}
      </Card>
    </div>
  );
}
