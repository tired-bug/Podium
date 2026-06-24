import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Send, GitBranch, Package, Zap, CheckCircle, ChevronRight,
  RotateCcw, Rocket, Plus, Minus, Eye, EyeOff, Terminal,
  Cpu, Info, AlertTriangle, Globe, Plug, RefreshCw, ExternalLink,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import { parseApiError } from '../lib/utils';
import api from '../lib/api';

interface Port    { host: string; container: string; }
interface EnvVar  { key: string; value: string; }
interface DeployConfig {
  name: string; image: string; repo_url: string; branch: string;
  dockerfile_path: string; ports: Port[]; env_vars: EnvVar[];
  memory_limit: string; cpu_limit: string; restart_policy: string;
  reasoning: string;
}
interface ProviderMeta {
  id: string; name: string; connected: boolean; isDemo: boolean; regions?: string[];
}

type Mode = 'idle' | 'description' | 'repo' | 'image' | 'analyzing' | 'review' | 'deploying' | 'done';

const STACKS = [
  { label: 'Node.js API',        prompt: 'A Node.js REST API with Express and PostgreSQL on port 3000' },
  { label: 'Python FastAPI',     prompt: 'Python FastAPI backend with Redis cache on port 8000' },
  { label: 'Next.js App',        prompt: 'Next.js fullstack app with SSR on port 3000' },
  { label: 'Nginx Proxy',        prompt: 'Nginx reverse proxy for multiple backend services' },
  { label: 'WordPress + MySQL',  prompt: 'WordPress site with MySQL database on port 80' },
  { label: 'Go microservice',    prompt: 'Go HTTP microservice with minimal footprint on port 8080' },
  { label: 'Postgres DB',        prompt: 'PostgreSQL 16 database with persistent storage' },
  { label: 'Redis Cache',        prompt: 'Redis cache server with AOF persistence' },
];

const POPULAR_IMAGES = [
  'nginx:alpine', 'node:20-alpine', 'postgres:16', 'redis:7-alpine',
  'python:3.12-slim', 'golang:1.22-alpine', 'mysql:8', 'mongo:7',
];

const PROVIDER_LOGOS: Record<string, React.ReactNode> = {
  render:  <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#46E3B7"/><path d="M10 5 L14 10 L10 15 L6 10 Z" fill="#fff" fillOpacity=".9"/></svg>,
  railway: <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#0B0D0E"/><rect x="4" y="9" width="12" height="2" rx="1" fill="#fff"/><rect x="6" y="5" width="2" height="10" rx="1" fill="#fff"/><rect x="12" y="5" width="2" height="10" rx="1" fill="#fff"/></svg>,
  vercel:  <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#000"/><path d="M10 5 L16 15 H4 Z" fill="#fff"/></svg>,
  aws:     <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#232F3E"/><text x="3" y="13" fontSize="8" fill="#FF9900" fontWeight="700">AWS</text></svg>,
  azure:   <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#0078D4"/><path d="M6 14 L10 6 L12 10 L9 10 L13 14 Z" fill="#fff" fillOpacity=".9"/></svg>,
  gcp:     <svg viewBox="0 0 20 20" width="18" height="18"><rect width="20" height="20" rx="5" fill="#fff"/><circle cx="10" cy="10" r="6" fill="none" stroke="#4285F4" strokeWidth="2.5"/></svg>,
};

function ModeCard({ icon, title, sub, onClick, color = '#6366f1' }: {
  icon: React.ReactNode; title: string; sub: string; onClick: () => void; color?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '20px 18px', background: hov ? `rgba(${color === '#6366f1' ? '99,102,241' : color === '#a855f7' ? '168,85,247' : '34,211,238'},0.07)` : 'var(--bg-elevated)',
        border: `1px solid ${hov ? color : 'var(--border)'}`,
        borderRadius: 'var(--r-xl)', cursor: 'pointer', textAlign: 'left',
        transition: 'all 200ms', display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: hov ? `0 0 20px ${color}22` : 'none',
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 'var(--r-lg)', background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{sub}</div>
      </div>
    </button>
  );
}

