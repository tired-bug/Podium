import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, RefreshCw, Play, Square, RotateCcw, Trash2, Terminal,
  ChevronDown, ChevronRight, Eye, EyeOff, GitBranch, Sparkles,
  Package, Settings2, Cpu, Server, CheckCircle, Globe,
} from 'lucide-react';
import { Card, Badge, EmptyState, SectionHeader, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Modal, ConfirmDialog, Tabs } from '../components/ui/Modal';
import { useDeployments, Deployment } from '../hooks/useDeployments';
import { useRole } from '../hooks/useRole';
import { ViewerBanner } from '../components/ui/ViewerBanner';
import { useToast } from '../contexts/ToastContext';
import { timeAgo, parseApiError } from '../lib/utils';
import api from '../lib/api';

const FILTER_TABS = [
  { id: 'all',      label: 'All'      },
  { id: 'running',  label: 'Running'  },
  { id: 'building', label: 'Building' },
  { id: 'stopped',  label: 'Stopped'  },
  { id: 'failed',   label: 'Failed'   },
];

const STEPS = [
  { id: 'source',  label: 'Source',        icon: <GitBranch size={14} /> },
  { id: 'config',  label: 'Configuration', icon: <Settings2 size={14} /> },
  { id: 'resources', label: 'Resources',   icon: <Cpu size={14} />       },
  { id: 'review',  label: 'Review',        icon: <CheckCircle size={14} /> },
];

const EMPTY_FORM = {
  name: '',
  repo_url: '', branch: 'main', dockerfile_path: 'Dockerfile',
  image: '',
  ports: [{ host: '', container: '' }],
  env_vars: [{ key: '', value: '' }],
  memory_limit: '512m', cpu_limit: '0.5', restart_policy: 'unless-stopped', replicas: 1,
  health_check: '', volumes: '',
};

