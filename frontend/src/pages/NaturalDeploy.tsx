import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Send, GitBranch, Package, Zap, CheckCircle, ChevronRight,
  RotateCcw, Rocket, Plus, Minus, Eye, EyeOff, Info, Globe, ExternalLink,
  AlertTriangle, Copy, Plug,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import { parseApiError } from '../lib/utils';
import api from '../lib/api';

interface EnvVar { key: string; value: string; }
interface ProviderConfig {
  provider: string;
  name: string;
  repoUrl?: string;
  branch?: string;
  image?: string;
  region?: string;
  envVars: EnvVar[];
  buildCommand?: string;
  startCommand?: string;
  renderRuntime?: string;
  renderPlan?: string;
  renderOwnerId?: string;
  railwayProjectName?: string;
  vercelFramework?: string;
  reasoning: string;
}

interface Provider { id: string; name: string; connected: boolean; isDemo: boolean; regions?: string[]; }

type Mode = 'idle' | 'description' | 'repo' | 'image' | 'analyzing' | 'provider' | 'review' | 'deploying' | 'done';

const STACKS = [
  { label: 'Node.js API',       prompt: 'A Node.js REST API with Express and PostgreSQL on port 3000' },
  { label: 'Python FastAPI',    prompt: 'Python FastAPI backend with Redis cache on port 8000' },
  { label: 'Next.js App',       prompt: 'Next.js fullstack app with SSR on port 3000' },
  { label: 'Nginx Proxy',       prompt: 'Nginx reverse proxy for multiple backend services' },
  { label: 'WordPress + MySQL', prompt: 'WordPress site with MySQL database on port 80' },
  { label: 'Go microservice',   prompt: 'Go HTTP microservice with minimal footprint on port 8080' },
  { label: 'Postgres DB',       prompt: 'PostgreSQL 16 database with persistent storage' },
  { label: 'Redis Cache',       prompt: 'Redis cache server with AOF persistence' },
];

const PROVIDER_LOGOS: Record<string, React.ReactNode> = {
  render:  <svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#46E3B7"/><path d="M10 5 L14 10 L10 15 L6 10 Z" fill="#fff" fillOpacity=".9"/></svg>,
  railway: <svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#0B0D0E"/><rect x="4" y="9" width="12" height="2" rx="1" fill="#fff"/><rect x="6" y="5" width="2" height="10" rx="1" fill="#fff"/><rect x="12" y="5" width="2" height="10" rx="1" fill="#fff"/></svg>,
  vercel:  <svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#000"/><path d="M10 5 L16 15 H4 Z" fill="#fff"/></svg>,
};

function ModeCard({ icon, title, sub, onClick, color = '#6366f1' }: {
  icon: React.ReactNode; title: string; sub: string; onClick: () => void; color?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding: '20px 18px', background: hov ? `rgba(${color === '#6366f1' ? '99,102,241' : color === '#a855f7' ? '168,85,247' : '34,211,238'},0.07)` : 'var(--bg-elevated)',
        border: `1px solid ${hov ? color : 'var(--border)'}`,
        borderRadius: 'var(--r-xl)', cursor: 'pointer', textAlign: 'left',
        transition: 'all 200ms', display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: hov ? `0 0 20px ${color}22` : 'none',
      }}>
      <div style={{ width: 40, height: 40, borderRadius: 'var(--r-lg)', background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{sub}</div>
      </div>
    </button>
  );
}

