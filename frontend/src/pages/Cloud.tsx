import React, { useState, useEffect } from 'react';
import { Server, Play, Square, RotateCcw, Trash2, Terminal, ExternalLink, Plus, RefreshCw, HardDrive, Cpu, Activity } from 'lucide-react';
import { Card, Badge, EmptyState, SectionHeader, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useRole } from '../hooks/useRole';
import { ViewerBanner } from '../components/ui/ViewerBanner';
import { timeAgo, parseApiError } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface Dep {
  id: string; name: string; status: string; image: string; repo_url: string;
  branch: string; ports: {host:string;container:string}[]; memory_limit: string;
  cpu_limit: string; container_id: string; created_at: string; updated_at: string;
}

function DepRow({ dep, onAction }: { dep: Dep; onAction: () => void }) {
  const { can } = useRole();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const doAction = async (action: string) => {
    setActionLoading(action);
    try {
      await api.post(`/api/deployments/${dep.id}/${action}`);
      success(`${action.charAt(0).toUpperCase() + action.slice(1)}ed "${dep.name}"`);
      onAction();
    } catch (err) { showError(parseApiError(err)); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/deployments/${dep.id}`);
      success(`Deleted "${dep.name}"`);
      onAction();
    } catch (err) { showError(parseApiError(err)); }
  };

  const port = dep.ports?.[0];

  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dep.status === 'running' ? 'var(--accent-green)' : dep.status === 'building' ? 'var(--accent-yellow)' : dep.status === 'failed' ? 'var(--accent-red)' : 'var(--text-muted)' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => navigate(`/deployments/${dep.id}`)}>{dep.name}</span>
          <Badge variant="status" value={dep.status}>{dep.status}</Badge>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {dep.image && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{dep.image}</span>}
          {port && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>:{port.host}</span>}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{dep.memory_limit} · {dep.cpu_limit} CPU</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Updated {timeAgo(dep.updated_at)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {port && dep.status === 'running' && (
          <Button size="sm" variant="ghost" icon={<ExternalLink size={11} />} onClick={() => window.open(`http://localhost:${port.host}`, '_blank')}>Open</Button>
        )}
        <Button size="sm" variant="ghost" icon={<Terminal size={11} />} onClick={() => navigate(`/deployments/${dep.id}?tab=logs`)}>Logs</Button>
        {can.startStopRestart && dep.status !== 'running' && dep.status !== 'building' && (
          <Button size="sm" variant="success" icon={<Play size={11} />} loading={actionLoading === 'start'} onClick={() => doAction('start')}>Start</Button>
        )}
        {can.startStopRestart && dep.status === 'running' && (
          <>
            <Button size="sm" variant="ghost" icon={<Square size={11} />} loading={actionLoading === 'stop'} onClick={() => doAction('stop')}>Stop</Button>
            <Button size="sm" variant="ghost" icon={<RotateCcw size={11} />} loading={actionLoading === 'restart'} onClick={() => doAction('restart')}>Restart</Button>
          </>
        )}
        {can.deleteDeployment && <Button size="sm" variant="danger" icon={<Trash2 size={11} />} onClick={() => setDeleteOpen(true)} />}
      </div>

      <ConfirmDialog open={deleteOpen} title="Delete App" message={`Delete "${dep.name}"? This stops and removes the container.`} confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleteOpen(false)} />
    </Card>
  );
}

export default function Hosting() {
  const { can } = useRole();
  const navigate = useNavigate();
  const [deps, setDeps] = useState<Dep[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, running: 0, stopped: 0, failed: 0 });

  const load = async () => {
    try {
      const res = await api.get('/api/deployments');
      const data: Dep[] = res.data;
      setDeps(data);
      setStats({
        total: data.length,
        running: data.filter(d => d.status === 'running').length,
        stopped: data.filter(d => d.status === 'stopped').length,
        failed: data.filter(d => d.status === 'failed').length,
      });
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ViewerBanner page="Hosting" />
      <SectionHeader
        title="Hosting"
        subtitle="All apps running on this Podium instance"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<RefreshCw size={14} />} onClick={load} size="sm">Refresh</Button>
            {can.createDeployment && (
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => navigate('/cloud')}>Deploy app</Button>
            )}
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Apps', value: stats.total, icon: <Server size={16} />, color: 'var(--accent-blue)' },
          { label: 'Running', value: stats.running, icon: <Activity size={16} />, color: 'var(--accent-green)' },
          { label: 'Stopped', value: stats.stopped, icon: <Square size={16} />, color: 'var(--text-muted)' },
          { label: 'Failed', value: stats.failed, icon: <HardDrive size={16} />, color: 'var(--accent-red)' },
        ].map(s => (
          <Card key={s.label} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <Card key={i}><Skeleton height={56} /></Card>)}
        </div>
      ) : deps.length === 0 ? (
        <EmptyState icon="🖥️" title="No apps hosted yet" description="Deploy your first app to get started."
          action={can.createDeployment ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => navigate('/cloud')}>Deploy app</Button> : undefined} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {deps.map(d => <DepRow key={d.id} dep={d} onAction={load} />)}
        </div>
      )}
    </div>
  );
}