function StepBar({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {STEPS.map((s, i) => (
        <React.Fragment key={s.id}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: i < step ? 'var(--accent-green)' : i === step ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
              border: `2px solid ${i < step ? 'var(--accent-green)' : i === step ? 'var(--accent-blue)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: i <= step ? '#fff' : 'var(--text-muted)',
              fontSize: '12px', fontWeight: 700,
              transition: 'all 300ms',
              boxShadow: i === step ? '0 0 16px rgba(99,102,241,0.4)' : 'none',
            }}>
              {i < step ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: '10px', color: i === step ? 'var(--accent-blue-2)' : i < step ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: i === step ? 700 : 400, whiteSpace: 'nowrap' }}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < step ? 'var(--accent-green)' : 'var(--border)', margin: '0 8px', marginBottom: 20, transition: 'background 400ms' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function FieldGroup({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '.04em' }}>{title}</div>
      {hint && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', padding: '0 4px' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

function PortsEditor({ ports, onChange }: { ports: { host: string; container: string }[]; onChange: (v: any[]) => void }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', paddingLeft: 2 }}>Host Port</span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', paddingLeft: 2 }}>Container Port</span>
        <span />
      </div>
      {ports.map((p, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <Input
            value={p.host}
            onChange={e => { const a = [...ports]; a[i] = { ...a[i], host: e.target.value }; onChange(a); }}
            placeholder="8080"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
          />
          <Input
            value={p.container}
            onChange={e => { const a = [...ports]; a[i] = { ...a[i], container: e.target.value }; onChange(a); }}
            placeholder="80"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
          />
          <button onClick={() => onChange(ports.filter((_, j) => j !== i))} style={{
            width: 28, height: 28, borderRadius: 'var(--r-sm)', background: 'none',
            border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
          }}>✕</button>
        </div>
      ))}
      <button
        onClick={() => onChange([...ports, { host: '', container: '' }])}
        style={{ fontSize: '12px', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        + Add port mapping
      </button>
    </div>
  );
}

function EnvEditor({ envs, onChange }: { envs: { key: string; value: string }[]; onChange: (v: any[]) => void }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', paddingLeft: 2 }}>Variable Name</span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', paddingLeft: 2 }}>Value</span>
        <span />
      </div>
      {envs.map((e, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <Input
            value={e.key}
            onChange={ev => { const a = [...envs]; a[i] = { ...a[i], key: ev.target.value }; onChange(a); }}
            placeholder="DATABASE_URL"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', textTransform: 'uppercase' }}
          />
          <Input
            value={e.value}
            onChange={ev => { const a = [...envs]; a[i] = { ...a[i], value: ev.target.value }; onChange(a); }}
            placeholder="postgres://..."
            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
          />
          <button onClick={() => onChange(envs.filter((_, j) => j !== i))} style={{
            width: 28, height: 28, borderRadius: 'var(--r-sm)', background: 'none',
            border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
          }}>✕</button>
        </div>
      ))}
      <button
        onClick={() => onChange([...envs, { key: '', value: '' }])}
        style={{ fontSize: '12px', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        + Add variable
      </button>
    </div>
  );
}

function ResourceOption({ label, sub, value, current, onClick }: {
  label: string; sub: string; value: string; current: string; onClick: () => void;
}) {
  const active = current === value;
  return (
    <button onClick={onClick} style={{
      padding: '10px 12px', borderRadius: 'var(--r-md)',
      background: active ? 'rgba(99,102,241,0.1)' : 'var(--bg-tertiary)',
      border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border)'}`,
      cursor: 'pointer', textAlign: 'left', transition: 'all 150ms',
      boxShadow: active ? '0 0 12px rgba(99,102,241,0.15)' : 'none',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: active ? 'var(--accent-blue-2)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{label}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
    </button>
  );
}

function NewDeploymentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sourceMode, setSourceMode] = useState<'image' | 'repo'>('image');
  const { success, error: showError } = useToast();
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const update = useCallback((key: string, val: any) => setForm(f => ({ ...f, [key]: val })), []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (sourceMode === 'image' && !form.image.trim()) e.image = 'Docker image is required';
      if (sourceMode === 'repo' && !form.repo_url.trim()) e.repo_url = 'Repository URL is required';
    }
    if (step === 1 && !form.name.trim()) e.name = 'Name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };

  const handleClose = () => { onClose(); setStep(0); setForm({ ...EMPTY_FORM }); setErrors({}); };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await api.post('/api/deployments', {
        ...form,
        ports: form.ports.filter(p => p.host && p.container),
        env_vars: form.env_vars.filter(e => e.key),
      });
      success(`"${form.name}" created and deploying!`);
      onCreated();
      handleClose();
    } catch (err) {
      showError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="New Deployment" width={620}
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <Button variant="ghost" onClick={handleClose} disabled={loading}>Cancel</Button>
          <div style={{ flex: 1 }} />
          {step > 0 && <Button variant="secondary" onClick={() => setStep(s => s - 1)} disabled={loading}>← Back</Button>}
          {step < 3
            ? <Button variant="primary" onClick={next}>Continue →</Button>
            : <Button variant="primary" loading={loading} onClick={handleSubmit}>🚀 Deploy</Button>
          }
        </div>
      }
    >
      <StepBar step={step} />

      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['image', 'repo'] as const).map(m => (
              <button key={m} onClick={() => { setSourceMode(m); setErrors({}); }} style={{
                padding: '14px 16px', borderRadius: 'var(--r-lg)', cursor: 'pointer', textAlign: 'left',
                background: sourceMode === m ? 'rgba(99,102,241,0.08)' : 'var(--bg-tertiary)',
                border: `1px solid ${sourceMode === m ? 'var(--accent-blue)' : 'var(--border)'}`,
                transition: 'all 150ms',
                boxShadow: sourceMode === m ? '0 0 16px rgba(99,102,241,0.1)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {m === 'image' ? <Package size={14} color={sourceMode === m ? 'var(--accent-blue)' : 'var(--text-muted)'} /> : <GitBranch size={14} color={sourceMode === m ? 'var(--accent-blue)' : 'var(--text-muted)'} />}
                  <span style={{ fontSize: '13px', fontWeight: 700, color: sourceMode === m ? 'var(--accent-blue-2)' : 'var(--text-primary)' }}>
                    {m === 'image' ? 'Docker Image' : 'Git Repository'}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {m === 'image' ? 'Pull and run any public or private image' : 'Clone, build and deploy from source'}
                </span>
              </button>
            ))}
          </div>

          {sourceMode === 'image' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input
                label="Docker Image"
                value={form.image}
                onChange={e => { update('image', e.target.value); setErrors({}); }}
                placeholder="nginx:latest  ·  node:20-alpine  ·  myorg/myapp:v1.2"
                hint="Any Docker Hub image, or a full registry URL (ghcr.io/..., registry.example.com/...)"
                error={errors.image}
                required
              />
              <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Popular images:</strong>{' '}
                {['nginx:alpine', 'node:20-alpine', 'postgres:16', 'redis:7-alpine', 'python:3.12-slim'].map(img => (
                  <button key={img} onClick={() => update('image', img)} style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                    color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '11px',
                    fontFamily: 'var(--font-mono)', padding: '1px 7px', margin: '2px 3px',
                  }}>{img}</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input
                label="Repository URL"
                value={form.repo_url}
                onChange={e => { update('repo_url', e.target.value); setErrors({}); }}
                placeholder="https://github.com/your-org/your-repo"
                hint="Public GitHub, GitLab, or Gitea repository. Private repos require SSH keys configured on the server."
                error={errors.repo_url}
                required
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input
                  label="Branch"
                  value={form.branch}
                  onChange={e => update('branch', e.target.value)}
                  placeholder="main"
                  hint="Leave blank to use the default branch"
                />
                <Input
                  label="Dockerfile Path"
                  value={form.dockerfile_path}
                  onChange={e => update('dockerfile_path', e.target.value)}
                  placeholder="Dockerfile"
                  hint="Relative path from repo root"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Input
            label="Deployment Name"
            value={form.name}
            onChange={e => { update('name', e.target.value); setErrors({}); }}
            placeholder="my-api  ·  frontend-v2  ·  postgres-main"
            hint="Lowercase letters, numbers, and hyphens. This will identify your deployment everywhere."
            error={errors.name}
            required
          />

          <div>
            <FieldGroup
              title="Port Mappings"
              hint="Map ports from your host machine to ports inside the container. Example: 8080 → 80 means http://localhost:8080 reaches the container's port 80."
            />
            <PortsEditor ports={form.ports} onChange={v => update('ports', v)} />
          </div>

          <div>
            <FieldGroup
              title="Environment Variables"
              hint="Injected into your container at runtime. Use these for secrets, API keys, database URLs, and any config that varies per environment."
            />
            <EnvEditor envs={form.env_vars} onChange={v => update('env_vars', v)} />
          </div>

          <Input
            label="Volume Mounts (optional)"
            value={form.volumes}
            onChange={e => update('volumes', e.target.value)}
            placeholder="/host/path:/container/path  or  named-volume:/app/data"
            hint="Persist data between container restarts. Separate multiple mounts with commas."
          />

          <Input
            label="Health Check Endpoint (optional)"
            value={form.health_check}
            onChange={e => update('health_check', e.target.value)}
            placeholder="/health  ·  /api/status  ·  /ping"
            hint="Podium will poll this HTTP endpoint to confirm your app is alive. Leave blank to skip."
          />
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ padding: '12px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Resource limits prevent a single app from starving the rest of the server. Start conservative — you can always raise limits later without redeploying.
          </div>

          <div>
            <FieldGroup title="Memory Limit" hint="How much RAM the container is allowed to use before being OOM-killed and restarted." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { v: '128m', l: '128 MB', s: 'Static sites / tiny APIs' },
                { v: '256m', l: '256 MB', s: 'Light Node.js / Python' },
                { v: '512m', l: '512 MB', s: 'Standard (recommended)' },
                { v: '1g',   l: '1 GB',   s: 'Full-stack apps' },
                { v: '2g',   l: '2 GB',   s: 'Databases / ML models' },
                { v: '4g',   l: '4 GB',   s: 'Heavy workloads' },
              ].map(o => (
                <ResourceOption key={o.v} label={o.l} sub={o.s} value={o.v} current={form.memory_limit} onClick={() => update('memory_limit', o.v)} />
              ))}
            </div>
          </div>

          <div>
            <FieldGroup title="CPU Limit" hint="Maximum CPU cores the container may use. 1.0 = one full core." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { v: '0.25', l: '0.25 cores', s: 'Minimal' },
                { v: '0.5',  l: '0.5 cores',  s: 'Standard' },
                { v: '1',    l: '1 core',      s: 'Throughput' },
                { v: '2',    l: '2 cores',     s: 'Compute heavy' },
              ].map(o => (
                <ResourceOption key={o.v} label={o.l} sub={o.s} value={o.v} current={form.cpu_limit} onClick={() => update('cpu_limit', o.v)} />
              ))}
            </div>
          </div>

          <div>
            <FieldGroup title="Restart Policy" hint="What Podium should do if the container exits unexpectedly." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { v: 'unless-stopped', l: 'Unless stopped', s: 'Restart always, except after manual stop' },
                { v: 'always',         l: 'Always',         s: 'Restart even after reboot' },
                { v: 'on-failure',     l: 'On failure',     s: 'Only restart on non-zero exit' },
                { v: 'no',             l: 'Never',          s: 'Manual restart only' },
              ].map(o => (
                <ResourceOption key={o.v} label={o.l} sub={o.s} value={o.v} current={form.restart_policy} onClick={() => update('restart_policy', o.v)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Review before deploying</div>
          {[
            ['Name',        form.name || '(auto)'],
            ['Source',      form.repo_url || form.image || '—'],
            ['Branch',      form.repo_url ? form.branch : '—'],
            ['Dockerfile',  form.repo_url ? form.dockerfile_path : '—'],
            ['Memory',      form.memory_limit],
            ['CPU',         `${form.cpu_limit} cores`],
            ['Replicas',    String(form.replicas)],
            ['Restart',     form.restart_policy],
            ['Ports',       form.ports.filter(p => p.host).map(p => `${p.host}:${p.container}`).join(', ') || 'None'],
            ['Env Vars',    `${form.env_vars.filter(e => e.key).length} defined`],
            ['Health Check',form.health_check || 'None'],
            ['Volumes',     form.volumes || 'None'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)', gap: 12 }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0, minWidth: 100 }}>{k}</span>
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
  const [expanded, setExpanded]       = useState(false);
  const [showEnv, setShowEnv]         = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen]   = useState(false);
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
            <span
              style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}
              onClick={() => navigate(`/deployments/${dep.id}`)}
            >{dep.name}</span>
            <Badge variant="status" value={dep.status}>{dep.status}</Badge>
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
                  <span key={i} style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 'var(--r-sm)', color: 'var(--text-secondary)' }}>
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
        message={`Are you sure you want to delete "${dep.name}"? The container will be stopped and removed.`}
        confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleteOpen(false)} />
    </Card>
  );
}