function ConfigField({ label, field, config, onUpdate, type = 'text', mono = false, options }: {
  label: string; field: string; config: DeployConfig; onUpdate: (f: string, v: any) => void;
  type?: 'text' | 'select'; mono?: boolean; options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const val = (config as any)[field];
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border-muted)', gap: 12, cursor: 'text' }}
      onClick={() => setEditing(true)}
    >
      <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: 110, flexShrink: 0, fontWeight: 500 }}>{label}</span>
      {editing ? (
        type === 'select' ? (
          <select
            autoFocus value={val}
            onChange={e => { onUpdate(field, e.target.value); setEditing(false); }}
            onClick={e => e.stopPropagation()}
            onBlur={() => setEditing(false)}
            className="podium-input"
            style={{ flex: 1, padding: '3px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--accent-blue)', borderRadius: 'var(--r-sm)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
          >
            {options!.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            autoFocus value={val || ''}
            onChange={e => onUpdate(field, e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={e => { if (e.key === 'Enter') setEditing(false); }}
            onClick={e => e.stopPropagation()}
            className="podium-input"
            style={{ flex: 1, padding: '3px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--accent-blue)', borderRadius: 'var(--r-sm)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: mono ? 'var(--font-mono)' : 'inherit', outline: 'none' }}
          />
        )
      ) : (
        <span style={{ flex: 1, fontSize: '13px', color: val ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}>
          {val || '—'}
        </span>
      )}
    </div>
  );
}

function PortsPanel({ ports, onChange }: { ports: Port[]; onChange: (p: Port[]) => void }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-muted)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, width: 110 }}>Ports</span>
        <button onClick={() => onChange([...ports, { host: '', container: '' }])}
          style={{ fontSize: '11px', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <Plus size={11} /> Add
        </button>
      </div>
      {ports.length === 0 ? (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', paddingLeft: 118 }}>None</span>
      ) : (
        <div style={{ paddingLeft: 118, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ports.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={p.host} onChange={e => { const a = [...ports]; a[i] = { ...a[i], host: e.target.value }; onChange(a); }} placeholder="8080" className="podium-input"
                style={{ width: 80, padding: '4px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text-primary)', fontSize: '12px', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>→</span>
              <input value={p.container} onChange={e => { const a = [...ports]; a[i] = { ...a[i], container: e.target.value }; onChange(a); }} placeholder="80" className="podium-input"
                style={{ width: 80, padding: '4px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text-primary)', fontSize: '12px', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              <button onClick={() => onChange(ports.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', display: 'flex' }}>
                <Minus size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EnvPanel({ envs, onChange }: { envs: EnvVar[]; onChange: (e: EnvVar[]) => void }) {
  const [showValues, setShowValues] = useState(false);
  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, width: 110 }}>Env Vars</span>
        <button onClick={() => setShowValues(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px' }}>
          {showValues ? <EyeOff size={11} /> : <Eye size={11} />}
          {showValues ? 'Hide values' : 'Show values'}
        </button>
        <button onClick={() => onChange([...envs, { key: '', value: '' }])}
          style={{ fontSize: '11px', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <Plus size={11} /> Add
        </button>
      </div>
      {envs.length === 0 ? (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', paddingLeft: 118 }}>None</span>
      ) : (
        <div style={{ paddingLeft: 118, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {envs.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={e.key} onChange={ev => { const a = [...envs]; a[i] = { ...a[i], key: ev.target.value }; onChange(a); }} placeholder="KEY" className="podium-input"
                style={{ width: 140, padding: '4px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--accent-blue)', fontSize: '12px', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>=</span>
              <input value={e.value} onChange={ev => { const a = [...envs]; a[i] = { ...a[i], value: ev.target.value }; onChange(a); }} placeholder="value" type={showValues ? 'text' : 'password'} className="podium-input"
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
  const [activeStep, setActiveStep] = useState(0);
  const steps = ['Detecting stack and runtime', 'Selecting optimal base image', 'Configuring ports and networking', 'Setting resource limits'];
  useEffect(() => {
    const t = setInterval(() => setDot(d => (d + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setActiveStep(s => Math.min(s + 1, steps.length - 1)), 1600);
    return () => clearInterval(t);
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
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          {label}{'.'.repeat(dot)}
        </div>
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

function ProviderPicker({ providers, selected, onSelect }: {
  providers: ProviderMeta[]; selected: string; onSelect: (id: string) => void;
}) {
  const connected = providers.filter(p => p.connected && !p.isDemo);
  if (connected.length === 0) return (
    <div style={{ padding: '14px 16px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--r-lg)', display: 'flex', gap: 10, alignItems: 'center' }}>
      <AlertTriangle size={14} color="var(--accent-orange)" style={{ flexShrink: 0 }} />
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
        No cloud providers connected. <a href="/providers" style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 600 }}>Connect a provider →</a>
      </div>
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
        Deploy to Provider
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {connected.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px',
              background: selected === p.id ? 'rgba(99,102,241,0.12)' : 'var(--bg-elevated)',
              border: `1px solid ${selected === p.id ? 'var(--accent-blue)' : 'var(--border)'}`,
              borderRadius: 'var(--r-md)', cursor: 'pointer',
              color: selected === p.id ? 'var(--accent-blue-2)' : 'var(--text-secondary)',
              fontSize: '13px', fontWeight: selected === p.id ? 700 : 400,
              transition: 'all 150ms',
              boxShadow: selected === p.id ? '0 0 12px rgba(99,102,241,0.2)' : 'none',
            }}
          >
            {PROVIDER_LOGOS[p.id]}
            {p.name}
            {selected === p.id && <CheckCircle size={12} color="var(--accent-blue)" />}
          </button>
        ))}
      </div>
      {selected && providers.find(p => p.id === selected)?.regions && (
        <div style={{ marginTop: 8, fontSize: '11px', color: 'var(--text-muted)' }}>
          Available regions: {providers.find(p => p.id === selected)!.regions!.join(', ')}
        </div>
      )}
    </div>
  );
}

export default function NaturalDeploy() {
  const [mode, setMode]             = useState<Mode>('idle');
  const [input, setInput]           = useState('');
  const [repoUrl, setRepoUrl]       = useState('');
  const [imageInput, setImageInput] = useState('');
  const [config, setConfig]         = useState<DeployConfig | null>(null);
  const [loading, setLoading]       = useState(false);
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  const [providers, setProviders]   = useState<ProviderMeta[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { error: showError, success } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === 'description') setTimeout(() => textareaRef.current?.focus(), 80);
  }, [mode]);

  // Load connected providers
  useEffect(() => {
    api.get('/api/providers').then(r => {
      const connected = r.data.filter((p: ProviderMeta) => p.connected && !p.isDemo);
      setProviders(r.data);
      if (connected.length > 0 && !selectedProvider) setSelectedProvider(connected[0].id);
    }).catch(() => {});
  }, []);

  const analyze = async (payload: Record<string, string>) => {
    setLoading(true);
    setMode('analyzing');
    try {
      const res = await api.post('/api/ai/natural-deploy', payload);
      setConfig(res.data.config);
      setMode('review');
    } catch (err) {
      showError(parseApiError(err));
      setMode(payload.description ? 'description' : payload.repoUrl ? 'repo' : 'image');
    } finally {
      setLoading(false);
    }
  };

  const deploy = async () => {
    if (!config) return;
    if (!selectedProvider) { showError('Please select a provider to deploy to'); return; }
    setMode('deploying');
    setLoading(true);
    try {
      // Build env vars object for provider API
      const envVars: Record<string, string> = {};
      config.env_vars.filter(e => e.key).forEach(e => { envVars[e.key] = e.value; });
      const ports = config.ports.filter(p => p.container).map(p => parseInt(p.container));

      const res = await api.post('/api/providers/deploy', {
        provider: selectedProvider,
        name: config.name,
        image: config.image || undefined,
        repoUrl: config.repo_url || undefined,
        branch: config.branch || 'main',
        envVars,
        ports: ports.length ? ports : undefined,
        buildCommand: undefined,
        startCommand: undefined,
      });
      setDeployedId(res.data.cloudDeploymentId || res.data.deploymentId || null);
      setDeployedUrl(res.data.url || null);
      setMode('done');
      success(`"${config.name}" is deploying to ${providers.find(p => p.id === selectedProvider)?.name}!`);
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

  const upd = (f: string, v: any) => setConfig(c => c ? { ...c, [f]: v } : c);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 'var(--r-xl)', background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 28px rgba(99,102,241,0.4)', flexShrink: 0 }}>
          <Sparkles size={22} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>AI Deploy</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Describe your app — AI configures it and deploys to your cloud provider.</p>
        </div>
        <a href="/providers" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, textDecoration: 'none', transition: 'all 150ms' }}>
          <Plug size={12} /> Providers
        </a>
      </div>

      {mode === 'idle' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <ModeCard icon={<Sparkles size={20} color="#6366f1" />} title="Describe your app" sub="Tell AI what you want in plain language" onClick={() => setMode('description')} color="#6366f1" />
            <ModeCard icon={<GitBranch size={20} color="#a855f7" />} title="From a Git repo" sub="Paste a GitHub URL — AI detects the stack" onClick={() => setMode('repo')} color="#a855f7" />
            <ModeCard icon={<Package size={20} color="#22d3ee" />} title="From a Docker image" sub="Pick an image and AI fills the rest" onClick={() => setMode('image')} color="#22d3ee" />
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Quick start — click to deploy instantly
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {STACKS.map((s, i) => (
                <button key={s.label} onClick={() => { setInput(s.prompt); analyze({ description: s.prompt }); }}
                  style={{ padding: '12px 16px', background: 'none', border: 'none', borderBottom: i < STACKS.length - 2 ? '1px solid var(--border-muted)' : 'none', borderRight: i % 2 === 0 ? '1px solid var(--border-muted)' : 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 150ms', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-glass-light)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
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
              <textarea
                ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) { e.preventDefault(); analyze({ description: input.trim() }); } }}
                placeholder={'A Node.js REST API with PostgreSQL, running on port 3000, with JWT auth...\n\nBe as specific as you like — mention the language, port, database, volumes, any env vars.'}
                rows={6} className="podium-input"
                style={{ width: '100%', padding: '14px 52px 14px 14px', background: 'transparent', border: 'none', borderRadius: 0, color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-sans)', resize: 'none', outline: 'none', lineHeight: 1.7, boxSizing: 'border-box' }}
              />
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
              AI will detect your stack, pick the right base image, and configure ports and resource limits automatically.
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
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Docker image</span>
            </div>
            <div style={{ padding: '14px', display: 'flex', gap: 8 }}>
              <input autoFocus value={imageInput} onChange={e => setImageInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && imageInput.trim()) analyze({ image: imageInput.trim() }); }}
                placeholder="nginx:latest  ·  node:20-alpine  ·  myorg/myapp:v1" className="podium-input"
                style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              <Button variant="primary" onClick={() => imageInput.trim() && analyze({ image: imageInput.trim() })} disabled={!imageInput.trim()}>Configure</Button>
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-muted)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {POPULAR_IMAGES.map(img => (
                <button key={img} onClick={() => setImageInput(img)}
                  style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '3px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: imageInput === img ? 'rgba(34,211,238,0.1)' : 'none', color: imageInput === img ? 'var(--accent-cyan)' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 100ms' }}>
                  {img}
                </button>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} style={{ alignSelf: 'flex-start' }}>← Back</Button>
        </div>
      )}

      {mode === 'analyzing' && <AnalyzingScreen />}

      {mode === 'review' && config && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '14px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--r-lg)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Sparkles size={15} color="var(--accent-blue-2)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <span style={{ fontWeight: 700, color: 'var(--accent-blue-2)' }}>AI reasoning: </span>
              {config.reasoning}
            </div>
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Package size={15} color="var(--accent-blue)" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Deployment Configuration</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>Click any field to edit</span>
            </div>
            <ConfigField label="Name"         field="name"           config={config} onUpdate={upd} />
            <ConfigField label="Docker Image" field="image"          config={config} onUpdate={upd} mono />
            <ConfigField label="Repo URL"     field="repo_url"       config={config} onUpdate={upd} />
            <ConfigField label="Branch"       field="branch"         config={config} onUpdate={upd} mono />
            <ConfigField label="Memory"       field="memory_limit"   config={config} onUpdate={upd} type="select" options={['128m','256m','512m','1g','2g','4g']} />
            <ConfigField label="CPU"          field="cpu_limit"      config={config} onUpdate={upd} type="select" options={['0.25','0.5','1','2']} />
            <PortsPanel ports={config.ports} onChange={v => upd('ports', v)} />
            <EnvPanel   envs={config.env_vars} onChange={v => upd('env_vars', v)} />
          </div>

          {/* Provider picker */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '18px 20px' }}>
            <ProviderPicker providers={providers} selected={selectedProvider} onSelect={setSelectedProvider} />
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button variant="ghost" onClick={reset} icon={<RotateCcw size={14} />}>Start over</Button>
            <div style={{ flex: 1 }} />
            <Button
              variant="primary"
              onClick={deploy}
              loading={loading}
              disabled={!selectedProvider}
              icon={<Rocket size={14} />}
            >
              Deploy to {providers.find(p => p.id === selectedProvider)?.name || 'provider'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'deploying' && (
        <AnalyzingScreen label={`Deploying ${config?.name} to ${providers.find(p => p.id === selectedProvider)?.name || 'provider'}`} />
      )}

      {mode === 'done' && config && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '48px 0' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 32px rgba(16,185,129,0.3)' }}>
            <CheckCircle size={36} color="var(--accent-green)" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>Deployed!</div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{config.name}</span>
              {' '}is building on {providers.find(p => p.id === selectedProvider)?.name}.
            </div>
            {deployedUrl && (
              <a href={deployedUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '6px 14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 'var(--r-md)', color: 'var(--accent-green)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                <Globe size={13} /> {deployedUrl} <ExternalLink size={11} />
              </a>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={reset} icon={<Sparkles size={14} />}>Deploy another</Button>
            <Button variant="primary" onClick={() => navigate('/cloud')} icon={<Rocket size={14} />}>
              View cloud deploys
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
