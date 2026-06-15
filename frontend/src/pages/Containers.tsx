import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Square, RotateCcw, Trash2, AlertCircle } from 'lucide-react';
import { Card, Badge, EmptyState, SectionHeader, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useRole } from '../hooks/useRole';
import { ViewerBanner } from '../components/ui/ViewerBanner';
import { timeAgo, parseApiError } from '../lib/utils';
import api from '../lib/api';

interface Container {
  id: string;
  shortId: string;
  name: string;
  image: string;
  status: string;
  statusText: string;
  ports: Array<{ IP?: string; PrivatePort: number; PublicPort?: number; Type: string }>;
  created: number;
}

const statusColor = (s: string) => {
  if (s === 'running') return 'var(--accent-green)';
  if (s === 'exited') return 'var(--text-muted)';
  if (s === 'paused') return 'var(--accent-yellow)';
  return 'var(--accent-orange)';
};

export default function Containers() {
  const { can } = useRole();
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [dockerError, setDockerError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Container | null>(null);
  const [search, setSearch] = useState('');
  const { success, error: showError } = useToast();

  const fetchContainers = useCallback(async () => {
    try {
      const { data } = await api.get('/api/containers');
      setContainers(data);
      setDockerError(null);
    } catch (err: any) {
      if (err?.response?.data?.dockerUnavailable) {
        setDockerError('Docker is not running or not accessible on this machine.');
      } else {
        setDockerError(err?.response?.data?.error || err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, 8000);
    return () => clearInterval(interval);
  }, [fetchContainers]);

  const doAction = async (id: string, action: string) => {
    setActionLoading(prev => ({ ...prev, [id]: action }));
    try {
      await api.post(`/api/containers/${id}/${action}`);
      success(`Container ${action}ed`);
      fetchContainers();
    } catch (err) { showError(parseApiError(err)); }
    finally { setActionLoading(prev => { const n = { ...prev }; delete n[id]; return n; }); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/containers/${deleteTarget.id}`);
      success('Container removed');
      setDeleteTarget(null);
      fetchContainers();
    } catch (err) { showError(parseApiError(err)); }
  };

  const filtered = containers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.image.toLowerCase().includes(search.toLowerCase())
  );

  const running = containers.filter(c => c.status === 'running').length;
  const stopped = containers.filter(c => c.status === 'exited').length;
  const paused = containers.filter(c => c.status === 'paused').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ViewerBanner page="Containers" />
      <SectionHeader
        title="Containers"
        subtitle="All Docker containers on this host"
        action={
          <Button icon={<RefreshCw size={14} />} onClick={fetchContainers}>Refresh</Button>
        }
      />

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Total', value: containers.length, color: 'var(--text-secondary)' },
          { label: 'Running', value: running, color: 'var(--accent-green)' },
          { label: 'Stopped', value: stopped, color: 'var(--text-muted)' },
          { label: 'Paused', value: paused, color: 'var(--accent-yellow)' },
        ].map(s => (
          <Card key={s.label} style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search containers by name or image..."
        style={{
          padding: '8px 12px', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '13px',
          fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', maxWidth: 360,
        }}
      />

      {/* Docker unavailable warning */}
      {dockerError && (
        <Card style={{ borderColor: 'var(--accent-orange)', background: 'var(--accent-orange-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={18} color="var(--accent-orange)" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-orange)' }}>Docker Unavailable</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 2 }}>{dockerError}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4].map(i => <Skeleton key={i} height={44} />)}
          </div>
        ) : filtered.length === 0 && !dockerError ? (
          <EmptyState icon="📦" title="No containers found" description={search ? 'No containers match your search.' : 'No Docker containers are running on this host.'} />
        ) : !dockerError ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['ID', 'Name', 'Image', 'Status', 'Ports', 'Created', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border-muted)' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>{c.shortId}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{c.name}</td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.image}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                        background: statusColor(c.status) + '22', color: statusColor(c.status),
                        fontSize: '11px', fontWeight: 600,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(c.status) }} />
                        {c.statusText || c.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {c.ports?.filter(p => p.PublicPort).map(p => `${p.PublicPort}:${p.PrivatePort}`).join(', ') || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(c.created * 1000)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {can.manageContainers && c.status !== 'running' && (
                          <Button size="sm" variant="success" icon={<Play size={10} />} loading={actionLoading[c.id] === 'start'} onClick={() => doAction(c.id, 'start')} />
                        )}
                        {can.manageContainers && c.status === 'running' && (
                          <>
                            <Button size="sm" variant="ghost" icon={<Square size={10} />} loading={actionLoading[c.id] === 'stop'} onClick={() => doAction(c.id, 'stop')} />
                            <Button size="sm" variant="ghost" icon={<RotateCcw size={10} />} loading={actionLoading[c.id] === 'restart'} onClick={() => doAction(c.id, 'restart')} />
                          </>
                        )}
                        {can.removeContainer && <Button size="sm" variant="danger" icon={<Trash2 size={10} />} onClick={() => setDeleteTarget(c)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Container"
        message={`Remove container "${deleteTarget?.name}"? The container will be forcefully stopped and deleted.`}
        confirmLabel="Remove"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