export default function Deployments() {
  const { can } = useRole();
  const navigate = useNavigate();
  const { deployments, loading, refetch } = useDeployments(10000);
  const { success, error: toastError } = useToast();
  const [filter, setFilter] = useState('all');
  const [search, setSearch]   = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [clearFailedOpen, setClearFailedOpen] = useState(false);
  const [clearingFailed, setClearingFailed] = useState(false);

  const failedCount = deployments.filter(d => d.status === 'failed').length;

  const handleClearFailed = async () => {
    setClearingFailed(true);
    try {
      const res = await api.delete('/api/deployments/failed');
      success(`Cleared ${res.data.deleted} failed deployment${res.data.deleted === 1 ? '' : 's'}`);
      refetch();
    } catch (e) {
      toastError(parseApiError(e));
    } finally {
      setClearingFailed(false);
      setClearFailedOpen(false);
    }
  };

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
        subtitle={`${deployments.length} total`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<RefreshCw size={14} />} onClick={refetch} size="sm">Refresh</Button>
            {can.deleteDeployment && failedCount > 0 && (
              <Button variant="danger" icon={<Trash2 size={14} />} size="sm" onClick={() => setClearFailedOpen(true)}>
                Clear Failed ({failedCount})
              </Button>
            )}
            {can.createDeployment && (
              <>
                <Button variant="ghost" icon={<Sparkles size={14} />} onClick={() => navigate('/cloud')} size="sm">AI Deploy</Button>
                <Button variant="primary" icon={<Plus size={14} />} onClick={() => setNewOpen(true)}>New Deployment</Button>
              </>
            )}
          </div>
        }
      />

      <ConfirmDialog
        open={clearFailedOpen}
        title="Clear Failed Deployments"
        message={`This will permanently delete all ${failedCount} failed deployment record${failedCount === 1 ? '' : 's'}. This cannot be undone.`}
        confirmLabel="Clear Failed"
        onConfirm={handleClearFailed}
        onCancel={() => setClearFailedOpen(false)}
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Tabs tabs={FILTER_TABS.map(t => ({ ...t, count: counts[t.id] }))} active={filter} onChange={setFilter} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input placeholder="Search by name or repo..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14} />} />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 16 }}>
          {[1,2,3,4].map(i => <Card key={i}><Skeleton height={80} /></Card>)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🚀" title={search ? 'No deployments match your search' : 'No deployments yet'}
          description={search ? 'Try a different search term.' : 'Deploy your first app — paste a Docker image or point to a Git repo.'}
          action={!search ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" icon={<Sparkles size={14} />} onClick={() => navigate('/cloud')}>AI Deploy</Button>
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setNewOpen(true)}>New Deployment</Button>
            </div>
          ) : undefined}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 16 }}>
          {filtered.map(d => <DeploymentCard key={d.id} dep={d} onAction={refetch} />)}
        </div>
      )}

      <NewDeploymentModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={refetch} />
    </div>
  );
}
