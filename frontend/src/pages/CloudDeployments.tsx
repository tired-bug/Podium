import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, RefreshCw, Trash2, ExternalLink, Terminal, ChevronRight,
  Globe, GitBranch, Settings2, CheckCircle,
  Eye, EyeOff, X, AlertTriangle, Play,
} from 'lucide-react';
import { Card, Badge, EmptyState, SectionHeader, Skeleton, Spinner } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useRole } from '../hooks/useRole';
import { ViewerBanner } from '../components/ui/ViewerBanner';
import { timeAgo, parseApiError } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface CloudDep {
  id: string; provider: string; name: string; region?: string;
  status: string; url?: string; config: string; logs: string;
  provider_deployment_id?: string; provider_error?: string;
  created_at: string; updated_at: string;
}

interface ProviderMeta {
  id: string; name: string; connected: boolean; isDemo: boolean;
  regions?: string[];
}

// ── Provider logos (compact) ─────────────────────────────────────────────────
const LOGOS: Record<string, React.ReactNode> = {
  render: <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#46E3B7"/><path d="M10 5 L14 10 L10 15 L6 10 Z" fill="#fff" fillOpacity=".9"/></svg>,
  railway: <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#0B0D0E"/><rect x="4" y="9" width="12" height="2" rx="1" fill="#fff"/><rect x="6" y="5" width="2" height="10" rx="1" fill="#fff"/><rect x="12" y="5" width="2" height="10" rx="1" fill="#fff"/></svg>,
  vercel: <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#000"/><path d="M10 5 L16 15 H4 Z" fill="#fff"/></svg>,
  aws: <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#232F3E"/><text x="3" y="13" fontSize="8" fill="#FF9900" fontWeight="700">AWS</text></svg>,
  azure: <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#0078D4"/><path d="M6 14 L10 6 L12 10 L9 10 L13 14 Z" fill="#fff" fillOpacity=".9"/></svg>,
  gcp: <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#fff"/><circle cx="10" cy="10" r="6" fill="none" stroke="#4285F4" strokeWidth="2.5"/></svg>,
};

const STATUS_COLORS: Record<string, string> = {
  live: 'var(--accent-green)', building: 'var(--accent-blue)',
  deploying: 'var(--accent-cyan)', failed: 'var(--accent-red)',
  queued: 'var(--accent-orange)', suspended: 'var(--text-muted)',
};

// ── Deployment row ────────────────────────────────────────────────────────────

