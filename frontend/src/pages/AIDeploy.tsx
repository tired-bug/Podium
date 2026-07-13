import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Cpu, GitBranch, CheckCircle, AlertTriangle, ChevronRight,
  ExternalLink, RotateCcw, Zap, Package, Terminal, Play,
  Globe, Layers, Info, X, ChevronDown, RefreshCw, History as HistoryIcon,
} from 'lucide-react';
import { Card, Badge, SectionHeader, EmptyState } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';
import { useRole } from '../hooks/useRole';
import { ViewerBanner } from '../components/ui/ViewerBanner';
import { parseApiError, timeAgo } from '../lib/utils';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface GHRepo { id: number; full_name: string; name: string; default_branch: string; description?: string; private: boolean; language?: string; }
interface ProviderMeta { id: string; name: string; connected: boolean; }

interface DeploymentPlan {
  id: string; repoUrl: string; branch: string; provider: string;
  framework: string; runtime: string; packageManager: string; runtimeVersion?: string;
  buildCommand: string; installCommand: string; startCommand: string;
  outputDirectory: string; rootDirectory: string; envVarNames: string[];
  exposedPort: number; deploymentType: string;
  isMonorepo: boolean; monorepoServices?: Array<{ name: string; path: string; framework: string; runtime: string }>;
  confidence: number; reasoning: string; detectionPath: string;
  providerConfig: Record<string, any>;
  // detection fields (available on plan returned from server)
  hasDockerfile?: boolean; usesDatabase?: boolean; usesRedis?: boolean;
  hasBackgroundWorkers?: boolean; isSSR?: boolean;
}

interface EnvVar { key: string; value: string; show: boolean; }
interface LogLine { time: string; message: string; level?: string; }

interface CloudDep {
  id: string; provider: string; name: string; region?: string;
  status: string; url?: string; config: any;
  provider_error?: string; created_at: string; updated_at: string;
}

type Stage = 'select' | 'analyzing' | 'plan' | 'env' | 'deploying' | 'done' | 'failed';

// ── Provider logos ─────────────────────────────────────────────────────────────
const LOGOS: Record<string, React.ReactNode> = {
  render: <svg viewBox="0 0 32 32" width="28" height="28" fill="none"><rect width="32" height="32" rx="8" fill="#46E3B7"/><path d="M16 8L22 16L16 24L10 16Z" fill="#fff" fillOpacity=".9"/></svg>,
  railway: <svg viewBox="0 0 32 32" width="28" height="28" fill="none"><rect width="32" height="32" rx="8" fill="#0B0D0E"/><rect x="6" y="14" width="20" height="3" rx="1.5" fill="#fff"/><rect x="10" y="8" width="3" height="16" rx="1.5" fill="#fff"/><rect x="19" y="8" width="3" height="16" rx="1.5" fill="#fff"/></svg>,
  vercel: <svg viewBox="0 0 32 32" width="28" height="28" fill="none"><rect width="32" height="32" rx="8" fill="#000"/><path d="M16 8L26 24H6Z" fill="#fff"/></svg>,
};

const FRAMEWORK_ICONS: Record<string, string> = {
  nextjs: '▲', react: '⚛', vite: '⚡', vue: '💚', nuxt: '🟩',
  angular: '🅰', svelte: '🔶', sveltekit: '🔶', node: '🟢', express: '🟢',
  fastify: '⚡', nestjs: '🐱', python: '🐍', flask: '🌶', django: '🎸',
  fastapi: '🚀', go: '🐹', rust: '🦀', java: '☕', 'spring-boot': '🌱',
  php: '🐘', laravel: '🔴', dotnet: '💙', static: '📄', docker: '🐳',
  unknown: '❓',
};

const CONFIDENCE_COLOR = (c: number) =>
  c >= 0.85 ? 'var(--accent-green)' : c >= 0.65 ? 'var(--accent-orange)' : 'var(--accent-red)';

const STATUS_COLORS: Record<string, string> = {
  live: 'var(--accent-green)', building: 'var(--accent-blue)',
  deploying: 'var(--accent-cyan)', failed: 'var(--accent-red)',
  queued: 'var(--accent-orange)', suspended: 'var(--text-muted)',
};

