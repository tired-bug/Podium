import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, GitBranch, Package, Zap, CheckCircle, ChevronRight, RotateCcw, Rocket, Terminal, Copy, Eye, EyeOff, Plus, Trash2, AlertCircle, Loader } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import { parseApiError } from '../lib/utils';
import api from '../lib/api';

interface EnvVar { _id: string; key: string; value: string; show: boolean; }
interface Port { _id: string; host: string; container: string; }

interface DeployConfig {
  name: string;
  image: string;
  repo_url: string;
  branch: string;
  dockerfile_path: string;
  ports: Port[];
  env_vars: EnvVar[];
  memory_limit: string;
  cpu_limit: string;
  restart_policy: string;
  reasoning: string;
}

type Phase = 'home' | 'chat' | 'analyzing' | 'review' | 'deploying' | 'done';

const PROMPTS = [
  'A Node.js REST API with Redis caching on port 3000',
  'Python FastAPI backend with PostgreSQL on port 8000',
  'Next.js fullstack app with Prisma ORM',
  'Nginx reverse proxy with custom config',
  'A Ghost blog platform on port 2368',
  'Golang microservice with Prometheus metrics',
];

function uid() { return Math.random().toString(36).slice(2, 9); }

function EnvVarRow({ env, onChange, onRemove }: {
  env: EnvVar;
  onChange: (field: 'key' | 'value', val: string) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'center', marginBottom: 6 }}>
      <input
        className="podium-input podium-mono"
        placeholder="VARIABLE_NAME"
        value={env.key}
        onChange={e => onChange('key', e.target.value)}
      />
      <input
        className="podium-input"
        placeholder="value"
        type={env.show ? 'text' : 'password'}
        value={env.value}
        onChange={e => onChange('value', e.target.value)}
        style={{ fontFamily: env.show ? 'var(--font-mono)' : undefined, fontSize: 13 }}
      />
      <button
        onClick={() => onChange('show' as any, (!env.show) as any)}
        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 8px', color: 'var(--text-muted)', cursor: 'pointer' }}
        title={env.show ? 'Hide' : 'Reveal'}
      >
        {env.show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
      <button
        onClick={onRemove}
        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 8px', color: 'var(--accent-red)', cursor: 'pointer' }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function PortRow({ port, onChange, onRemove }: {
  port: Port;
  onChange: (field: 'host' | 'container', val: string) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center', marginBottom: 6 }}>
      <input
        className="podium-input podium-mono"
        placeholder="Host port (e.g. 8080)"
        value={port.host}
        onChange={e => onChange('host', e.target.value)}
      />
      <input
        className="podium-input podium-mono"
        placeholder="Container port (e.g. 80)"
        value={port.container}
        onChange={e => onChange('container', e.target.value)}
      />
      <button
        onClick={onRemove}
        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 8px', color: 'var(--accent-red)', cursor: 'pointer' }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function SmartDeploy() {
  const [phase, setPhase] = useState<Phase>('home');
  const [input, setInput] = useState('');
  const [config, setConfig] = useState<DeployConfig | null>(null);
  const [editConfig, setEditConfig] = useState<DeployConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const [charIdx, setCharIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { error: showError, success } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (phase === 'chat') {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === 'home') {
      const interval = setInterval(() => setCharIdx(i => i + 1), 60);
      return () => clearInterval(interval);
    }
  }, [phase]);

  const analyze = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setPhase('analyzing');
    try {
      const payload = text.startsWith('http') && text.includes('github.com')
        ? { repoUrl: text }
        : { description: text };
      const res = await api.post('/api/ai/natural-deploy', payload);
      const raw = res.data.config as DeployConfig;
      const withIds: DeployConfig = {
        ...raw,
        ports: (raw.ports || []).map(p => ({ _id: uid(), host: p.host, container: p.container })),
        env_vars: (raw.env_vars || []).map(e => ({ _id: uid(), key: e.key, value: e.value, show: false })),
      };
      setConfig(withIds);
      setEditConfig(JSON.parse(JSON.stringify(withIds)));
      setPhase('review');
    } catch (err) {
      showError(parseApiError(err));
      setPhase('chat');
    } finally {
      setLoading(false);
    }
  };

  const updateEnv = useCallback((id: string, field: 'key' | 'value' | 'show', val: string | boolean) => {
    setEditConfig(c => c ? {
      ...c,
      env_vars: c.env_vars.map(e => e._id === id ? { ...e, [field]: val } : e),
    } : c);
  }, []);

  const updatePort = useCallback((id: string, field: 'host' | 'container', val: string) => {
    setEditConfig(c => c ? {
      ...c,
      ports: c.ports.map(p => p._id === id ? { ...p, [field]: val } : p),
    } : c);
  }, []);

  const deploy = async () => {
    if (!editConfig) return;
    setPhase('deploying');
    setLoading(true);
    try {
      const res = await api.post('/api/deployments', {
        name: editConfig.name,
        image: editConfig.image,
        repo_url: editConfig.repo_url,
        branch: editConfig.branch,
        dockerfile_path: editConfig.dockerfile_path,
        ports: editConfig.ports.filter(p => p.host && p.container).map(({ host, container }) => ({ host, container })),
        env_vars: editConfig.env_vars.filter(e => e.key).map(({ key, value }) => ({ key, value })),
        memory_limit: editConfig.memory_limit,
        cpu_limit: editConfig.cpu_limit,
        restart_policy: editConfig.restart_policy,
      });
      setDeployedId(res.data.id);
      setPhase('done');
      success(`"${editConfig.name}" is deploying!`);
    } catch (err) {
      showError(parseApiError(err));
      setPhase('review');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPhase('home');
    setInput('');
    setConfig(null);
    setEditConfig(null);
    setDeployedId(null);
  };

  const rotatingPrompt = PROMPTS[Math.floor(charIdx / 80) % PROMPTS.length];
  const promptChars = charIdx % 80;
  const displayPrompt = rotatingPrompt.slice(0, promptChars);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(99,102,241,0.3)',
          }}>
            <Sparkles size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>Smart Deploy</h1>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Describe your app — AI configures and deploys it</p>
          </div>
        </div>
      </div>

      {phase === 'home' && (
        <div>
          <div style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '48px 40px', textAlign: 'center', marginBottom: 24,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
              What are you deploying?
            </h2>
            <p style={{ margin: '0 0 32px', color: 'var(--text-muted)', fontSize: 14 }}>
              Describe your app in plain English, or paste a GitHub URL. AI will generate the full deployment config.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={() => setPhase('chat')} style={{ gap: 8 }}>
                <Terminal size={15} /> Describe your app
              </Button>
              <Button variant="secondary" onClick={() => { setInput(''); setPhase('chat'); }} style={{ gap: 8 }}>
                <GitBranch size={15} /> Paste GitHub URL
              </Button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
            Example prompts
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {PROMPTS.map(p => (
              <button key={p} onClick={() => { setInput(p); setPhase('chat'); analyze(p); }}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)', padding: '10px 14px',
                  color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                  textAlign: 'left', transition: 'all 150ms',
                  fontFamily: 'var(--font-sans)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <ChevronRight size={11} style={{ marginRight: 6, opacity: 0.5, verticalAlign: 'middle' }} />
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'chat' && (
        <div style={{
          background: 'var(--bg-glass)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 24,
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Describe your app in plain English, or paste a GitHub repo URL:
          </div>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                analyze(input);
              }
            }}
            placeholder={`e.g. "${displayPrompt}|"`}
            rows={4}
            style={{
              width: '100%', padding: '12px 14px',
              background: 'var(--bg-elevated)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
              fontSize: 14, fontFamily: 'var(--font-sans)', resize: 'vertical',
              outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 150ms',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent-blue)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>⌘ + Enter to analyze</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button variant="primary" onClick={() => analyze(input)} disabled={!input.trim()} style={{ gap: 8 }}>
                <Sparkles size={14} /> Analyze & Configure
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === 'analyzing' && (
        <div style={{
          background: 'var(--bg-glass)', border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 16, padding: '56px 40px', textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', animation: 'spin 1.5s linear infinite',
            boxShadow: '0 0 30px rgba(99,102,241,0.4)',
          }}>
            <Sparkles size={24} color="#fff" />
          </div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 700 }}>Analyzing your app...</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
            AI is generating the optimal deployment configuration
          </p>
        </div>
      )}

      {phase === 'review' && editConfig && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {config?.reasoning && (
            <div style={{
              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <Sparkles size={16} style={{ color: '#818cf8', flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {config.reasoning}
              </p>
            </div>
          )}

          <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Basic Configuration
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Deployment Name *" value={editConfig.name}
                onChange={e => setEditConfig(c => c ? { ...c, name: e.target.value } : c)}
                placeholder="my-api" hint="Lowercase, hyphens only" required />
              <Input label="Docker Image" value={editConfig.image}
                onChange={e => setEditConfig(c => c ? { ...c, image: e.target.value } : c)}
                placeholder="node:20-alpine" />
              <Input label="Git Repository" value={editConfig.repo_url}
                onChange={e => setEditConfig(c => c ? { ...c, repo_url: e.target.value } : c)}
                placeholder="https://github.com/org/repo" />
              <Input label="Branch" value={editConfig.branch}
                onChange={e => setEditConfig(c => c ? { ...c, branch: e.target.value } : c)}
                placeholder="main" />
              <Input label="Dockerfile Path" value={editConfig.dockerfile_path}
                onChange={e => setEditConfig(c => c ? { ...c, dockerfile_path: e.target.value } : c)}
                placeholder="Dockerfile" />
            </div>
          </div>

          <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Port Mappings
            </div>
            <div style={{ padding: 16 }}>
              {editConfig.ports.length === 0 && (
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>No ports mapped — add one if your app exposes a port.</p>
              )}
              {editConfig.ports.map(port => (
                <PortRow
                  key={port._id}
                  port={port}
                  onChange={(field, val) => updatePort(port._id, field, val)}
                  onRemove={() => setEditConfig(c => c ? { ...c, ports: c.ports.filter(p => p._id !== port._id) } : c)}
                />
              ))}
              <button
                onClick={() => setEditConfig(c => c ? { ...c, ports: [...c.ports, { _id: uid(), host: '', container: '' }] } : c)}
                style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', padding: '7px 14px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)' }}
              >
                <Plus size={12} /> Add Port
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', justifyContent: 'space-between' }}>
              <span>Environment Variables</span>
              {editConfig.env_vars.length > 0 && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{editConfig.env_vars.length} variable{editConfig.env_vars.length !== 1 ? 's' : ''}</span>}
            </div>
            <div style={{ padding: 16 }}>
              {editConfig.env_vars.length === 0 && (
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>No environment variables — add any secrets or config your app needs.</p>
              )}
              {editConfig.env_vars.map(env => (
                <EnvVarRow
                  key={env._id}
                  env={env}
                  onChange={(field, val) => updateEnv(env._id, field, val as any)}
                  onRemove={() => setEditConfig(c => c ? { ...c, env_vars: c.env_vars.filter(e => e._id !== env._id) } : c)}
                />
              ))}
              <button
                onClick={() => setEditConfig(c => c ? { ...c, env_vars: [...c.env_vars, { _id: uid(), key: '', value: '', show: false }] } : c)}
                style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', padding: '7px 14px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)' }}
              >
                <Plus size={12} /> Add Variable
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Resource Limits
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Input label="Memory Limit" value={editConfig.memory_limit}
                onChange={e => setEditConfig(c => c ? { ...c, memory_limit: e.target.value } : c)}
                placeholder="512m" hint="e.g. 256m, 1g" />
              <Input label="CPU Limit" value={editConfig.cpu_limit}
                onChange={e => setEditConfig(c => c ? { ...c, cpu_limit: e.target.value } : c)}
                placeholder="0.5" hint="e.g. 0.5, 1.0, 2.0" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Restart Policy</label>
                <select value={editConfig.restart_policy}
                  onChange={e => setEditConfig(c => c ? { ...c, restart_policy: e.target.value } : c)}
                  style={{ padding: '7px 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none' }}
                >
                  <option value="unless-stopped">Unless stopped</option>
                  <option value="always">Always</option>
                  <option value="on-failure">On failure</option>
                  <option value="no">No restart</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={reset} style={{ gap: 6 }}>
              <RotateCcw size={13} /> Start over
            </Button>
            <Button variant="primary" onClick={deploy} style={{ gap: 8 }}>
              <Rocket size={15} /> Deploy now
            </Button>
          </div>
        </div>
      )}

      {phase === 'deploying' && (
        <div style={{
          background: 'var(--bg-glass)', border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 16, padding: '56px 40px', textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', animation: 'spin 1.5s linear infinite',
            boxShadow: '0 0 30px rgba(16,185,129,0.4)',
          }}>
            <Rocket size={24} color="#fff" />
          </div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 700 }}>Launching deployment...</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
            Podium is spinning up your container
          </p>
        </div>
      )}

      {phase === 'done' && (
        <div style={{
          background: 'var(--bg-glass)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 16, padding: '48px 40px', textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 0 40px rgba(16,185,129,0.4)',
          }}>
            <CheckCircle size={28} color="#fff" />
          </div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 800, fontSize: 20 }}>
            Deployment started!
          </h3>
          <p style={{ margin: '0 0 28px', color: 'var(--text-muted)', fontSize: 13 }}>
            "{editConfig?.name}" is building. Watch it go live in real time.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button variant="primary" onClick={() => navigate(`/deployments/${deployedId}`)} style={{ gap: 8 }}>
              <Terminal size={14} /> View logs
            </Button>
            <Button variant="secondary" onClick={() => navigate('/deployments')} style={{ gap: 8 }}>
              <Rocket size={14} /> All deployments
            </Button>
            <Button variant="ghost" onClick={reset} style={{ gap: 8 }}>
              <Plus size={14} /> Deploy another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
