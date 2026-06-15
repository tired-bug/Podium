import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, GitBranch, Package, Zap, CheckCircle, ChevronRight, RotateCcw, Rocket } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import { parseApiError } from '../lib/utils';
import api from '../lib/api';

interface DeployConfig {
  name: string;
  image: string;
  repo_url: string;
  branch: string;
  dockerfile_path: string;
  ports: { host: string; container: string }[];
  env_vars: { key: string; value: string }[];
  memory_limit: string;
  cpu_limit: string;
  restart_policy: string;
  reasoning: string;
}

type Mode = 'idle' | 'description' | 'repo' | 'analyzing' | 'review' | 'deploying' | 'done';

const EXAMPLE_PROMPTS = [
  'A Node.js REST API with PostgreSQL',
  'Python FastAPI backend with Redis cache',
  'Next.js fullstack app on port 3000',
  'Nginx reverse proxy for my services',
  'A WordPress site with MySQL',
];

export default function NaturalDeploy() {
  const [mode, setMode] = useState<Mode>('idle');
  const [input, setInput] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [config, setConfig] = useState<DeployConfig | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const repoRef = useRef<HTMLInputElement>(null);
  const { error: showError, success } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === 'description') setTimeout(() => inputRef.current?.focus(), 100);
    if (mode === 'repo') setTimeout(() => repoRef.current?.focus(), 100);
  }, [mode]);

  const analyzeDescription = async (desc: string) => {
    setLoading(true);
    setMode('analyzing');
    try {
      const res = await api.post('/api/ai/natural-deploy', { description: desc });
      setConfig(res.data.config);
      setMode('review');
    } catch (err) {
      showError(parseApiError(err));
      setMode('description');
    } finally {
      setLoading(false);
    }
  };

  const analyzeRepo = async (url: string) => {
    setLoading(true);
    setMode('analyzing');
    try {
      const res = await api.post('/api/ai/natural-deploy', { repoUrl: url });
      setConfig(res.data.config);
      setMode('review');
    } catch (err) {
      showError(parseApiError(err));
      setMode('repo');
    } finally {
      setLoading(false);
    }
  };

  const deploy = async () => {
    if (!config) return;
    setMode('deploying');
    setLoading(true);
    try {
      const res = await api.post('/api/deployments', {
        name: config.name,
        image: config.image,
        repo_url: config.repo_url,
        branch: config.branch,
        dockerfile_path: config.dockerfile_path,
        ports: config.ports.filter(p => p.host && p.container),
        env_vars: config.env_vars.filter(e => e.key),
        memory_limit: config.memory_limit,
        cpu_limit: config.cpu_limit,
        restart_policy: config.restart_policy,
      });
      setDeployedId(res.data.id);
      setMode('done');
      success(`"${config.name}" deployed successfully!`);
    } catch (err) {
      showError(parseApiError(err));
      setMode('review');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMode('idle');
    setInput('');
    setRepoUrl('');
    setConfig(null);
    setEditingField(null);
    setDeployedId(null);
  };

  const updateConfig = (field: string, value: any) => {
    setConfig(c => c ? { ...c, [field]: value } : c);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      <div style={{ textAlign: 'center', paddingTop: 8 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 32px rgba(99,102,241,0.4)',
        }}>
          <Sparkles size={26} color="#fff" />
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
          AI Deploy
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Describe what you want to deploy, or paste a repo URL — AI handles the rest.
        </p>
      </div>

      {mode === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button onClick={() => setMode('description')} style={{
              padding: '20px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)', cursor: 'pointer', textAlign: 'left',
              transition: 'all 200ms', display: 'flex', flexDirection: 'column', gap: 10,
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.06)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={18} color="#6366f1" />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Describe your app</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>Tell AI what you want to deploy in plain language</div>
              </div>
            </button>

            <button onClick={() => setMode('repo')} style={{
              padding: '20px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)', cursor: 'pointer', textAlign: 'left',
              transition: 'all 200ms', display: 'flex', flexDirection: 'column', gap: 10,
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#a855f7'; (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.06)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: 'rgba(168,85,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <GitBranch size={18} color="#a855f7" />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Analyze a repo</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>Paste a GitHub URL — AI detects the stack and configures everything</div>
              </div>
            </button>
          </div>

          <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-muted)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Example prompts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {EXAMPLE_PROMPTS.map(p => (
                <button key={p} onClick={() => { setInput(p); setMode('description'); setTimeout(() => analyzeDescription(p), 200); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '13px' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent-blue)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
                >
                  <ChevronRight size={12} style={{ flexShrink: 0 }} />
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode === 'description' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Describe what you want to deploy</div>
          <div style={{ position: 'relative' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) { e.preventDefault(); analyzeDescription(input.trim()); } }}
              placeholder="e.g. A Node.js REST API with PostgreSQL database, running on port 3000, with JWT authentication..."
              rows={4}
              style={{
                width: '100%', padding: '14px 48px 14px 14px', background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
                color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-sans)',
                resize: 'none', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent-blue)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <button
              onClick={() => input.trim() && analyzeDescription(input.trim())}
              disabled={!input.trim()}
              style={{
                position: 'absolute', right: 10, bottom: 10,
                width: 32, height: 32, borderRadius: 'var(--r-md)',
                background: input.trim() ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 150ms',
              }}
            >
              <Send size={14} color={input.trim() ? '#fff' : 'var(--text-muted)'} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={reset}>← Back</Button>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'center' }}>Press Enter to analyze</div>
          </div>
        </div>
      )}

      {mode === 'repo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>GitHub repository URL</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={repoRef}
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && repoUrl.trim()) analyzeRepo(repoUrl.trim()); }}
              placeholder="https://github.com/owner/repository"
              style={{
                flex: 1, padding: '10px 14px', background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-sans)', outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent-blue)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <Button variant="primary" onClick={() => repoUrl.trim() && analyzeRepo(repoUrl.trim())} disabled={!repoUrl.trim()}>
              Analyze
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} style={{ alignSelf: 'flex-start' }}>← Back</Button>
        </div>
      )}

      {mode === 'analyzing' && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: 'var(--accent-blue)',
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            Analyzing with AI...
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Detecting stack, picking image, configuring ports and resources
          </div>
        </div>
      )}

      {mode === 'review' && config && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '14px 16px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--r-lg)', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600, color: '#818cf8' }}>AI reasoning: </span>{config.reasoning}
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={15} color="var(--accent-blue)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Deployment Configuration</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>Click any field to edit</span>
            </div>

            <div style={{ padding: '4px 0' }}>
              {[
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'image', label: 'Docker Image', type: 'text', mono: true },
                { key: 'repo_url', label: 'Repo URL', type: 'text' },
                { key: 'branch', label: 'Branch', type: 'text' },
                { key: 'memory_limit', label: 'Memory', type: 'select', options: ['256m','512m','1g','2g','4g'] },
                { key: 'cpu_limit', label: 'CPU', type: 'select', options: ['0.25','0.5','1','2'] },
                { key: 'restart_policy', label: 'Restart', type: 'select', options: ['unless-stopped','always','on-failure','no'] },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border-muted)', gap: 12 }}
                  onClick={() => setEditingField(editingField === f.key ? null : f.key)}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: 100, flexShrink: 0, fontWeight: 500 }}>{f.label}</span>
                  {editingField === f.key ? (
                    f.type === 'select' ? (
                      <select
                        value={(config as any)[f.key]}
                        onChange={e => { updateConfig(f.key, e.target.value); setEditingField(null); }}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                        style={{ flex: 1, padding: '4px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--accent-blue)', borderRadius: 'var(--r-sm)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                      >
                        {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        autoFocus
                        value={(config as any)[f.key] || ''}
                        onChange={e => updateConfig(f.key, e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={e => { if (e.key === 'Enter') setEditingField(null); }}
                        onClick={e => e.stopPropagation()}
                        style={{ flex: 1, padding: '4px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--accent-blue)', borderRadius: 'var(--r-sm)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: f.mono ? 'var(--font-mono)' : 'var(--font-sans)', outline: 'none' }}
                      />
                    )
                  ) : (
                    <span style={{ flex: 1, fontSize: '13px', color: (config as any)[f.key] ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: f.mono ? 'var(--font-mono)' : 'var(--font-sans)', cursor: 'text' }}>
                      {(config as any)[f.key] || '—'}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {config.ports.length > 0 && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-muted)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: 100, flexShrink: 0, fontWeight: 500, paddingTop: 2 }}>Ports</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {config.ports.map((p, i) => (
                    <span key={i} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', background: 'var(--bg-tertiary)', padding: '3px 10px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {p.host}:{p.container}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {config.env_vars.filter(e => e.key).length > 0 && (
              <div style={{ padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: 100, flexShrink: 0, fontWeight: 500, paddingTop: 2 }}>Env Vars</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  {config.env_vars.filter(e => e.key).map((e, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--accent-blue)', minWidth: 120 }}>{e.key}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{e.value || '<empty>'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={reset} icon={<RotateCcw size={14} />}>Start over</Button>
            <div style={{ flex: 1 }} />
            <Button variant="primary" onClick={deploy} loading={loading} icon={<Rocket size={14} />}>
              Deploy now
            </Button>
          </div>
        </div>
      )}

      {mode === 'deploying' && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-green)', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Deploying {config?.name}...</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Starting container and streaming logs</div>
        </div>
      )}

      {mode === 'done' && config && (
        <div style={{ textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={28} color="var(--accent-green)" />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>Deployed!</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>"{config.name}" is starting up</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={reset} icon={<Zap size={14} />}>Deploy another</Button>
            <Button variant="primary" onClick={() => navigate(deployedId ? `/deployments/${deployedId}` : '/deployments')} icon={<Rocket size={14} />}>
              View deployment
            </Button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