// ── Small helpers ──────────────────────────────────────────────────────────────

function PlanRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)', gap: 12 }}>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function LogViewer({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [lines]);
  const color = (level?: string) =>
    level === 'error' ? 'var(--accent-red)' : level === 'warn' ? 'var(--accent-orange)' : 'var(--text-secondary)';
  return (
    <div ref={ref} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '12px 14px', maxHeight: 320, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: '1.6' }}>
      {lines.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Waiting for logs…</span>}
      {lines.map((l, i) => (
        <div key={i} style={{ color: color(l.level) }}>
          <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>{l.time.slice(11, 19)}</span>
          {l.message}
        </div>
      ))}
    </div>
  );
}

function HistoryRow({ dep, onRefresh }: { dep: CloudDep; onRefresh: () => void }) {
  const { can } = useRole();
  const { success, error: showError } = useToast();
  const [busy, setBusy] = useState(false);
  const statusColor = STATUS_COLORS[dep.status] || 'var(--text-muted)';
  const config = dep.config || {};

  const refreshStatus = async () => {
    setBusy(true);
    try {
      await api.get(`/api/providers/deployments/${dep.id}/status`);
      onRefresh();
    } catch {} finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/api/providers/deployments/${dep.id}`);
      success(`Deleted "${dep.name}"`);
      onRefresh();
    } catch (e) {
      showError(parseApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-muted)', borderRadius: 'var(--r-lg)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{dep.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 'var(--r-pill)', background: `${statusColor}18`, border: `1px solid ${statusColor}40` }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor }} />
            <span style={{ fontSize: '10px', fontWeight: 600, color: statusColor, textTransform: 'capitalize' }}>{dep.status}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{dep.provider}</span>
          {config.repoUrl && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{String(config.repoUrl).replace('https://github.com/', '')}</span>}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Updated {timeAgo(dep.updated_at)}</span>
          {dep.provider_error && <span style={{ fontSize: '11px', color: 'var(--accent-red)', fontWeight: 600 }}>⚠ {dep.provider_error}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {dep.url && <Button size="sm" variant="ghost" icon={<ExternalLink size={11} />} onClick={() => window.open(dep.url, '_blank')}>Open</Button>}
        <Button size="sm" variant="ghost" icon={<RefreshCw size={11} />} loading={busy} onClick={refreshStatus} />
        {can.deleteDeployment && <Button size="sm" variant="danger" icon={<X size={11} />} loading={busy} onClick={handleDelete} />}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type InputMode = 'repos' | 'upload' | 'static';
type PageTab = 'deploy' | 'history';

export default function AIDeploy() {
  const { can } = useRole();
  const { success, error: showError } = useToast();

  // Page-level tab (New Deployment vs History)
  const [pageTab, setPageTab] = useState<PageTab>('deploy');
  const [history, setHistory] = useState<CloudDep[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Stage
  const [stage, setStage] = useState<Stage>('select');

  // Input mode
  const [inputMode, setInputMode] = useState<InputMode>('repos');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadRepoName, setUploadRepoName] = useState('');
  const [uploadPrivate, setUploadPrivate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selection
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [repos, setRepos] = useState<GHRepo[]>([]);
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GHRepo | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderMeta | null>(null);
  const [branch, setBranch] = useState('main');
  const [selectedService, setSelectedService] = useState<string | undefined>();

  // Plan
  const [plan, setPlan] = useState<DeploymentPlan | null>(null);
  const [editedPlan, setEditedPlan] = useState<DeploymentPlan | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Env vars
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);

  // Deploy
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [deployStatus, setDeployStatus] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const [cloudDepId, setCloudDepId] = useState('');
  const [failure, setFailure] = useState<{ rootCause: string; fixes: string[]; canRedeploy: boolean } | null>(null);

  const sseRef = useRef<AbortController | null>(null);

  // Load providers & repos
  useEffect(() => {
    api.get('/api/providers').then(r => setProviders(r.data || [])).catch(() => {});
    api.get('/api/github/user-repos').then(r => setRepos(r.data || [])).catch(() => {});
  }, []);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    api.get('/api/providers/deployments')
      .then(r => setHistory(r.data || []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (pageTab === 'history') loadHistory();
  }, [pageTab, loadHistory]);

  const connectedProviders = providers.filter(p => p.connected && ['railway', 'render', 'vercel'].includes(p.id));

  // ── Upload zip → create GitHub repo → select it as the repo to analyze ──────

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', uploadFile);
      if (uploadRepoName.trim()) form.append('repoName', uploadRepoName.trim());
      form.append('private', String(uploadPrivate));

      const res = await api.post('/api/github/upload-zip', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      const { fullName, branch: defaultBranch } = res.data;

      success(`Created ${fullName} on GitHub (${res.data.fileCount} files)`);

      // Represent the freshly created repo as a selectable "repo" so the rest
      // of the flow (branch, provider, analyze) works unchanged.
      const syntheticRepo: GHRepo = {
        id: -Date.now(),
        full_name: fullName,
        name: fullName.split('/').pop() || fullName,
        default_branch: defaultBranch,
        private: uploadPrivate,
      };
      setSelectedRepo(syntheticRepo);
      setBranch(defaultBranch);
      setRepos(prev => [syntheticRepo, ...prev]);
    } catch (err: any) {
      showError(parseApiError(err));
    } finally {
      setUploading(false);
    }
  };

  // ── Analyze repo ───────────────────────────────────────────────────────────

  const analyze = async (servicePath?: string) => {
    if (!selectedRepo || !selectedProvider) return;
    setStage('analyzing');
    setAnalyzing(true);
    setPlan(null);
    setEditedPlan(null);
    setSelectedService(servicePath);
    try {
      const res = await api.post('/api/ai-deploy/plan', {
        repoUrl: `https://github.com/${selectedRepo.full_name}`,
        branch,
        provider: selectedProvider.id,
        selectedServicePath: servicePath,
        forceStatic: inputMode === 'static',
      });
      const p: DeploymentPlan = res.data.plan;
      setPlan(p);
      setEditedPlan({ ...p });
      // Pre-populate env var keys from detected names
      setEnvVars(p.envVarNames.map(k => ({ key: k, value: '', show: false })));
      setStage('plan');
    } catch (err: any) {
      showError(parseApiError(err));
      setStage('select');
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Execute plan ──────────────────────────────────────────────────────────

  const executePlan = async () => {
    if (!editedPlan) return;
    setStage('deploying');
    setLogs([]);
    setDeployStatus('building');
    setDeployUrl('');
    setCloudDepId('');
    setFailure(null);

    // Merge env vars into plan (keys only — values from UI)
    const planToSend = {
      ...editedPlan,
      envVars: Object.fromEntries(envVars.filter(e => e.key && e.value).map(e => [e.key, e.value])),
    };

    const ctrl = new AbortController();
    sseRef.current = ctrl;

    try {
      const resp = await fetch('/api/ai-deploy/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('podium_token') || ''}`,
        },
        body: JSON.stringify({ plan: planToSend }),
        signal: ctrl.signal,
      });

      const contentType = resp.headers.get('content-type') || '';
      if (!resp.ok || !contentType.includes('text/event-stream')) {
        // Server returned a plain error (e.g. JSON 400/401/500) instead of an
        // SSE stream — surface the real message rather than falling through
        // to a fake "done" state.
        let msg = `Request failed (${resp.status})`;
        try {
          const body = await resp.json();
          msg = body.error || body.message || msg;
        } catch {}
        setLogs(prev => [...prev, { time: new Date().toISOString(), message: msg, level: 'error' }]);
        setStage('failed');
        return;
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let sawDone = false;
      let sawError = false;

      if (!reader) throw new Error('No response body');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const ev = JSON.parse(raw);
            if (ev.type === 'log') {
              setLogs(prev => [...prev, { time: new Date().toISOString(), message: ev.message || '', level: ev.level }]);
            } else if (ev.type === 'status') {
              setDeployStatus(ev.status || '');
            } else if (ev.type === 'url') {
              setDeployUrl(ev.url || '');
            } else if (ev.type === 'error') {
              sawError = true;
              setLogs(prev => [...prev, { time: new Date().toISOString(), message: ev.message || 'Error', level: 'error' }]);
            } else if (ev.type === 'done') {
              sawDone = true;
              if (ev.cloudDeploymentId) setCloudDepId(ev.cloudDeploymentId);
              if (ev.url) setDeployUrl(ev.url);
              setDeployStatus(ev.status || 'done');
            }
          } catch {}
        }
      }

      if (sawError && !sawDone) {
        // Error event fired and the stream never reached a real completion signal
        setStage('failed');
      } else if (!sawDone) {
        // Connection closed with no completion signal at all — treat as failure,
        // not success, so we never show a fake "Deployment Live" screen.
        setLogs(prev => [...prev, { time: new Date().toISOString(), message: 'Connection closed before deployment completed', level: 'error' }]);
        setStage('failed');
      } else {
        setStage('done');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setLogs(prev => [...prev, { time: new Date().toISOString(), message: err.message || 'Connection error', level: 'error' }]);
        setStage('failed');
      }
    }
  };

  // Determine if deployment succeeded based on status / logs
  useEffect(() => {
    if (stage !== 'done') return;
    if (deployStatus === 'failed' || logs.some(l => l.level === 'error' && l.message.includes('❌'))) {
      setStage('failed');
      if (cloudDepId) {
        api.get(`/api/ai-deploy/analyze/${cloudDepId}`)
          .then(r => setFailure(r.data))
          .catch(() => {});
      }
    }
  }, [stage, deployStatus]);

  const redeploy = async () => {
    if (!cloudDepId) return;
    setStage('deploying');
    setLogs([]);
    setFailure(null);
    const ctrl = new AbortController();
    sseRef.current = ctrl;
    try {
      const resp = await fetch('/api/ai-deploy/redeploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('podium_token') || ''}`,
        },
        body: JSON.stringify({ cloudDeploymentId: cloudDepId }),
        signal: ctrl.signal,
      });
      const contentType = resp.headers.get('content-type') || '';
      if (!resp.ok || !contentType.includes('text/event-stream')) {
        let msg = `Request failed (${resp.status})`;
        try {
          const body = await resp.json();
          msg = body.error || body.message || msg;
        } catch {}
        setLogs(prev => [...prev, { time: new Date().toISOString(), message: msg, level: 'error' }]);
        setStage('failed');
        return;
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let sawDone = false;
      let sawError = false;
      if (!reader) throw new Error('No response body');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6).trim());
            if (ev.type === 'log') setLogs(prev => [...prev, { time: new Date().toISOString(), message: ev.message || '', level: ev.level }]);
            if (ev.type === 'error') {
              sawError = true;
              setLogs(prev => [...prev, { time: new Date().toISOString(), message: ev.message || 'Error', level: 'error' }]);
            }
            if (ev.type === 'done') { sawDone = true; setDeployStatus(ev.status || 'done'); }
          } catch {}
        }
      }

      if (!sawDone || sawError) {
        if (!sawDone) setLogs(prev => [...prev, { time: new Date().toISOString(), message: 'Connection closed before redeploy completed', level: 'error' }]);
        setStage('failed');
      } else {
        setStage('done');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') setStage('failed');
    }
  };

  const reset = () => {
    sseRef.current?.abort();
    setStage('select');
    setPlan(null); setEditedPlan(null);
    setLogs([]); setDeployStatus(''); setDeployUrl('');
    setCloudDepId(''); setFailure(null); setSelectedService(undefined);
  };

  const updatePlan = (key: keyof DeploymentPlan, value: any) =>
    setEditedPlan(p => p ? { ...p, [key]: value } : p);

  // ── Render ─────────────────────────────────────────────────────────────────

  const filteredRepos = repos.filter(r =>
    !repoSearch || r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  ).slice(0, 60);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ViewerBanner page="AI Deploy" />
      <SectionHeader
        title="AI Deployment Engine"
        subtitle="Select a repository and provider — the AI handles everything else"
        action={
          pageTab === 'deploy' && stage !== 'select' && (
            <Button variant="ghost" size="sm" icon={<X size={13} />} onClick={reset}>Start Over</Button>
          )
        }
      />

      <div style={{ display: 'flex', gap: 6, padding: 4, background: 'var(--bg-tertiary)', borderRadius: 'var(--r-lg)', width: 'fit-content' }}>
        {([
          { id: 'deploy', label: 'New Deployment', icon: <Play size={13} /> },
          { id: 'history', label: 'History', icon: <HistoryIcon size={13} /> },
        ] as { id: PageTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.id}
            onClick={() => setPageTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: pageTab === t.id ? 'var(--accent-blue-dim)' : 'transparent',
              border: `1px solid ${pageTab === t.id ? 'var(--accent-blue)' : 'transparent'}`,
              borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
              color: pageTab === t.id ? 'var(--accent-blue-2)' : 'var(--text-muted)',
              fontFamily: 'var(--font-sans)', transition: 'all 120ms',
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {pageTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {historyLoading && history.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '20px 0' }}>Loading deployments…</div>
          ) : history.length === 0 ? (
            <EmptyState icon={<HistoryIcon size={28} />} title="No deployments yet" description="Deployments you create with AI Deploy or Cloud Deploy will show up here." />
          ) : (
            history.map(dep => <HistoryRow key={dep.id} dep={dep} onRefresh={loadHistory} />)
          )}
        </div>
      )}

      {/* ── Input mode switcher ─────────────────────────────────────────────── */}
      {pageTab === 'deploy' && (stage === 'select' || stage === 'analyzing') && (
        <div style={{ display: 'flex', gap: 6, padding: 4, background: 'var(--bg-tertiary)', borderRadius: 'var(--r-lg)', width: 'fit-content' }}>
          {([
            { id: 'repos', label: 'My Repos', icon: <GitBranch size={13} /> },
            { id: 'upload', label: 'Upload ZIP', icon: <Package size={13} /> },
            { id: 'static', label: 'Quick Static Site', icon: <Layers size={13} /> },
          ] as { id: InputMode; label: string; icon: React.ReactNode }[]).map(m => (
            <button key={m.id}
              onClick={() => { setInputMode(m.id); setSelectedRepo(null); setUploadFile(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                background: inputMode === m.id ? 'var(--accent-blue-dim)' : 'transparent',
                border: `1px solid ${inputMode === m.id ? 'var(--accent-blue)' : 'transparent'}`,
                borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                color: inputMode === m.id ? 'var(--accent-blue-2)' : 'var(--text-muted)',
                fontFamily: 'var(--font-sans)', transition: 'all 120ms',
              }}>
              {m.icon}{m.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Stage: SELECT ───────────────────────────────────────────────────── */}
      {pageTab === 'deploy' && (stage === 'select' || stage === 'analyzing') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Repository picker — "My Repos" mode */}
          {inputMode === 'repos' && (
          <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={15} color="var(--accent-blue)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Repository</span>
            </div>
            {repos.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                No GitHub repos — connect your GitHub account in Settings first.
              </div>
            ) : (
              <>
                <input
                  value={repoSearch}
                  onChange={e => setRepoSearch(e.target.value)}
                  placeholder="Search repositories…"
                  style={{ padding: '7px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                />
                <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filteredRepos.map(r => {
                    const sel = selectedRepo?.id === r.id;
                    return (
                      <button key={r.id} onClick={() => { setSelectedRepo(r); setBranch(r.default_branch); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: sel ? 'var(--accent-blue-dim)' : 'var(--bg-tertiary)', border: `1px solid ${sel ? 'var(--accent-blue)' : 'var(--border)'}`, borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', transition: 'all 100ms' }}>
                        {r.private
                          ? <svg width="11" height="11" viewBox="0 0 16 16" fill="var(--accent-orange)"><path d="M4 7V5a4 4 0 1 1 8 0v2h1a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1zm2-2a2 2 0 1 1 4 0v2H6V5z"/></svg>
                          : <svg width="11" height="11" viewBox="0 0 16 16" fill="var(--text-muted)"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8V1.5Z"/></svg>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.full_name}</div>
                          {r.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {r.language && <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r.language}</span>}
                          {sel && <CheckCircle size={12} color="var(--accent-blue)" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedRepo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>Branch</label>
                    <input value={branch} onChange={e => setBranch(e.target.value)}
                      style={{ flex: 1, padding: '5px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', outline: 'none' }} />
                  </div>
                )}
              </>
            )}
          </Card>
          )}

          {/* Upload ZIP mode */}
          {(inputMode === 'upload' || inputMode === 'static') && (
          <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={15} color="var(--accent-blue)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {inputMode === 'static' ? 'Static Site Files (.zip)' : 'Upload Project (.zip)'}
              </span>
            </div>

            {selectedRepo ? (
              <div style={{ padding: '14px 16px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={16} color="var(--accent-green)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedRepo.full_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pushed to GitHub — ready to analyze</div>
                </div>
                <button onClick={() => { setSelectedRepo(null); setUploadFile(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {inputMode === 'static'
                    ? 'Zip your HTML/CSS/JS (or any static build output) and upload it. Podium pushes it to a new GitHub repo and deploys it as a static site — no build step needed.'
                    : 'Upload a zip of your project. Podium creates a new GitHub repo from it, then the AI analyzes it exactly like any connected repo.'}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '20px 16px', background: 'var(--bg-tertiary)', border: '1px dashed var(--border)',
                    borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: '12px', color: uploadFile ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-sans)', fontWeight: 600,
                  }}
                >
                  <Package size={16} />
                  {uploadFile ? uploadFile.name : 'Choose a .zip file'}
                </button>

                <input
                  value={uploadRepoName}
                  onChange={e => setUploadRepoName(e.target.value)}
                  placeholder={inputMode === 'static' ? 'Repo name (e.g. my-landing-page)' : 'Repo name (optional — auto-generated if blank)'}
                  style={{ padding: '7px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', outline: 'none' }}
                />

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={uploadPrivate} onChange={e => setUploadPrivate(e.target.checked)} />
                  Make the GitHub repo private
                </label>

                <Button
                  variant="primary"
                  icon={uploading ? undefined : <Package size={14} />}
                  loading={uploading}
                  disabled={!uploadFile || uploading}
                  onClick={handleUpload}
                >
                  {uploading ? 'Uploading & pushing to GitHub…' : 'Upload & Continue'}
                </Button>
              </>
            )}
          </Card>
          )}

          {/* Provider picker */}
          <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={15} color="var(--accent-blue)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Provider</span>
            </div>
            {connectedProviders.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <AlertTriangle size={28} color="var(--accent-orange)" style={{ marginBottom: 10 }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No providers connected</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Connect Railway, Render, or Vercel in the Providers page first.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {connectedProviders.map(p => {
                  const sel = selectedProvider?.id === p.id;
                  return (
                    <button key={p.id} onClick={() => setSelectedProvider(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: sel ? 'var(--accent-blue-dim)' : 'var(--bg-tertiary)', border: `1px solid ${sel ? 'var(--accent-blue)' : 'var(--border)'}`, borderRadius: 'var(--r-lg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', transition: 'all 150ms' }}>
                      {LOGOS[p.id] || <Globe size={28} color="var(--text-muted)" />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}><CheckCircle size={10} />Connected</div>
                      </div>
                      {sel && <CheckCircle size={16} color="var(--accent-blue)" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: 8 }}>
              <Button
                variant="primary"
                icon={analyzing ? undefined : <Zap size={14} />}
                loading={analyzing}
                disabled={!selectedRepo || !selectedProvider || analyzing}
                onClick={() => analyze()}
                style={{ width: '100%' }}
              >
                {analyzing ? 'Analyzing repository…' : 'Analyze & Build Plan'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Stage: PLAN ────────────────────────────────────────────────────── */}
      {pageTab === 'deploy' && stage === 'plan' && editedPlan && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Confidence + framework header */}
          <Card style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: '36px', lineHeight: 1 }}>{FRAMEWORK_ICONS[editedPlan.framework] || '❓'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{editedPlan.framework}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>·</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{editedPlan.runtime}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>·</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{editedPlan.deploymentType}</span>
                  {editedPlan.isMonorepo && (
                    <span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--accent-purple-dim, rgba(147,51,234,0.15))', color: 'var(--accent-purple, #a855f7)', borderRadius: 4, fontWeight: 600 }}>MONOREPO</span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{editedPlan.reasoning}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: CONFIDENCE_COLOR(editedPlan.confidence) }}>
                  {Math.round(editedPlan.confidence * 100)}%
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>confidence</div>
              </div>
            </div>
            {editedPlan.isMonorepo && editedPlan.monorepoServices && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>MONOREPO SERVICES — click to deploy that service</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {editedPlan.monorepoServices.map(s => (
                    <button key={s.path} onClick={() => analyze(s.path)}
                      style={{ padding: '6px 10px', background: selectedService === s.path ? 'var(--accent-blue-dim)' : 'var(--bg-tertiary)', border: `1px solid ${selectedService === s.path ? 'var(--accent-blue)' : 'var(--border)'}`, borderRadius: 'var(--r-md)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Layers size={11} color="var(--text-muted)" />
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{s.framework}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Build config (editable) */}
            <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Package size={14} color="var(--accent-blue)" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Build Configuration</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>via {editedPlan.detectionPath}</span>
              </div>

              {([ 
                ['Install Command', 'installCommand'],
                ['Build Command', 'buildCommand'],
                ['Start Command', 'startCommand'],
                ['Output Directory', 'outputDirectory'],
                ['Root Directory', 'rootDirectory'],
              ] as [string, keyof DeploymentPlan][]).map(([label, key]) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{label}</label>
                  <input
                    value={(editedPlan[key] as string) || ''}
                    onChange={e => updatePlan(key, e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </Card>

            {/* Runtime + provider info */}
            <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Cpu size={14} color="var(--accent-blue)" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Runtime & Provider</span>
              </div>
              <PlanRow label="Provider" value={selectedProvider?.name} />
              <PlanRow label="Framework" value={editedPlan.framework} />
              <PlanRow label="Runtime" value={editedPlan.runtime} />
              {editedPlan.runtimeVersion && <PlanRow label="Runtime Version" value={editedPlan.runtimeVersion} mono />}
              <PlanRow label="Package Manager" value={editedPlan.packageManager} />
              <PlanRow label="Port" value={editedPlan.exposedPort} />
              <PlanRow label="Deployment Type" value={editedPlan.deploymentType} />
              {editedPlan.providerConfig?.runtime && <PlanRow label="Provider Runtime" value={editedPlan.providerConfig.runtime} />}
              {editedPlan.providerConfig?.framework && <PlanRow label="Provider Framework" value={editedPlan.providerConfig.framework} />}
              <div style={{ marginTop: 6, padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)', fontSize: '11px', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {editedPlan.isMonorepo && <span style={{ color: 'var(--accent-purple, #a855f7)' }}>🗂 Monorepo</span>}
                  {plan?.hasDockerfile && <span>🐳 Dockerfile</span>}
                  {plan?.usesDatabase && <span>🗄 Database</span>}
                  {plan?.usesRedis && <span>🔴 Redis</span>}
                  {plan?.hasBackgroundWorkers && <span>⚙ Workers</span>}
                  {plan?.isSSR && <span>🖥 SSR</span>}
                </div>
              </div>
            </Card>
          </div>

          {/* Env vars detected */}
          {editedPlan.envVarNames.length > 0 && (
            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Info size={14} color="var(--accent-orange)" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Required Environment Variables</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 4 }}>detected from source code</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {editedPlan.envVarNames.map(name => (
                  <span key={name} style={{ padding: '3px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {name}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: '11px', color: 'var(--text-muted)' }}>
                Set values on the next step. Deployments will fail if required variables are missing.
              </div>
            </Card>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
            <Button variant="primary" icon={<ChevronRight size={14} />} onClick={() => setStage('env')}>
              Set Environment Variables
            </Button>
          </div>
        </div>
      )}

      {/* ── Stage: ENV ─────────────────────────────────────────────────────── */}
      {pageTab === 'deploy' && stage === 'env' && editedPlan && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Terminal size={14} color="var(--accent-blue)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Environment Variables</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 4 }}>Values are not stored — used only for this deployment</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {envVars.map((ev, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'center' }}>
                  <input
                    value={ev.key}
                    onChange={e => setEnvVars(vars => vars.map((v, j) => j === i ? { ...v, key: e.target.value } : v))}
                    placeholder="KEY"
                    style={{ padding: '7px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', outline: 'none' }}
                  />
                  <input
                    type={ev.show ? 'text' : 'password'}
                    value={ev.value}
                    onChange={e => setEnvVars(vars => vars.map((v, j) => j === i ? { ...v, value: e.target.value } : v))}
                    placeholder="value"
                    style={{ padding: '7px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', outline: 'none' }}
                  />
                  <button onClick={() => setEnvVars(vars => vars.map((v, j) => j === i ? { ...v, show: !v.show } : v))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: '4px 6px' }}>
                    {ev.show ? '🙈' : '👁'}
                  </button>
                  <button onClick={() => setEnvVars(vars => vars.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button onClick={() => setEnvVars(vars => [...vars, { key: '', value: '', show: false }])}
                style={{ alignSelf: 'flex-start', padding: '6px 12px', background: 'var(--bg-tertiary)', border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                + Add Variable
              </button>
            </div>
          </Card>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setStage('plan')}>Back</Button>
            <Button variant="primary" icon={<Play size={14} />} onClick={executePlan}>
              Deploy Now
            </Button>
          </div>
        </div>
      )}

      {/* ── Stage: DEPLOYING ───────────────────────────────────────────────── */}
      {pageTab === 'deploy' && stage === 'deploying' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-blue)', animation: 'pulse 1.2s infinite' }} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Deploying…</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{deployStatus}</span>
              {deployUrl && (
                <a href={deployUrl} target="_blank" rel="noopener noreferrer"
                  style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', color: 'var(--accent-blue)', textDecoration: 'none' }}>
                  <ExternalLink size={12} /> {deployUrl}
                </a>
              )}
            </div>
            <LogViewer lines={logs} />
          </Card>
        </div>
      )}

      {/* ── Stage: DONE ────────────────────────────────────────────────────── */}
      {pageTab === 'deploy' && stage === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: '28px 24px', textAlign: 'center' }}>
            <CheckCircle size={48} color="var(--accent-green)" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>Deployment Live 🎉</div>
            {deployUrl && (
              <a href={deployUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '14px', color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 600, marginBottom: 16 }}>
                <ExternalLink size={14} /> {deployUrl}
              </a>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
              <Button variant="ghost" onClick={reset} icon={<RotateCcw size={13} />}>New Deployment</Button>
            </div>
          </Card>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>DEPLOYMENT LOGS</div>
            <LogViewer lines={logs} />
          </Card>
        </div>
      )}

      {/* ── Stage: FAILED ──────────────────────────────────────────────────── */}
      {pageTab === 'deploy' && stage === 'failed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: '24px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <AlertTriangle size={24} color="var(--accent-red)" />
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Deployment Failed</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>AI is analyzing the failure…</div>
              </div>
            </div>

            {failure && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--r-md)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--accent-red)', fontWeight: 700, marginBottom: 4 }}>ROOT CAUSE</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{failure.rootCause}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>SUGGESTED FIXES</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {failure.fixes.map((fix, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--accent-blue)', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                        {fix}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="ghost" onClick={reset} icon={<X size={13} />}>Cancel</Button>
              <Button variant="ghost" onClick={() => setStage('plan')} icon={<ChevronRight size={13} />}>Edit Plan</Button>
              {(failure?.canRedeploy ?? true) && cloudDepId && (
                <Button variant="primary" onClick={redeploy} icon={<RotateCcw size={13} />}>Redeploy</Button>
              )}
            </div>
          </Card>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>DEPLOYMENT LOGS</div>
            <LogViewer lines={logs} />
          </Card>
        </div>
      )}
    </div>
  );
}
