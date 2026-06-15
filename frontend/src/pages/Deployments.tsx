import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, RefreshCw, Play, Square, RotateCcw, Trash2, Terminal, ChevronDown, ChevronRight, Eye, EyeOff, GitBranch } from 'lucide-react';
import { Card, Badge, EmptyState, SectionHeader, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Modal, ConfirmDialog, Tabs, Select } from '../components/ui/Modal';
import { useDeployments, Deployment } from '../hooks/useDeployments';
import { useRole } from '../hooks/useRole';
import { ViewerBanner } from '../components/ui/ViewerBanner';
import { useToast } from '../contexts/ToastContext';
import { timeAgo, parseApiError } from '../lib/utils';
import api from '../lib/api';

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'building', label: 'Building' },
  { id: 'stopped', label: 'Stopped' },
  { id: 'failed', label: 'Failed' },
];

function NewDeploymentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const { success, error: showError } = useToast();
  const [form, setForm] = useState({
    name: '', repo_url: '', branch: 'main', dockerfile_path: 'Dockerfile', image: '',
    ports: [{ host: '', container: '' }],
    env_vars: [{ key: '', value: '' }],
    memory_limit: '512m', cpu_limit: '0.5', restart_policy: 'unless-stopped', replicas: 1,
  });

  const steps = ['Source', 'Configuration', 'Resources', 'Review'];

  const update = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = {
        ...form,
        ports: form.ports.filter(p => p.host && p.container),
        env_vars: form.env_vars.filter(e => e.key),
      };
      await api.post('/api/deployments', payload);
      success(`Deployment "${form.name || form.repo_url}" created!`);
      onCreated();
      onClose();
      setStep(0);
    } catch (err) {
      showError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Deployment" width={580}
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <div style={{ flex: 1 }} />
          {step > 0 && <Button variant="secondary" onClick={() => setStep(s => s - 1)} disabled={loading}>Back</Button>}
          {step < 3
            ? <Button variant="primary" onClick={() => setStep(s => s + 1)}>Next</Button>
            : <Button variant="primary" loading={loading} onClick={handleSubmit}>Deploy</Button>
          }
        </div>
      }
    >
      {/* Stepper */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
        {steps.map((s, i) => (
          <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: i === step ? 'var(--accent-blue)' : i < step ? 'var(--accent-green)' : 'var(--bg-tertiary)',
                border: `2px solid ${i === step ? 'var(--accent-blue)' : i < step ? 'var(--accent-green)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 700,
                color: i <= step ? '#fff' : 'var(--text-muted)',
              }}>{i < step ? '✓' : i + 1}</div>
              <div style={{ fontSize: '10px', color: i === step ? 'var(--accent-blue)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < step ? 'var(--accent-green)' : 'var(--border)', margin: '0 6px', marginBottom: 18 }} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Git Repository URL" value={form.repo_url} onChange={e => update('repo_url', e.target.value)} placeholder="https://github.com/org/repo" />
          <Input label="Branch" value={form.branch} onChange={e => update('branch', e.target.value)} placeholder="main" />
          <Input label="Dockerfile Path" value={form.dockerfile_path} onChange={e => update('dockerfile_path', e.target.value)} placeholder="Dockerfile" />
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>— or —</div>
          <Input label="Docker Image (if no repo)" value={form.image} onChange={e => update('image', e.target.value)} placeholder="nginx:latest or registry/image:tag" />
        </div>
      )}

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input label="Deployment Name" value={form.name} onChange={e => update('name', e.target.value)} placeholder="my-api-service" hint="Auto-generated from repo name if empty" />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Port Mappings</div>
            {form.ports.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                <Input placeholder="Host port (e.g. 8080)" value={p.host} onChange={e => { const arr = [...form.ports]; arr[i].host = e.target.value; update('ports', arr); }} />
                <Input placeholder="Container port (e.g. 80)" value={p.container} onChange={e => { const arr = [...form.ports]; arr[i].container = e.target.value; update('ports', arr); }} />
                <Button variant="ghost" size="sm" onClick={() => update('ports', form.ports.filter((_, j) => j !== i))}>✕</Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => update('ports', [...form.ports, { host: '', container: '' }])}>+ Add Port</Button>
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Environment Variables</div>
            {form.env_vars.map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                <Input placeholder="KEY" value={e.key} onChange={ev => { const arr = [...form.env_vars]; arr[i].key = ev.target.value; update('env_vars', arr); }} style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
                <Input placeholder="value" value={e.value} onChange={ev => { const arr = [...form.env_vars]; arr[i].value = ev.target.value; update('env_vars', arr); }} />
                <Button variant="ghost" size="sm" onClick={() => update('env_vars', form.env_vars.filter((_, j) => j !== i))}>✕</Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => update('env_vars', [...form.env_vars, { key: '', value: '' }])}>+ Add Variable</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select label="Memory Limit" value={form.memory_limit} onChange={e => update('memory_limit', e.target.value)}
            options={[{ value: '256m', label: '256 MB' }, { value: '512m', label: '512 MB' }, { value: '1g', label: '1 GB' }, { value: '2g', label: '2 GB' }, { value: '4g', label: '4 GB' }]} />
          <Select label="CPU Limit" value={form.cpu_limit} onChange={e => update('cpu_limit', e.target.value)}
            options={[{ value: '0.25', label: '0.25 cores' }, { value: '0.5', label: '0.5 cores' }, { value: '1', label: '1 core' }, { value: '2', label: '2 cores' }]} />
          <Select label="Restart Policy" value={form.restart_policy} onChange={e => update('restart_policy', e.target.value)}
            options={[{ value: 'unless-stopped', label: 'Unless Stopped' }, { value: 'always', label: 'Always' }, { value: 'on-failure', label: 'On Failure' }, { value: 'no', label: 'Never' }]} />
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['Name', form.name || '(auto-generated)'],
            ['Source', form.repo_url || form.image || '(none)'],
            ['Branch', form.branch],
            ['Memory', form.memory_limit],
            ['CPU', `${form.cpu_limit} cores`],
            ['Restart', form.restart_policy],
            ['Ports', form.ports.filter(p => p.host).map(p => `${p.host}:${p.container}`).join(', ') || 'None'],
            ['Env Vars', `${form.env_vars.filter(e => e.key).length} variables`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{k}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function DeploymentCard({ dep, onAction }: { dep: Deployment; onAction: () => void }) {
  const { can } = useRole();
  const [expanded, setExpanded] = useState(false);
  const [showEnv, setShowEnv] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const doAction = async (action: string) => {
    setActionLoading(action);
    try {
      await api.post(`/api/deployments/${dep.id}/${action}`);
      success(`Deployment ${action === 'start' ? 'started' : action === 'stop' ? 'stopped' : 'restarted'}`);
      onAction();
    } catch (err) { showError(parseApiError(err)); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/deployments/${dep.id}`);
      success('Deployment deleted');
      onAction();
    } catch (err) { showError(parseApiError(err)); }
  };

  return (
    <Card className="dep-card" style={{ display: 'flex', flexDirection: 'column', animation: 'float-up 300ms ease-out both' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => navigate(`/deployments/${dep.id}`)}>{dep.name}</span>
            <Badge variant="status" value={dep.status}>{dep.status}</Badge>
            {!dep.container_id && dep.status !== 'pending' && (
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: 'var(--r-pill)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                demo
              </span>
            )}
          </div>
          {dep.repo_url && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dep.repo_url}</div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <GitBranch size={10} />{dep.branch}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Updated {timeAgo(dep.updated_at)}</span>
            {dep.image && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{dep.image}</span>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {can.startStopRestart && dep.status !== 'running' && dep.status !== 'building' && (
            <Button size="sm" variant="success" icon={<Play size={11} />} loading={actionLoading === 'start'} onClick={() => doAction('start')}>Start</Button>
          )}
          {can.startStopRestart && dep.status === 'running' && (
            <>
              <Button size="sm" variant="ghost" icon={<Square size={11} />} loading={actionLoading === 'stop'} onClick={() => doAction('stop')}>Stop</Button>
              <Button size="sm" variant="ghost" icon={<RotateCcw size={11} />} loading={actionLoading === 'restart'} onClick={() => doAction('restart')}>Restart</Button>
            </>
          )}
          <Button size="sm" variant="ghost" icon={<Terminal size={11} />} onClick={() => navigate(`/deployments/${dep.id}?tab=logs`)}>Logs</Button>
          {can.deleteDeployment && <Button size="sm" variant="danger" icon={<Trash2 size={11} />} onClick={() => setDeleteOpen(true)}>Delete</Button>}
          <Button size="sm" variant="ghost" icon={expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />} onClick={() => setExpanded(e => !e)} />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-muted)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {[
              ['Memory', dep.memory_limit], ['CPU', `${dep.cpu_limit} cores`],
              ['Restart', dep.restart_policy], ['Replicas', dep.replicas],
              ['Created', timeAgo(dep.created_at)], ['Container', dep.container_id?.slice(0, 12) || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{v}</span>
              </div>
            ))}
          </div>

          {dep.ports.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 4 }}>PORTS</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {dep.ports.map((p, i) => (
                  <span key={i} style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
                    {p.host}:{p.container}
                  </span>
                ))}
              </div>
            </div>
          )}

          {dep.env_vars.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ENVIRONMENT ({dep.env_vars.length})</div>
                <button onClick={() => setShowEnv(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                  {showEnv ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              {showEnv && dep.env_vars.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                  <span style={{ color: 'var(--accent-blue)', minWidth: 120 }}>{e.key}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{e.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Deployment"
        message={`Are you sure you want to delete "${dep.name}"? This will stop and remove the container.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </Card>
  );
}

export default function Deployments() {
  const { can } = useRole();
  const { deployments, loading, refetch } = useDeployments(10000);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [newModalOpen, setNewModalOpen] = useState(false);

  const filtered = deployments.filter(d => {
    const matchFilter = filter === 'all' || d.status === filter;
    const matchSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.repo_url?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = FILTER_TABS.reduce((acc, t) => {
    acc[t.id] = t.id === 'all' ? deployments.length : deployments.filter(d => d.status === t.id).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ViewerBanner page="Deployments" />
      <SectionHeader
        title="Deployments"
        subtitle={`${deployments.length} total deployments`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<RefreshCw size={14} />} onClick={refetch} size="sm">Refresh</Button>
{can.createDeployment && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setNewModalOpen(true)}>New Deployment</Button>}
          </div>
        }
      />

      {/* Filter + Search */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Tabs tabs={FILTER_TABS.map(t => ({ ...t, count: counts[t.id] }))} active={filter} onChange={setFilter} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input
            placeholder="Search deployments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            icon={<Search size={14} />}
          />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4].map(i => <Card key={i}><Skeleton height={80} /></Card>)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🚀"
          title={search ? 'No deployments match your search' : 'No deployments'}
          description={search ? 'Try a different search term.' : 'Create your first deployment to start managing containers.'}
          action={!search ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setNewModalOpen(true)}>New Deployment</Button> : undefined}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 16 }}>
          {filtered.map(d => <DeploymentCard key={d.id} dep={d} onAction={refetch} />)}
        </div>
      )}

      <NewDeploymentModal open={newModalOpen} onClose={() => setNewModalOpen(false)} onCreated={refetch} />
    </div>
  );
}