function EnvPanel({ envs, onChange }: { envs: EnvVar[]; onChange: (e: EnvVar[]) => void }) {
  const [showValues, setShowValues] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Environment Variables</span>
        <button onClick={() => setShowValues(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', marginLeft: 'auto' }}>
          {showValues ? <EyeOff size={11} /> : <Eye size={11} />}
          {showValues ? 'Hide' : 'Show'}
        </button>
        <button onClick={() => onChange([...envs, { key: '', value: '' }])} style={{ fontSize: '11px', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={11} /> Add
        </button>
      </div>
      {envs.length === 0 ? (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No environment variables</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {envs.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={e.key} onChange={ev => { const a = [...envs]; a[i] = { ...a[i], key: ev.target.value }; onChange(a); }}
                placeholder="KEY" className="podium-input"
                style={{ width: 140, padding: '4px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--accent-blue)', fontSize: '12px', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>=</span>
              <input value={e.value} onChange={ev => { const a = [...envs]; a[i] = { ...a[i], value: ev.target.value }; onChange(a); }}
                placeholder="value" type={showValues ? 'text' : 'password'} className="podium-input"
                style={{ flex: 1, padding: '4px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              <button onClick={() => onChange(envs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', display: 'flex' }}>
                <Minus size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyzingScreen({ label = 'Analyzing with AI...' }: { label?: string }) {
  const [dot, setDot] = useState(0);
  const steps = ['Detecting stack and runtime', 'Selecting target provider', 'Configuring deployment settings', 'Setting environment defaults'];
  const [activeStep, setActiveStep] = useState(0);
  useEffect(() => {
    const t1 = setInterval(() => setDot(d => (d + 1) % 4), 400);
    const t2 = setInterval(() => setActiveStep(s => Math.min(s + 1, steps.length - 1)), 1600);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, padding: '48px 0' }}>
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 32px rgba(99,102,241,0.5)' }}>
          <Sparkles size={28} color="#fff" />
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{label}{'.'.repeat(dot)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          {steps.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: i <= activeStep ? 'var(--text-secondary)' : 'var(--text-muted)', transition: 'color 400ms' }}>
              {i < activeStep ? <CheckCircle size={13} color="var(--accent-green)" /> : i === activeStep ? <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--accent-blue)', borderTopColor: 'transparent', animation: 'spin 600ms linear infinite' }} /> : <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--border)' }} />}
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function NaturalDeploy() {
  const [mode, setMode]         = useState<Mode>('idle');
  const [input, setInput]       = useState('');
  const [repoUrl, setRepoUrl]   = useState('');
  const [imageInput, setImageInput] = useState('');
  const [config, setConfig]     = useState<ProviderConfig | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading]   = useState(false);
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { error: showError, success } = useToast();
  const navigate = useNavigate();

  const loadProviders = useCallback(async () => {
    try {
      const r = await api.get('/api/providers');
      setProviders(r.data || []);
    } catch {}
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

  useEffect(() => {
    if (mode === 'description') setTimeout(() => textareaRef.current?.focus(), 80);
  }, [mode]);

  const connectedProviders = providers.filter(p => p.connected && !p.isDemo);

  const analyze = async (payload: Record<string, string>) => {
    setLoading(true);
    setMode('analyzing');
    try {
      const res = await api.post('/api/ai/natural-deploy', payload);
      const aiConfig = res.data.config;
      // Build provider config from AI result
      const pc: ProviderConfig = {
        provider: '',
        name: aiConfig.name || 'my-app',
        repoUrl: payload.repoUrl || aiConfig.repo_url || '',
        branch: aiConfig.branch || 'main',
        image: payload.image || aiConfig.image || '',
        envVars: (aiConfig.env_vars || []).map((e: any) => ({ key: e.key, value: e.value })),
        buildCommand: aiConfig.build_command || '',
        startCommand: aiConfig.start_command || aiConfig.cmd || '',
        renderRuntime: 'node',
        renderPlan: 'free',
        renderOwnerId: '',
        railwayProjectName: aiConfig.name || 'my-app',
        vercelFramework: 'nextjs',
        reasoning: aiConfig.reasoning || '',
      };
      setConfig(pc);
      if (connectedProviders.length === 1) {
        // Auto-select single provider
        pc.provider = connectedProviders[0].id;
        setConfig({ ...pc });
        setMode('review');
      } else if (connectedProviders.length === 0) {
        setMode('provider');
      } else {
        setMode('provider');
      }
    } catch (err) {
      showError(parseApiError(err));
      setMode(payload.description ? 'description' : payload.repoUrl ? 'repo' : 'image');
    } finally {
      setLoading(false);
    }
  };

  const deploy = async () => {
    if (!config) return;
    setMode('deploying');
    setLoading(true);
    try {
      const envVarsObj = Object.fromEntries(config.envVars.filter(e => e.key).map(e => [e.key, e.value]));
      const payload: Record<string, any> = {
        provider: config.provider,
        repoUrl: config.repoUrl || undefined,
        branch: config.branch || 'main',
        envVars: envVarsObj,
      };
      if (config.provider === 'render') {
        payload.name = config.name;
        payload.ownerId = config.renderOwnerId || undefined;
        payload.runtime = config.renderRuntime || 'node';
        payload.region = config.region || 'oregon';
        payload.plan = config.renderPlan || 'free';
        if (config.buildCommand) payload.buildCommand = config.buildCommand;
        if (config.startCommand) payload.startCommand = config.startCommand;
      } else if (config.provider === 'railway') {
        payload.name = config.railwayProjectName || config.name;
        payload.projectName = config.railwayProjectName || config.name;
      } else if (config.provider === 'vercel') {
        payload.name = config.name;
        payload.framework = config.vercelFramework || 'other';
        if (config.buildCommand) payload.buildCommand = config.buildCommand;
      } else {
        payload.name = config.name;
      }
      const res = await api.post('/api/providers/deploy', payload);
      setDeployedId(res.data.id);
      setMode('done');
      success(`"${config.name}" is deploying to ${config.provider}!`);
    } catch (err) {
      showError(parseApiError(err));
      setMode('review');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMode('idle'); setInput(''); setRepoUrl('');
    setImageInput(''); setConfig(null); setDeployedId(null); setDeployedUrl(null);
  };

  const upd = (k: keyof ProviderConfig, v: any) => setConfig(c => c ? { ...c, [k]: v } : c);

  const selectedProvider = providers.find(p => p.id === config?.provider);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 'var(--r-xl)', background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 28px rgba(99,102,241,0.4)', flexShrink: 0 }}>
          <Sparkles size={22} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>AI Deploy</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Describe your app — AI configures and deploys it to your cloud provider.
          </p>
        </div>
        {connectedProviders.length === 0 && (
          <button onClick={() => navigate('/providers')} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--r-md)', color: 'var(--accent-orange)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            <Plug size={12} /> Connect a provider first
          </button>
        )}
      </div>

      {connectedProviders.length > 0 && mode === 'idle' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 14px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 'var(--r-lg)' }}>
          <span style={{ fontSize: '12px', color: 'var(--accent-green)', fontWeight: 600 }}>Deploying to:</span>
          {connectedProviders.map(p => (
            <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: '2px 10px' }}>
              {PROVIDER_LOGOS[p.id]} {p.name}
            </span>
          ))}
        </div>
      )}

      {mode === 'idle' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <ModeCard icon={<Sparkles size={20} color="#6366f1" />} title="Describe your app" sub="Tell AI what you want in plain language" onClick={() => setMode('description')} color="#6366f1" />
            <ModeCard icon={<GitBranch size={20} color="#a855f7" />} title="From a Git repo" sub="Paste a GitHub URL — AI detects the stack" onClick={() => setMode('repo')} color="#a855f7" />
            <ModeCard icon={<Package size={20} color="#22d3ee" />} title="From a Docker image" sub="Pick an image and AI fills the rest" onClick={() => setMode('image')} color="#22d3ee" />
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Quick start — click to analyze & deploy
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {STACKS.map((s, i) => (
                <button key={s.label} onClick={() => { setInput(s.prompt); analyze({ description: s.prompt }); }}
                  style={{ padding: '12px 16px', background: 'none', border: 'none', borderBottom: i < STACKS.length - 2 ? '1px solid var(--border-muted)' : 'none', borderRight: i % 2 === 0 ? '1px solid var(--border-muted)' : 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 150ms', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-glass-light)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <ChevronRight size={13} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 1 }}>{s.prompt}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {mode === 'description' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={14} color="var(--accent-blue)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Describe what you want to deploy</span>
            </div>
            <div style={{ position: 'relative', padding: '4px' }}>
              <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) { e.preventDefault(); analyze({ description: input.trim() }); } }}
                placeholder={'A Node.js REST API with PostgreSQL, running on port 3000, with JWT auth...\n\nBe as specific as you like — AI will configure the provider deployment for you.'}
                rows={6} className="podium-input"
                style={{ width: '100%', padding: '14px 52px 14px 14px', background: 'transparent', border: 'none', borderRadius: 0, color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-sans)', resize: 'none', outline: 'none', lineHeight: 1.7, boxSizing: 'border-box' }} />
              <button onClick={() => input.trim() && analyze({ description: input.trim() })} disabled={!input.trim()}
                style={{ position: 'absolute', right: 12, bottom: 12, width: 34, height: 34, borderRadius: 'var(--r-md)', background: input.trim() ? 'var(--accent-blue)' : 'var(--bg-tertiary)', border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 150ms', boxShadow: input.trim() ? '0 0 12px rgba(99,102,241,0.4)' : 'none' }}>
                <Send size={14} color={input.trim() ? '#fff' : 'var(--text-muted)'} />
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="ghost" size="sm" onClick={reset}>← Back</Button>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Press Enter to analyze · Shift+Enter for new line</span>
          </div>
        </div>
      )}

      {mode === 'repo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={14} color="var(--accent-purple)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Git repository URL</span>
            </div>
            <div style={{ padding: '14px', display: 'flex', gap: 8 }}>
              <input autoFocus value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && repoUrl.trim()) analyze({ repoUrl: repoUrl.trim() }); }}
                placeholder="https://github.com/owner/repository" className="podium-input"
                style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              <Button variant="primary" onClick={() => repoUrl.trim() && analyze({ repoUrl: repoUrl.trim() })} disabled={!repoUrl.trim()}>Analyze</Button>
            </div>
            <div style={{ padding: '10px 14px', background: 'rgba(168,85,247,0.04)', borderTop: '1px solid var(--border-muted)', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Info size={13} color="var(--accent-purple)" style={{ flexShrink: 0, marginTop: 1 }} />
              AI detects the stack and generates a full provider deployment config automatically.
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} style={{ alignSelf: 'flex-start' }}>← Back</Button>
        </div>
      )}

      {mode === 'image' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={14} color="var(--accent-cyan)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Docker image name</span>
            </div>
            <div style={{ padding: '14px', display: 'flex', gap: 8 }}>
              <input autoFocus value={imageInput} onChange={e => setImageInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && imageInput.trim()) analyze({ image: imageInput.trim() }); }}
                placeholder="nginx:latest  ·  node:20-alpine  ·  myorg/myapp:v1" className="podium-input"
                style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              <Button variant="primary" onClick={() => imageInput.trim() && analyze({ image: imageInput.trim() })} disabled={!imageInput.trim()}>Configure</Button>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} style={{ alignSelf: 'flex-start' }}>← Back</Button>
        </div>
      )}

      {mode === 'analyzing' && <AnalyzingScreen />}

      {/* Provider selection (when multiple connected) */}
      {mode === 'provider' && config && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {config.reasoning && (
            <div style={{ padding: '14px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--r-lg)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Sparkles size={15} color="var(--accent-blue-2)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-blue-2)' }}>AI reasoning: </span>
                {config.reasoning}
              </div>
            </div>
          )}

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Choose Deployment Target
            </div>
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {connectedProviders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <AlertTriangle size={28} color="var(--accent-orange)" style={{ marginBottom: 10 }} />
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No providers connected</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 14 }}>Connect Render, Railway, or Vercel to deploy.</p>
                  <Button variant="primary" onClick={() => navigate('/providers')}>Go to Providers</Button>
                </div>
              ) : connectedProviders.map(p => (
                <button key={p.id} onClick={() => { upd('provider', p.id); setMode('review'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: config.provider === p.id ? 'var(--accent-blue-dim)' : 'var(--bg-tertiary)', border: `1px solid ${config.provider === p.id ? 'var(--accent-blue)' : 'var(--border)'}`, borderRadius: 'var(--r-lg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', transition: 'all 150ms' }}>
                  {PROVIDER_LOGOS[p.id] || <Globe size={20} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--accent-green)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={10} /> Connected
                    </div>
                  </div>
                  {config.provider === p.id && <CheckCircle size={16} color="var(--accent-blue)" />}
                </button>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} style={{ alignSelf: 'flex-start' }} icon={<RotateCcw size={14} />}>Start over</Button>
        </div>
      )}

      {mode === 'review' && config && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {config.reasoning && (
            <div style={{ padding: '14px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--r-lg)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Sparkles size={15} color="var(--accent-blue-2)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-blue-2)' }}>AI reasoning: </span>
                {config.reasoning}
              </div>
            </div>
          )}

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              {selectedProvider && (PROVIDER_LOGOS[selectedProvider.id] || <Globe size={15} />)}
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Deploy to {selectedProvider?.name || config.provider}
              </span>
              {connectedProviders.length > 1 && (
                <button onClick={() => setMode('provider')} style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer' }}>Change provider</button>
              )}
            </div>

            {/* Editable fields */}
            {[
              { label: 'App Name', key: 'name' as const },
              ...(config.repoUrl ? [{ label: 'Repo URL', key: 'repoUrl' as const }] : []),
              ...(config.branch ? [{ label: 'Branch', key: 'branch' as const }] : []),
              ...(config.provider === 'render' ? [
                { label: 'Runtime', key: 'renderRuntime' as const },
                { label: 'Plan', key: 'renderPlan' as const },
                { label: 'Build Command', key: 'buildCommand' as const },
                { label: 'Start Command', key: 'startCommand' as const },
              ] : []),
              ...(config.provider === 'railway' ? [
                { label: 'Project Name', key: 'railwayProjectName' as const },
              ] : []),
              ...(config.provider === 'vercel' ? [
                { label: 'Framework', key: 'vercelFramework' as const },
                { label: 'Build Command', key: 'buildCommand' as const },
              ] : []),
            ].map(({ label, key }) => (
              <EditableRow key={key} label={label} value={(config as any)[key] || ''} onSave={v => upd(key, v)} />
            ))}

            <div style={{ padding: '14px 16px' }}>
              <EnvPanel envs={config.envVars} onChange={v => upd('envVars', v)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button variant="ghost" onClick={reset} icon={<RotateCcw size={14} />}>Start over</Button>
            <div style={{ flex: 1 }} />
            <Button variant="primary" onClick={deploy} loading={loading} icon={<Rocket size={14} />}>
              Deploy to {selectedProvider?.name || config.provider}
            </Button>
          </div>
        </div>
      )}

      {mode === 'deploying' && <AnalyzingScreen label={`Deploying ${config?.name} to ${selectedProvider?.name || config?.provider}`} />}

      {mode === 'done' && config && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '48px 0' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 32px rgba(16,185,129,0.3)' }}>
            <CheckCircle size={36} color="var(--accent-green)" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>Deployment queued!</div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{config.name}</span> is being deployed to{' '}
              <span style={{ color: 'var(--accent-blue)' }}>{selectedProvider?.name || config.provider}</span>.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={reset} icon={<Sparkles size={14} />}>Deploy another</Button>
            <Button variant="primary" onClick={() => navigate('/cloud')} icon={<ExternalLink size={14} />}>
              View in Cloud Deploy
            </Button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function EditableRow({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => { setVal(value); }, [value]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border-muted)', gap: 12, cursor: 'text' }} onClick={() => setEditing(true)}>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: 120, flexShrink: 0, fontWeight: 500 }}>{label}</span>
      {editing ? (
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onBlur={() => { onSave(val); setEditing(false); }}
          onKeyDown={e => { if (e.key === 'Enter') { onSave(val); setEditing(false); } }}
          onClick={e => e.stopPropagation()} className="podium-input"
          style={{ flex: 1, padding: '3px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--accent-blue)', borderRadius: 'var(--r-sm)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', fontFamily: 'var(--font-mono)' }} />
      ) : (
        <span style={{ flex: 1, fontSize: '13px', color: val ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{val || '—'}</span>
      )}
    </div>
  );
}
