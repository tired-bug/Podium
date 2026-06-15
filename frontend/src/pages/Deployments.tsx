import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, RefreshCw, Play, Square, RotateCcw, Trash2, Terminal, ChevronDown, ChevronRight, Eye, EyeOff, GitBranch, Sparkles } from 'lucide-react';
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

const STEPS = ['Source', 'Configuration', 'Resources', 'Review'];

const EMPTY_FORM = {
  name: '', repo_url: '', branch: 'main', dockerfile_path: 'Dockerfile', image: '',
  ports: [{ host: '', container: '' }],
  env_vars: [{ key: '', value: '' }],
  memory_limit: '512m', cpu_limit: '0.5', restart_policy: 'unless-stopped', replicas: 1,
  health_check: '', volumes: '',
};

function PortRow({ port, index, ports, onChange }: { port: {host:string;container:string}; index: number; ports: any[]; onChange: (v: any[]) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
      <Input
        placeholder="Host port (e.g. 8080)"
        value={port.host}
        onChange={e => { const a = [...ports]; a[index] = { ...a[index], host: e.target.value }; onChange(a); }}
      />
      <Input
        placeholder="Container port (e.g. 80)"
        value={port.container}
        onChange={e => { const a = [...ports]; a[index] = { ...a[index], container: e.target.value }; onChange(a); }}
      />
      <Button variant="ghost" size="sm" onClick={() => onChange(ports.filter((_, j) => j !== index))}>✕</Button>
    </div>
  );
}

function EnvRow({ env, index, envs, onChange }: { env: {key:string;value:string}; index: number; envs: any[]; onChange: (v: any[]) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
      <Input
        placeholder="KEY"
        value={env.key}
        onChange={e => { const a = [...envs]; a[index] = { ...a[index], key: e.target.value }; onChange(a); }}
        style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
      />
      <Input
        placeholder="value"
        value={env.value}
        onChange={e => { const a = [...envs]; a[index] = { ...a[index], value: e.target.value }; onChange(a); }}
      />
      <Button variant="ghost" size="sm" onClick={() => onChange(envs.filter((_, j) => j !== index))}>✕</Button>
    </div>
  );
}

function NewDeploymentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { success, error: showError } = useToast();
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const update = useCallback((key: string, val: any) => setForm(f => ({ ...f, [key]: val })), []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (step === 0 && !form.repo_url && !form.image) e.source = 'Provide either a Git repo URL or a Docker image';
    if (step === 1 && !form.name) e.name = 'Deployment name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };

  const handleClose = () => { onClose(); setStep(0); setForm({ ...EMPTY_FORM }); setErrors({}); };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = {
        ...form,
        ports: form.ports.filter(p => p.host && p.container),
        env_vars: form.env_vars.filter(e => e.key),
      };
      await api.post('/api/deployments', payload);
      success(`"${form.name}" deployment created!`);
      onCreated();
      handleClose();
    } catch (err) {
      showError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="New Deployment" width={600}
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <Button variant="ghost" onClick={handleClose} disabled={loading}>Cancel</Button>
          <div style={{ flex: 1 }} />
          {step > 0 && <Button variant="secondary" onClick={() => setStep(s => s - 1)} disabled={loading}>Back</Button>}
          {step < 3
            ? <Button variant="primary" onClick={next}>Next →</Button>
            : <Button variant="primary" loading={loading} onClick={handleSubmit}>Deploy</Button>
          }
        </div>
      }
    >
      <div style={{ display: 'flex', gap: 0, marginBottom: 28 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: i === step ? 'var(--accent-blue)' : i < step ? 'var(--accent-green)' : 'var(--bg-tertiary)',
                border: `2px solid ${i === step ? 'var(--accent-blue)' : i < step ? 'var(--accent-green)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 700, color: i <= step ? '#fff' : 'var(--text-muted)',
              }}>{i < step ? '✓' : i + 1}</div>
              <div style={{ fontSize: '10px', color: i === step ? 'var(--accent-blue)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < step ? 'var(--accent-green)' : 'var(--border)', margin: '0 6px', marginBottom: 18 }} />
            )}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-muted)' }}>
            Provide either a Git repository (Podium will build it) or a pre-built Docker image.
          </div>
          <Input label="Git Repository URL" value={form.repo_url} onChange={e => update('repo_url', e.target.value)} placeholder="https://github.com/org/repo" hint="We'll clone this repo and build the Docker image" />
          <Input label="Branch" value={form.branch} onChange={e => update('branch', e.target.value)} placeholder="main" />
          <Input label="Dockerfile Path" value={form.dockerfile_path} onChange={e => update('dockerfile_path', e.target.value)} placeholder="Dockerfile" hint="Relative path from repo root" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0 8px' }}>OR use a pre-built image</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <Input label="Docker Image" value={form.image} onChange={e => update('image', e.target.value)} placeholder="nginx:latest, node:20-alpine, myrepo/myimage:tag" hint="Any public Docker Hub or registry image" />
          {errors.source && <div style={{ fontSize: '12px', color: 'var(--accent-red)', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--r-md)' }}>{errors.source}</div>}
        </div>
      )}

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Input
            label="Deployment Name"
            value={form.name}
            onChange={e => update('name', e.target.value)}
            placeholder="my-api, frontend-app, postgres-db"
            hint="Lowercase letters, numbers, and hyphens only"
            error={errors.name}
            required
          />

          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Port Mappings <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>— host:container</span>
            </div>
            {form.ports.map((p, i) => (
              <PortRow key={i} port={p} index={i} ports={form.ports} onChange={v => update('ports', v)} />
            ))}
            <Button size="sm" variant="ghost" onClick={() => update('ports', [...form.ports, { host: '', container: '' }])}>+ Add Port</Button>
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Environment Variables
            </div>
            {form.env_vars.map((e, i) => (
              <EnvRow key={i} env={e} index={i} envs={form.env_vars} onChange={v => update('env_vars', v)} />
            ))}
            <Button size="sm" variant="ghost" onClick={() => update('env_vars', [...form.env_vars, { key: '', value: '' }])}>+ Add Variable</Button>
          </div>

          <Input label="Volume Mounts (optional)" value={form.volumes} onChange={e => update('volumes', e.target.value)} placeholder="/host/path:/container/path" hint="Persist data between restarts" />
          <Input label="Health Check URL (optional)" value={form.health_check} onChange={e => update('health_check', e.target.value)} placeholder="/health or /api/status" hint="Podium will monitor this endpoint" />
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Set resource limits to prevent a single app from consuming all server resources.
          </div>
          <Select label="Memory Limit" value={form.memory_limit} onChange={e => update('memory_limit', e.target.value)}
            options={[
              { value: '128m', label: '128 MB — minimal (static sites)' },
              { value: '256m', label: '256 MB — light (small APIs)' },
              { value: '512m', label: '512 MB — standard (recommended)' },
              { value: '1g', label: '1 GB — heavy (databases, ML)' },
              { value: '2g', label: '2 GB — large workloads' },
              { value: '4g', label: '4 GB — very large' },
            ]}
          />
          <Select label="CPU Limit" value={form.cpu_limit} onChange={e => update('cpu_limit', e.target.value)}
            options={[
              { value: '0.25', label: '0.25 cores — minimal' },
              { value: '0.5', label: '0.5 cores — standard (recommended)' },
              { value: '1', label: '1 core — high throughput' },
              { value: '2', label: '2 cores — compute heavy' },
            ]}
          />
          <Select label="Restart Policy" value={form.restart_policy} onChange={e => update('restart_policy', e.target.value)}
            options={[
              { value: 'unless-stopped', label: 'Unless stopped — restart always except manual stop' },
              { value: 'always', label: 'Always — restart even after manual stop' },
              { value: 'on-failure', label: 'On failure — restart only on error exit' },
              { value: 'no', label: 'Never — do not auto-restart' },
            ]}
          />
          <Select label="Replicas" value={String(form.replicas)} onChange={e => update('replicas', parseInt(e.target.value))}
            options={[
              { value: '1', label: '1 replica — standard' },
              { value: '2', label: '2 replicas — basic redundancy' },
              { value: '3', label: '3 replicas — high availability' },
            ]}
          />
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Review before deploying</div>
          {[
            ['Name', form.name || '(auto-generated)'],
            ['Source', form.repo_url || form.image || '(none)'],
            ['Branch', form.repo_url ? form.branch : '—'],
            ['Memory', form.memory_limit],
            ['CPU', `${form.cpu_limit} cores`],
            ['Replicas', String(form.replicas)],
            ['Restart', form.restart_policy],
            ['Ports', form.ports.filter(p => p.host).map(p => `${p.host}:${p.container}`).join(', ') || 'None'],
            ['Env Vars', `${form.env_vars.filter(e => e.key).length} variable(s)`],
            ['Health Check', form.health_check || 'None'],
            ['Volumes', form.volumes || 'None'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)', gap: 12 }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
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
    <Card style={{ display: 'flex', flexDirection: 'column', animation: 'float-up 300ms ease-out both' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => navigate(`/deployments/${dep.id}`)}>{dep.name}</span>
            <Badge variant="status" value={dep.status}>{dep.status}</Badge>
            {!dep.container_id && dep.status !== 'pending' && (
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: 'var(--r-pill)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>demo</span>
            )}
          </div>
          {dep.repo_url && <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dep.repo_url}</div>}
          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><GitBranch size={10} />{dep.branch}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Updated {timeAgo(dep.updated_at)}</span>
            {dep.image && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{dep.image}</span>}
          </div>
        </div>

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

      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-muted)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {[
              ['Memory', dep.memory_limit], ['CPU', `${dep.cpu_limit} cores`],
              ['Restart', dep.restart_policy], ['Replicas', dep.replicas],
              ['Created', timeAgo(dep.created_at)], ['Container', dep.container_id?.slice(0, 12) || '—'],
            ].map(([k, v]) => (
              <div key={String(k)} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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

      <ConfirmDialog open={deleteOpen} title="Delete Deployment"
        message={`Are you sure you want to delete "${dep.name}"? This will stop and remove the container.`}
        confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleteOpen(false)} />
    </Card>
  );
}

export default function Deployments() {
  const { can } = useRole();
  const navigate = useNavigate();
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
            {can.createDeployment && (
              <>
                <Button variant="ghost" icon={<Sparkles size={14} />} onClick={() => navigate('/deploy')} size="sm">AI Deploy</Button>
                <Button variant="primary" icon={<Plus size={14} />} onClick={() => setNewModalOpen(true)}>New</Button>
              </>
            )}
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Tabs tabs={FILTER_TABS.map(t => ({ ...t, count: counts[t.id] }))} active={filter} onChange={setFilter} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input placeholder="Search deployments..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14} />} />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 16 }}>
          {[1,2,3,4].map(i => <Card key={i}><Skeleton height={80} /></Card>)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🚀" title={search ? 'No deployments match your search' : 'No deployments'}
          description={search ? 'Try a different search term.' : 'Create your first deployment to start managing containers.'}
          action={!search ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" icon={<Sparkles size={14} />} onClick={() => navigate('/deploy')}>AI Deploy</Button>
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setNewModalOpen(true)}>New Deployment</Button>
            </div>
          ) : undefined}
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
