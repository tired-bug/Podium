
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play, Square, RotateCcw, Hammer, ChevronRight } from 'lucide-react';
import { Card, Badge, Skeleton, SectionHeader } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Modal';
import { MetricChart } from '../components/charts/MetricChart';
import { useToast } from '../contexts/ToastContext';
import { timeAgo, parseApiError } from '../lib/utils';
import api from '../lib/api';

export function DeploymentDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [dep, setDep] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [logs, setLogs] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const logsRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.get(`/api/deployments/${id}`).then(r => setDep(r.data)).catch(() => navigate('/cloud')).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab !== 'logs' || !id) return;
    api.get(`/api/logs/${id}?limit=200`).then(r => setLogs(r.data)).catch(() => {});

    const es = new EventSource(`/api/logs/${id}/stream`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setLogs(l => [...l.slice(-500), data]);
      } catch {}
    };
    return () => es.close();
  }, [tab, id]);

  useEffect(() => {
    if (tab !== 'metrics' || !id) return;
    const from = Date.now() - 3600000;
    api.get(`/api/metrics/${id}?from=${from}&resolution=1m`).then(r => setMetrics(r.data.metrics || [])).catch(() => {});
  }, [tab, id]);

  useEffect(() => {
    if (autoScroll && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const doAction = async (action: string) => {
    if (!id) return;
    setActionLoading(action);
    try {
      await api.post(`/api/deployments/${id}/${action}`);
      success(`Deployment ${action}ed`);
      const r = await api.get(`/api/deployments/${id}`);
      setDep(r.data);
    } catch (err) { showError(parseApiError(err)); }
    finally { setActionLoading(null); }
  };

  if (loading) return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{[1, 2, 3].map(i => <Skeleton key={i} height={60} />)}</div>;
  if (!dep) return null;

  const logLevelColors: Record<string, string> = {
    error: 'var(--accent-red)', warn: 'var(--accent-orange)',
    warning: 'var(--accent-orange)', info: 'var(--text-secondary)', debug: 'var(--text-muted)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => navigate('/cloud')}>Deployments</Button>
        <ChevronRight size={14} color="var(--text-muted)" />
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{dep.name}</span>
        <Badge variant="status" value={dep.status}>{dep.status}</Badge>
      </div>

      {}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {dep.status !== 'running' && dep.status !== 'building' && (
          <Button variant="success" icon={<Play size={14} />} loading={actionLoading === 'start'} onClick={() => doAction('start')}>Start</Button>
        )}
        {dep.status === 'running' && (
          <>
            <Button variant="ghost" icon={<Square size={14} />} loading={actionLoading === 'stop'} onClick={() => doAction('stop')}>Stop</Button>
            <Button variant="ghost" icon={<RotateCcw size={14} />} loading={actionLoading === 'restart'} onClick={() => doAction('restart')}>Restart</Button>
          </>
        )}
        <Button variant="secondary" icon={<Hammer size={14} />} loading={actionLoading === 'rebuild'} onClick={() => doAction('rebuild')}>Rebuild</Button>
      </div>

      {}
      <Tabs
        tabs={[{ id: 'overview', label: 'Overview' }, { id: 'logs', label: 'Logs' }, { id: 'metrics', label: 'Metrics' }]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: 12 }}>Configuration</div>
            {[
              ['Image', dep.image || '—'], ['Branch', dep.branch], ['Dockerfile', dep.dockerfile_path],
              ['Memory', dep.memory_limit], ['CPU', `${dep.cpu_limit} cores`], ['Restart', dep.restart_policy],
              ['Container ID', dep.container_id?.slice(0, 12) || '—'], ['Created', timeAgo(dep.created_at)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-muted)', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{v}</span>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: 12 }}>Port Mappings</div>
            {dep.ports.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No ports configured</div> :
              dep.ports.map((p: any, i: number) => (
                <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid var(--border-muted)', color: 'var(--text-secondary)' }}>
                  0.0.0.0:{p.host} → {p.container}/tcp
                </div>
              ))
            }
          </Card>
        </div>
      )}

      {tab === 'logs' && (
        <Card style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Build Logs</span>
            <div style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
              Auto-scroll
            </label>
          </div>
          <div ref={logsRef} style={{ height: 500, overflowY: 'auto', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            {logs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>No logs yet...</div>
            ) : logs.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '2px 0', background: l.level === 'error' ? 'var(--accent-red-dim)' : l.level === 'warn' ? 'var(--accent-orange-dim)' : 'transparent', borderRadius: 3 }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '11px' }}>{new Date(l.timestamp).toLocaleTimeString()}</span>
                <span style={{ color: logLevelColors[l.level] || 'var(--text-muted)', flexShrink: 0, width: 40 }}>{l.level?.toUpperCase()}</span>
                <span style={{ color: 'var(--text-primary)' }}>{l.message}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'metrics' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card>
            <MetricChart data={metrics} lines={[{ key: 'cpu', label: 'CPU %', color: 'var(--accent-blue)' }]} type="area" unit="%" height={180} title="CPU Usage" yDomain={[0, 100]} />
          </Card>
          <Card>
            <MetricChart data={metrics} lines={[{ key: 'memory', label: 'Memory MB', color: 'var(--accent-purple)' }]} type="area" unit="MB" height={180} title="Memory Usage" />
          </Card>
          <Card>
            <MetricChart data={metrics} lines={[{ key: 'network_in', label: 'In KB/s', color: 'var(--accent-green)' }]} type="area" unit=" KB/s" height={180} title="Network In" />
          </Card>
          <Card>
            <MetricChart data={metrics} lines={[{ key: 'network_out', label: 'Out KB/s', color: 'var(--accent-orange)' }]} type="area" unit=" KB/s" height={180} title="Network Out" />
          </Card>
        </div>
      )}
    </div>
  );
}

export default DeploymentDetail;