function DepRow({ dep, onRefresh }: { dep: CloudDep; onRefresh: () => void }) {
  const { can } = useRole();
  const { success, error: showError } = useToast();
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const statusColor = STATUS_COLORS[dep.status] || 'var(--text-muted)';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/providers/deployments/${dep.id}`);
      success(`Deleted "${dep.name}"`);
      onRefresh();
    } catch (e) {
      showError(parseApiError(e));
    } finally {
      setDeleting(false);
    }
  };

  const refreshStatus = async () => {
    setRefreshing(true);
    try {
      await api.get(`/api/providers/deployments/${dep.id}/status`);
      onRefresh();
    } catch {} finally {
      setRefreshing(false);
    }
  };

  const loadLogs = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    setLoadingLogs(true);
    try {
      const r = await api.get(`/api/providers/deployments/${dep.id}/logs`);
      setLogs(r.data || []);
    } catch {} finally {
      setLoadingLogs(false);
    }
  };

  const config = (() => { try { return JSON.parse(dep.config || '{}'); } catch { return {}; } })();

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
        <div style={{ flexShrink: 0 }}>{LOGOS[dep.provider] || <Globe size={18} />}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{dep.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 'var(--r-pill)', background: `${statusColor}18`, border: `1px solid ${statusColor}40` }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor }} />
              <span style={{ fontSize: '10px', fontWeight: 600, color: statusColor, textTransform: 'capitalize' }}>{dep.status}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{dep.provider}</span>
            {dep.region && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{dep.region}</span>}
            {config.repoUrl && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{config.repoUrl.replace('https://github.com/', '')}</span>}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Updated {timeAgo(dep.updated_at)}</span>
            {dep.provider_deployment_id && <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ID: {dep.provider_deployment_id}</span>}
            {dep.provider_error && <span style={{ fontSize: '11px', color: 'var(--accent-red)', fontWeight: 600 }}>⚠ {dep.provider_error}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {dep.url && (
            <Button size="sm" variant="ghost" icon={<ExternalLink size={11} />} onClick={() => window.open(dep.url, '_blank')}>Open</Button>
          )}
          <Button size="sm" variant="ghost" icon={<Terminal size={11} />} loading={loadingLogs && !expanded} onClick={loadLogs}>Logs</Button>
          <Button size="sm" variant="ghost" icon={<RefreshCw size={11} />} loading={refreshing} onClick={refreshStatus} />
          {can.deleteDeployment && (
            <Button size="sm" variant="danger" icon={<Trash2 size={11} />} loading={deleting} onClick={handleDelete} />
          )}
        </div>
      </div>

      {/* Log drawer */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-muted)', background: 'var(--bg-primary)', padding: '12px 16px', maxHeight: 200, overflowY: 'auto' }}>
          {loadingLogs ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Spinner size={14} color="var(--accent-blue)" />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading logs…</span>
            </div>
          ) : logs.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No logs available</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {logs.map((l, i) => (
                <div key={i} style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: l.level === 'error' ? 'var(--accent-red)' : l.level === 'warn' ? 'var(--accent-orange)' : 'var(--text-secondary)', display: 'flex', gap: 10 }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(l.time).toLocaleTimeString()}</span>
                  <span>{l.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Deploy Wizard ─────────────────────────────────────────────────────────────

type Step = 'provider' | 'project' | 'env' | 'review';
const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: 'provider', label: 'Provider', icon: <Globe size={13} /> },
  { id: 'project',  label: 'Project',  icon: <GitBranch size={13} /> },
  { id: 'env',      label: 'Environment', icon: <Settings2 size={13} /> },
  { id: 'review',   label: 'Review',   icon: <CheckCircle size={13} /> },
];

const RENDER_RUNTIMES = ['node', 'python', 'ruby', 'go', 'rust', 'docker', 'elixir'];
const RENDER_PLANS = ['free', 'starter', 'standard', 'pro', 'pro plus'];
const VERCEL_FRAMEWORKS = ['nextjs', 'create-react-app', 'vite', 'vue', 'svelte', 'nuxtjs', 'gatsby', 'remix', 'astro', 'other'];

const EMPTY_FORM = {
  provider: '',
  // Common
  name: '', repoUrl: '', branch: 'main',
  envVars: [{ key: '', value: '' }],
  // Render
  renderOwnerId: '', renderRuntime: 'node', renderRegion: 'oregon', renderPlan: 'free',
  buildCommand: '', startCommand: '',
  // Railway
  railwayProjectName: '', railwayTeamId: '',
  // Vercel
  vercelFramework: '', vercelRootDirectory: '', vercelOutputDirectory: '', vercelBuildCommand: '',
};

function DeployWizard({ providers, onClose, onDeployed }: {
  providers: ProviderMeta[];
  onClose: () => void;
  onDeployed: () => void;
}) {
  const { success, error: showError } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showVals, setShowVals] = useState<Record<number, boolean>>({});
  const [deploying, setDeploying] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [githubRepos, setGithubRepos] = useState<Array<{ fullName: string; defaultBranch: string }>>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [renderOwners, setRenderOwners] = useState<Array<{ id: string; name: string }>>([]);
  const [railwayWorkspaces, setRailwayWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [railwayAutoDetect, setRailwayAutoDetect] = useState(true);
  const [railwayWorkspaceError, setRailwayWorkspaceError] = useState<string | null>(null);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);

  const upd = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const stepId = STEPS[step].id;

  const connectedProviders = providers.filter(p => p.connected && !p.isDemo);
  const selectedProvider = providers.find(p => p.id === form.provider);

  // Load repos/workspaces when provider is selected
  useEffect(() => {
    if (!form.provider) return;
    if (form.provider === 'vercel') {
      setLoadingRepos(true);
      api.get('/api/providers/vercel/repos')
        .then(r => setGithubRepos(r.data || []))
        .catch(() => {})
        .finally(() => setLoadingRepos(false));
    }
    if (form.provider === 'render') {
      api.get('/api/providers/render/owners')
        .then(r => {
          const owners = r.data || [];
          setRenderOwners(owners);
          // Auto-select first owner if none selected yet
          if (owners.length > 0 && !form.renderOwnerId) {
            upd('renderOwnerId', owners[0].id);
          }
        })
        .catch(() => {});
    }
    if (form.provider === 'railway') {
      setLoadingWorkspaces(true);
      setRailwayWorkspaceError(null);
      api.get('/api/providers/railway/workspaces')
        .then(r => {
          const workspaces = r.data || [];
          setRailwayWorkspaces(workspaces);
          // Auto-select when there's only one option, or default to the first when auto-detect is on.
          if (workspaces.length >= 1 && railwayAutoDetect) {
            upd('railwayTeamId', workspaces[0].id);
          }
        })
        .catch((e: any) => {
          const msg = e?.response?.data?.error || e?.message || 'Failed to load workspaces';
          setRailwayWorkspaceError(msg);
        })
        .finally(() => setLoadingWorkspaces(false));
    }
  }, [form.provider]);

  // Re-apply automatic workspace selection whenever Auto Detect is toggled on
  useEffect(() => {
    if (form.provider !== 'railway') return;
    if (railwayWorkspaces.length > 1 && railwayAutoDetect) {
      upd('railwayTeamId', railwayWorkspaces[0].id);
    }
  }, [railwayAutoDetect]);

  const addEnvVar = () => upd('envVars', [...form.envVars, { key: '', value: '' }]);
  const removeEnvVar = (i: number) => upd('envVars', form.envVars.filter((_, idx) => idx !== i));
  const setEnvVar = (i: number, field: 'key' | 'value', v: string) => {
    const updated = [...form.envVars];
    updated[i] = { ...updated[i], [field]: v };
    upd('envVars', updated);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (step === 0 && !form.provider) e.provider = 'Select a provider';
    if (step === 1) {
      if (form.provider === 'render') {
        if (!form.name) e.name = 'Service name is required';
        if (!form.renderOwnerId) e.renderOwnerId = 'Owner ID is required';
        if (!form.renderRuntime) e.renderRuntime = 'Runtime is required';
        if (!form.renderRegion) e.renderRegion = 'Region is required';
        if (!form.renderPlan) e.renderPlan = 'Plan is required';
        if (!form.repoUrl) e.repoUrl = 'Repository is required';
        if (!form.branch) e.branch = 'Branch is required';
        if (form.renderRuntime !== 'docker') {
          if (!form.buildCommand.trim()) e.buildCommand = 'Build command is required';
          if (!form.startCommand.trim()) e.startCommand = 'Start command is required';
        }
      } else if (form.provider === 'railway') {
        if (!form.railwayProjectName) e.railwayProjectName = 'Project name is required';
        if (!form.repoUrl) e.repoUrl = 'Repository is required';
      } else if (form.provider === 'vercel') {
        if (!form.name) e.name = 'Project name is required';
        if (!form.repoUrl) e.repoUrl = 'Repository is required';
        if (!form.vercelFramework) e.vercelFramework = 'Framework is required';
      } else {
        if (!form.name) e.name = 'Project name is required';
        if (!form.repoUrl) e.repoUrl = 'Repository is required';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const isValid = (): boolean => {
    if (form.provider === 'render') {
      const cmdsOk = form.renderRuntime === 'docker' || (!!form.buildCommand.trim() && !!form.startCommand.trim());
      return !!(form.name && form.renderOwnerId && form.renderRuntime && form.renderRegion && form.renderPlan && form.repoUrl && form.branch && cmdsOk);
    }
    if (form.provider === 'railway') {
      return !!(form.railwayProjectName && form.repoUrl);
    }
    if (form.provider === 'vercel') {
      return !!(form.name && form.repoUrl && form.vercelFramework);
    }
    return false;
  };

  const next = () => { if (validate()) setStep(s => Math.min(s + 1, STEPS.length - 1)); };
  const back = () => setStep(s => Math.max(s - 1, 0));

  const deploy = async () => {
    setDeploying(true);
    try {
      const envVarsObj = Object.fromEntries(
        form.envVars.filter(e => e.key).map(e => [e.key, e.value])
      );

      const payload: Record<string, any> = {
        provider: form.provider,
        repoUrl: form.repoUrl || undefined,
        branch: form.branch || 'main',
        envVars: envVarsObj,
      };

      if (form.provider === 'render') {
        payload.name = form.name;
        payload.ownerId = form.renderOwnerId;
        payload.runtime = form.renderRuntime;
        payload.region = form.renderRegion;
        payload.plan = form.renderPlan;
        payload.buildCommand = form.buildCommand || undefined;
        payload.startCommand = form.startCommand || undefined;
      } else if (form.provider === 'railway') {
        payload.name = form.railwayProjectName;
        payload.projectName = form.railwayProjectName;
        if (form.railwayTeamId) payload.workspaceId = form.railwayTeamId;
      } else if (form.provider === 'vercel') {
        payload.name = form.name;
        payload.framework = form.vercelFramework;
        payload.rootDirectory = form.vercelRootDirectory || undefined;
        payload.outputDirectory = form.vercelOutputDirectory || undefined;
        payload.buildCommand = form.vercelBuildCommand || undefined;
      } else {
        payload.name = form.name;
      }

      await api.post('/api/providers/deploy', payload);
      success(`Deployment "${payload.name}" queued on ${selectedProvider?.name}`);
      onDeployed();
      onClose();
    } catch (e) {
      showError(parseApiError(e));
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', width: '100%', maxWidth: 580, boxShadow: 'var(--shadow-modal)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>New Cloud Deployment</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Deploy to a connected cloud provider</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
          </div>

          {/* Step bar */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: i < step ? 'var(--accent-green)' : i === step ? 'var(--accent-blue)' : 'var(--bg-tertiary)', border: `2px solid ${i < step ? 'var(--accent-green)' : i === step ? 'var(--accent-blue)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: i <= step ? '#fff' : 'var(--text-muted)', fontSize: '11px', fontWeight: 700, transition: 'all 300ms' }}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: '10px', color: i === step ? 'var(--accent-blue-2)' : i < step ? 'var(--accent-green)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: i < step ? 'var(--accent-green)' : 'var(--border)', margin: '0 8px', marginBottom: 16, transition: 'background 400ms' }} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '0 24px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Step 0: Provider selection */}
          {stepId === 'provider' && (
            <>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Choose where to deploy. Only connected providers are available.
              </div>
              {connectedProviders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                  <AlertTriangle size={32} color="var(--accent-orange)" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>No providers connected</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 16 }}>Connect Render, Railway, or Vercel in the Providers page first.</p>
                  <Button variant="primary" onClick={() => { onClose(); navigate('/providers'); }}>Go to Providers</Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {connectedProviders.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { upd('provider', p.id); if (p.id === 'render') upd('renderRegion', p.regions?.[0] || 'oregon'); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                        padding: '14px 16px', background: form.provider === p.id ? 'var(--accent-blue-dim)' : 'var(--bg-tertiary)',
                        border: `1px solid ${form.provider === p.id ? 'var(--accent-blue)' : 'var(--border)'}`,
                        borderRadius: 'var(--r-lg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', transition: 'all 150ms',
                      }}
                    >
                      {LOGOS[p.id]}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--accent-green)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle size={10} />Connected
                        </div>
                      </div>
                      {form.provider === p.id && <CheckCircle size={16} color="var(--accent-blue)" />}
                    </button>
                  ))}
                </div>
              )}
              {errors.provider && <span style={{ fontSize: '12px', color: 'var(--accent-red)' }}>{errors.provider}</span>}
            </>
          )}

          {/* Step 1: Project */}
          {stepId === 'project' && (
            <>
              {form.provider === 'render' && (
                <>
                  <Input label="Service Name" value={form.name} onChange={e => upd('name', e.target.value)} placeholder="my-api" error={errors.name} required />

                  {renderOwners.length > 0 ? (
                    <Select
                      label="Owner ID"
                      value={form.renderOwnerId}
                      onChange={e => upd('renderOwnerId', e.target.value)}
                      options={renderOwners.map(o => ({ value: o.id, label: o.name }))}
                      error={errors.renderOwnerId}
                    />
                  ) : (
                    <Input label="Owner ID" value={form.renderOwnerId} onChange={e => upd('renderOwnerId', e.target.value)} placeholder="usr-xxxxxxxx or tea-xxxxxxxx" error={errors.renderOwnerId} required />
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Select
                      label="Runtime"
                      value={form.renderRuntime}
                      onChange={e => upd('renderRuntime', e.target.value)}
                      options={RENDER_RUNTIMES.map(r => ({ value: r, label: r }))}
                      error={errors.renderRuntime}
                    />
                    <Select
                      label="Region"
                      value={form.renderRegion}
                      onChange={e => upd('renderRegion', e.target.value)}
                      options={(selectedProvider?.regions || ['oregon']).map(r => ({ value: r, label: r }))}
                      error={errors.renderRegion}
                    />
                  </div>

                  <Select
                    label="Plan"
                    value={form.renderPlan}
                    onChange={e => upd('renderPlan', e.target.value)}
                    options={RENDER_PLANS.map(p => ({ value: p, label: p }))}
                    error={errors.renderPlan}
                  />

                  <Input label="Repository" value={form.repoUrl} onChange={e => upd('repoUrl', e.target.value)} placeholder="https://github.com/org/repo" error={errors.repoUrl} icon={<GitBranch size={13} />} required />
                  <Input label="Branch" value={form.branch} onChange={e => upd('branch', e.target.value)} placeholder="main" error={errors.branch} required />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Input label="Build Command" value={form.buildCommand} onChange={e => upd('buildCommand', e.target.value)} placeholder="npm run build" required={form.renderRuntime !== 'docker'} error={errors.buildCommand} />
                    <Input label="Start Command" value={form.startCommand} onChange={e => upd('startCommand', e.target.value)} placeholder="npm start" required={form.renderRuntime !== 'docker'} error={errors.startCommand} />
                  </div>
                </>
              )}

              {form.provider === 'railway' && (
                <>
                  <Input label="Project Name" value={form.railwayProjectName} onChange={e => upd('railwayProjectName', e.target.value)} placeholder="my-railway-project" error={errors.railwayProjectName} required />

                  <Input label="Repository" value={form.repoUrl} onChange={e => upd('repoUrl', e.target.value)} placeholder="https://github.com/org/repo" error={errors.repoUrl} icon={<GitBranch size={13} />} required />
                  {form.repoUrl && (
                    <Input label="Branch" value={form.branch} onChange={e => upd('branch', e.target.value)} placeholder="main" />
                  )}

                  {/* Workspace selector — always shown for Railway */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)' }}>
                    {loadingWorkspaces ? (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Spinner size={11} color="var(--text-muted)" /> Loading workspaces…
                      </div>
                    ) : railwayWorkspaceError ? (
                      <>
                        <p style={{ fontSize: '11px', color: 'var(--color-error, #e53)', margin: 0 }}>
                          ⚠ {railwayWorkspaceError}
                        </p>
                        <Input
                          label="Workspace ID (manual)"
                          value={form.railwayTeamId}
                          onChange={e => upd('railwayTeamId', e.target.value)}
                          placeholder="Leave blank for personal account"
                        />
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                          Enter your Railway workspace ID, or leave blank to deploy to your personal account.
                        </p>
                      </>
                    ) : railwayWorkspaces.length > 0 ? (
                      <>
                        {railwayWorkspaces.length > 1 && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={railwayAutoDetect}
                              onChange={e => setRailwayAutoDetect(e.target.checked)}
                            />
                            Auto Detect Workspace
                          </label>
                        )}
                        <Select
                          label="Workspace"
                          value={form.railwayTeamId}
                          onChange={e => upd('railwayTeamId', e.target.value)}
                          options={railwayWorkspaces.map(w => ({ value: w.id, label: w.name }))}
                          disabled={railwayWorkspaces.length > 1 && railwayAutoDetect}
                        />
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                          {railwayWorkspaces.length > 1 && railwayAutoDetect
                            ? `Automatically using "${railwayWorkspaces.find(w => w.id === form.railwayTeamId)?.name || railwayWorkspaces[0].name}". Turn off to pick a different workspace.`
                            : 'Choose the workspace to deploy into.'}
                        </p>
                      </>
                    ) : (
                      <Input
                        label="Workspace ID (optional)"
                        value={form.railwayTeamId}
                        onChange={e => upd('railwayTeamId', e.target.value)}
                        placeholder="Leave blank for personal account"
                      />
                    )}
                  </div>
                </>
              )}

              {form.provider === 'vercel' && (
                <>
                  <Input label="Project Name" value={form.name} onChange={e => upd('name', e.target.value)} placeholder="my-frontend" error={errors.name} required />

                  <Input label="Repository" value={form.repoUrl} onChange={e => upd('repoUrl', e.target.value)} placeholder="https://github.com/org/repo" error={errors.repoUrl} icon={<GitBranch size={13} />} required />

                  {loadingRepos ? (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Spinner size={11} color="var(--text-muted)" /> Loading connected repos...
                    </div>
                  ) : githubRepos.length > 0 ? (
                    <div style={{ marginTop: -4, marginBottom: 4 }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Or pick from connected GitHub repos:</div>
                      <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {githubRepos.map(r => (
                          <button key={r.fullName} onClick={() => { upd('repoUrl', `https://github.com/${r.fullName}`); upd('branch', r.defaultBranch); upd('name', r.fullName.split('/')[1]); }}
                            style={{ padding: '6px 10px', background: form.repoUrl === `https://github.com/${r.fullName}` ? 'var(--accent-blue-dim)' : 'var(--bg-tertiary)', border: `1px solid ${form.repoUrl === `https://github.com/${r.fullName}` ? 'var(--accent-blue)' : 'var(--border)'}`, borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <GitBranch size={11} color="var(--text-muted)" />{r.fullName}
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{r.defaultBranch}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {form.repoUrl && (
                    <Input label="Branch" value={form.branch} onChange={e => upd('branch', e.target.value)} placeholder="main" />
                  )}

                  <Select
                    label="Framework"
                    value={form.vercelFramework}
                    onChange={e => upd('vercelFramework', e.target.value)}
                    options={[{ value: '', label: 'Select a framework' }, ...VERCEL_FRAMEWORKS.map(f => ({ value: f, label: f }))]}
                    error={errors.vercelFramework}
                  />

                  <Input label="Root Directory" value={form.vercelRootDirectory} onChange={e => upd('vercelRootDirectory', e.target.value)} placeholder="./ (repo root)" />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Input label="Build Command" value={form.vercelBuildCommand} onChange={e => upd('vercelBuildCommand', e.target.value)} placeholder="npm run build" />
                    <Input label="Output Directory" value={form.vercelOutputDirectory} onChange={e => upd('vercelOutputDirectory', e.target.value)} placeholder="dist" />
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 2: Environment */}
          {stepId === 'env' && (
            <>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Add environment variables for your deployment. Values are encrypted at rest.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form.envVars.map((ev, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'flex-start' }}>
                    <Input value={ev.key} onChange={e => setEnvVar(i, 'key', e.target.value)} placeholder="KEY" />
                    <div style={{ position: 'relative' }}>
                      <input
                        className="podium-input"
                        type={showVals[i] ? 'text' : 'password'}
                        value={ev.value}
                        onChange={e => setEnvVar(i, 'value', e.target.value)}
                        placeholder="value"
                        style={{ width: '100%', padding: '7px 30px 7px 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <button onClick={() => setShowVals(s => ({ ...s, [i]: !s[i] }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                        {showVals[i] ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                    <button onClick={() => removeEnvVar(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', paddingTop: 8 }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" icon={<Plus size={12} />} onClick={addEnvVar}>Add Variable</Button>
              </div>
            </>
          )}

          {/* Step 3: Review */}
          {stepId === 'review' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Provider', value: selectedProvider?.name },
                  ...(form.provider === 'render' ? [
                    { label: 'Service Name', value: form.name },
                    { label: 'Owner ID', value: form.renderOwnerId },
                    { label: 'Runtime', value: form.renderRuntime },
                    { label: 'Region', value: form.renderRegion },
                    { label: 'Plan', value: form.renderPlan },
                    { label: 'Repository', value: form.repoUrl },
                    { label: 'Branch', value: form.branch },
                    { label: 'Build Command', value: form.buildCommand || '—' },
                    { label: 'Start Command', value: form.startCommand || '—' },
                  ] : []),
                  ...(form.provider === 'railway' ? [
                    { label: 'Project Name', value: form.railwayProjectName },
                    { label: 'Repository', value: form.repoUrl },
                    ...(railwayWorkspaces.length > 0 ? [{
                      label: 'Workspace',
                      value: railwayWorkspaces.find(w => w.id === form.railwayTeamId)?.name || 'Personal Workspace',
                    }] : []),
                  ] : []),
                  ...(form.provider === 'vercel' ? [
                    { label: 'Project Name', value: form.name },
                    { label: 'Repository', value: form.repoUrl },
                    { label: 'Framework', value: form.vercelFramework },
                    { label: 'Root Directory', value: form.vercelRootDirectory || '—' },
                    { label: 'Build Command', value: form.vercelBuildCommand || '—' },
                    { label: 'Output Directory', value: form.vercelOutputDirectory || '—' },
                  ] : []),
                  { label: 'Env vars', value: `${form.envVars.filter(e => e.key).length} variables` },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{row.label}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600, fontFamily: ['Repository', 'Branch', 'Build Command', 'Start Command', 'Root Directory', 'Output Directory'].includes(row.label) ? 'var(--font-mono)' : undefined }}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 14px', background: 'var(--accent-blue-dim)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--accent-blue-2)' }}>
                ℹ️ Deployment will be triggered immediately after confirmation.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          {step > 0 && <Button variant="ghost" onClick={back}>Back</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" icon={<ChevronRight size={14} />} onClick={next} disabled={connectedProviders.length === 0}>
              Next
            </Button>
          ) : (
            <Button variant="primary" icon={<Play size={14} />} loading={deploying} disabled={!isValid()} onClick={deploy}>
              Deploy Now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string; name: string; status: string; url?: string; createdAt?: string;
}

function InventoryPanel({ providers }: { providers: ProviderMeta[] }) {
  const [inventory, setInventory] = useState<Record<string, InventoryItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { success, error: showError } = useToast();

  const load = useCallback(async () => {
    try {
      const r = await api.get('/api/providers/inventory');
      setInventory(r.data || {});
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await api.post('/api/providers/sync');
      success('Sync triggered — refreshing...');
      await load();
    } catch (e) { showError(parseApiError(e)); }
    finally { setSyncing(false); }
  };

  const connectedProviders = providers.filter(p => p.connected && !p.isDemo);
  if (connectedProviders.length === 0) return null;

  const totalResources = Object.values(inventory).reduce((s, arr) => s + arr.length, 0);

  return (
    <Card style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Provider Inventory</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>{totalResources} resources discovered across {connectedProviders.length} providers</div>
        </div>
        <Button size="sm" variant="ghost" icon={<RefreshCw size={12} className={syncing ? 'spin' : ''} />} onClick={triggerSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      </div>
      {loading ? (
        <Skeleton height={60} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {connectedProviders.map(p => {
            const items = inventory[p.id] || [];
            const live = items.filter(i => i.status === 'live').length;
            return (
              <div key={p.id} style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {LOGOS[p.id]}
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{items.length}</span> resources &nbsp;·&nbsp;
                  <span style={{ color: 'var(--accent-green)' }}>{live} live</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function CloudDeployments() {
  const { can } = useRole();
  const navigate = useNavigate();
  const [deps, setDeps] = useState<CloudDep[]>([]);
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { success, error: showError } = useToast();

  const load = useCallback(async () => {
    try {
      const [dRes, pRes] = await Promise.all([
        api.get('/api/providers/deployments'),
        api.get('/api/providers'),
      ]);
      setDeps(dRes.data || []);
      setProviders(pRes.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await api.post('/api/providers/sync');
      success('Synced provider deployments');
      await load();
    } catch (e) { showError(parseApiError(e)); }
    finally { setSyncing(false); }
  };

  const connectedCount = providers.filter(p => p.connected && !p.isDemo).length;

  const statGroups = [
    { label: 'Deployments', value: deps.length, color: 'var(--accent-blue)' },
    { label: 'Live', value: deps.filter(d => d.status === 'live').length, color: 'var(--accent-green)' },
    { label: 'Building', value: deps.filter(d => d.status === 'building' || d.status === 'deploying').length, color: 'var(--accent-cyan)' },
    { label: 'Failed', value: deps.filter(d => d.status === 'failed').length, color: 'var(--accent-red)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ViewerBanner page="Cloud Deployments" />
      <SectionHeader
        title="Cloud Deployments"
        subtitle="Manage deployments across Render, Railway, and Vercel"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button size="sm" variant="ghost" icon={<Globe size={13} />} onClick={() => navigate('/providers')}>
              {connectedCount} provider{connectedCount !== 1 ? 's' : ''} connected
            </Button>
            <Button size="sm" variant="ghost" icon={<RefreshCw size={13} className={syncing ? 'spin' : ''} />} onClick={triggerSync} disabled={syncing}>
              {syncing ? 'Syncing...' : 'Sync'}
            </Button>
            <Button size="sm" icon={<RefreshCw size={13} />} onClick={load}>Refresh</Button>
            {can.deleteDeployment && deps.some(d => d.status === 'failed') && (
              <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={async () => {
                try {
                  await api.delete('/api/providers/deployments/failed');
                  await load();
                } catch {}
              }}>Clear Failed</Button>
            )}
            {can.createDeployment && (
              <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setWizardOpen(true)}>
                New Deployment
              </Button>
            )}
          </div>
        }
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {statGroups.map(s => (
          <Card key={s.label} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Provider inventory */}
      <InventoryPanel providers={providers} />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <Card key={i}><Skeleton height={56} /></Card>)}
        </div>
      ) : deps.length === 0 ? (
        <EmptyState
          icon="🚀"
          title="No cloud deployments yet"
          description={connectedCount === 0 ? "Connect a cloud provider first, then deploy your projects." : "Deploy your first project to a connected provider."}
          action={
            connectedCount === 0
              ? <Button variant="primary" icon={<Globe size={14} />} onClick={() => navigate('/providers')}>Connect Provider</Button>
              : can.createDeployment ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setWizardOpen(true)}>New Deployment</Button> : undefined
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {deps.map(d => <DepRow key={d.id} dep={d} onRefresh={load} />)}
        </div>
      )}

      {wizardOpen && (
        <DeployWizard
          providers={providers}
          onClose={() => setWizardOpen(false)}
          onDeployed={load}
        />
      )}
    </div>
  );
}
