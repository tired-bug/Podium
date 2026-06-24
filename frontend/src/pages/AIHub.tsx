import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot, Zap, Shield, FileText, DollarSign, GitCompare,
  AlertTriangle, Cpu, RefreshCw, CheckCircle, XCircle,
  Copy, BarChart2, Loader, Sparkles, Activity,
  TrendingUp, Target, Search, ChevronRight, Globe,
  ExternalLink, Play, Plug, Cloud,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { copyToClipboard, timeAgo } from '../lib/utils';

interface Deployment { id: string; name: string; status: string; }
interface CloudDep {
  id: string; provider: string; name: string; status: string;
  url?: string; created_at: string; updated_at: string;
  provider_deployment_id?: string; provider_error?: string;
  config?: any;
}
interface Provider { id: string; name: string; connected: boolean; isDemo: boolean; }

/* ── Provider logos ──────────────────────────────────────────────────────── */
const PROVIDER_LOGOS: Record<string, React.ReactNode> = {
  render:  <svg viewBox="0 0 20 20" width="16" height="16"><rect width="20" height="20" rx="5" fill="#46E3B7"/><path d="M10 5 L14 10 L10 15 L6 10 Z" fill="#fff" fillOpacity=".9"/></svg>,
  railway: <svg viewBox="0 0 20 20" width="16" height="16"><rect width="20" height="20" rx="5" fill="#0B0D0E"/><rect x="4" y="9" width="12" height="2" rx="1" fill="#fff"/><rect x="6" y="5" width="2" height="10" rx="1" fill="#fff"/><rect x="12" y="5" width="2" height="10" rx="1" fill="#fff"/></svg>,
  vercel:  <svg viewBox="0 0 20 20" width="16" height="16"><rect width="20" height="20" rx="5" fill="#000"/><path d="M10 5 L16 15 H4 Z" fill="#fff"/></svg>,
};

const STATUS_COLORS: Record<string, string> = {
  live: 'var(--accent-green)', building: 'var(--accent-blue)',
  deploying: 'var(--accent-cyan)', failed: 'var(--accent-red)',
  queued: 'var(--accent-orange)', suspended: 'var(--text-muted)',
};

/* ── Sub-components ─────────────────────────────────────────────────────── */

function ResultCard({ title, onCopy, accent = 'var(--border)', children }: {
  title: string; onCopy?: () => void; accent?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 14, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', borderLeft: `3px solid ${accent}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
        {onCopy && (
          <button onClick={onCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 6px', borderRadius: 'var(--r-sm)' }}>
            <Copy size={10} /> Copy
          </button>
        )}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function FeatureCard({ icon, title, subtitle, accent, badge, children }: {
  icon: React.ReactNode; title: string; subtitle: string;
  accent: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${accent}, ${accent}44)` }} />
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
          <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, flexShrink: 0 }}>{icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</div>
          </div>
          {badge && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--r-pill)', background: `${accent}18`, color: accent, border: `1px solid ${accent}44` }}>{badge}</span>}
        </div>
      </div>
      <div style={{ padding: 18, flex: 1 }}>{children}</div>
    </div>
  );
}

function DeploymentSelect({ value, onChange, deployments, placeholder = 'Select deployment...', filter }: {
  value: string; onChange: (v: string) => void;
  deployments: Deployment[]; placeholder?: string;
  filter?: (d: Deployment) => boolean;
}) {
  const opts = filter ? deployments.filter(filter) : deployments;
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: value ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 13, outline: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
      <option value="">{placeholder}</option>
      {opts.map(o => <option key={o.id} value={o.id}>{o.name} ({o.status})</option>)}
    </select>
  );
}

const SEVERITY_COLOR: Record<string, string> = {
  low: '#10b981', medium: '#f59e0b', high: '#ef4444', critical: '#dc2626',
};

function SeverityBadge({ level }: { level: string }) {
  const color = SEVERITY_COLOR[level?.toLowerCase()] || 'var(--text-muted)';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}18`, borderRadius: 'var(--r-pill)', padding: '2px 8px', textTransform: 'uppercase', border: `1px solid ${color}33` }}>{level}</span>
  );
}

function ScoreRing({ score, max = 100, color, label }: { score: number; max?: number; color: string; label?: string }) {
  const pct = Math.min(100, (score / max) * 100);
  const r = 26, circ = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={64} height={64} style={{ flexShrink: 0 }}>
        <circle cx={32} cy={32} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={5} />
        <circle cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
          strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.7s ease' }} />
        <text x={32} y={37} textAnchor="middle" fontSize={13} fontWeight="bold" fill={color}>{score}</text>
      </svg>
      {label && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>}
    </div>
  );
}

function RunButton({ loading, onClick, disabled, icon, label, loadingLabel }: {
  loading: boolean; onClick: () => void; disabled?: boolean;
  icon: React.ReactNode; label: string; loadingLabel: string;
}) {
  return (
    <Button variant="primary" style={{ width: '100%', marginTop: 10, justifyContent: 'center' }} onClick={onClick} disabled={disabled || loading}>
      {loading ? <><Loader size={13} style={{ animation: 'spin .7s linear infinite' }} /> {loadingLabel}</> : <>{icon} {label}</>}
    </Button>
  );
}

/* ── Global Deployments Overview ─────────────────────────────────────────── */
function GlobalDeploymentsPanel({ providers, cloudDeps }: { providers: Provider[]; cloudDeps: CloudDep[] }) {
  const navigate = useNavigate();
  const connectedProviders = providers.filter(p => p.connected && !p.isDemo);

  const byProvider = connectedProviders.reduce((acc, p) => {
    acc[p.id] = cloudDeps.filter(d => d.provider === p.id);
    return acc;
  }, {} as Record<string, CloudDep[]>);

  const totalLive = cloudDeps.filter(d => d.status === 'live').length;
  const totalBuilding = cloudDeps.filter(d => ['building', 'deploying', 'queued'].includes(d.status)).length;
  const totalFailed = cloudDeps.filter(d => d.status === 'failed').length;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ height: 2, background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-purple), var(--accent-cyan))' }} />
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={17} color="var(--accent-blue)" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Global Deployments</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Live view across all connected providers</div>
          </div>
        </div>
        <Button size="sm" variant="ghost" icon={<ExternalLink size={12} />} onClick={() => navigate('/cloud')}>
          Manage
        </Button>
      </div>

      <div style={{ padding: '18px 22px' }}>
        {connectedProviders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Plug size={24} color="var(--text-muted)" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>No providers connected yet</div>
            <Button size="sm" variant="primary" onClick={() => navigate('/providers')}>Connect a provider</Button>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
              {[
                { label: 'Live', value: totalLive, color: 'var(--accent-green)', icon: <Activity size={13} /> },
                { label: 'Building', value: totalBuilding, color: 'var(--accent-blue)', icon: <TrendingUp size={13} /> },
                { label: 'Failed', value: totalFailed, color: totalFailed > 0 ? 'var(--accent-red)' : 'var(--text-muted)', icon: <XCircle size={13} /> },
                { label: 'Providers', value: connectedProviders.length, color: 'var(--accent-purple)', icon: <Cloud size={13} /> },
              ].map(stat => (
                <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 'var(--r-md)', background: `${stat.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color }}>{stat.icon}</div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Per-provider breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {connectedProviders.map(p => {
                const deps = byProvider[p.id] || [];
                const live = deps.filter(d => d.status === 'live').length;
                const failed = deps.filter(d => d.status === 'failed').length;
                return (
                  <div key={p.id} style={{ padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      {PROVIDER_LOGOS[p.id] || <Globe size={14} />}
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                      <span><span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{live}</span> live</span>
                      <span>·</span>
                      <span><span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{deps.length}</span> total</span>
                      {failed > 0 && <><span>·</span><span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>{failed} failed</span></>}
                    </div>
                    {/* Most recent deployments */}
                    {deps.slice(0, 2).map(d => {
                      const sc = STATUS_COLORS[d.status] || 'var(--text-muted)';
                      return (
                        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11 }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                          {d.url && <a href={d.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', display: 'flex' }} onClick={e => e.stopPropagation()}><ExternalLink size={10} /></a>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Recent activity */}
            {cloudDeps.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Recent Activity</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {cloudDeps.slice(0, 5).map(d => {
                    const sc = STATUS_COLORS[d.status] || 'var(--text-muted)';
                    return (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', fontSize: 12 }}>
                        {PROVIDER_LOGOS[d.provider] || <Globe size={13} />}
                        <span style={{ flex: 1, color: 'var(--text-primary)', fontWeight: 600 }}>{d.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 'var(--r-pill)', background: `${sc}18`, border: `1px solid ${sc}33` }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: sc }} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: sc, textTransform: 'capitalize' }}>{d.status}</span>
                        </div>
                        {d.url && <a href={d.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', display: 'flex' }}><ExternalLink size={11} /></a>}
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(d.updated_at)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Platform Summary (now provider-aware) ──────────────────────────────── */
function PlatformSummaryCard({ cloudDeps }: { cloudDeps: CloudDep[] }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data: d } = await api.get('/api/ai/platform-summary'); setData(d); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = data?.stats;
  const healthScore = s ? Math.max(0, 100 - (s.failedDeps * 10) - (s.criticalAnomalies * 20) - (s.openAnomalies * 5) - Math.min(s.recentErrors * 2, 20)) : null;
  const hColor = healthScore === null ? 'var(--text-muted)' : healthScore > 70 ? 'var(--accent-green)' : healthScore > 40 ? 'var(--accent-orange)' : 'var(--accent-red)';

  // Merge provider data into health context
  const cloudLive = cloudDeps.filter(d => d.status === 'live').length;
  const cloudFailed = cloudDeps.filter(d => d.status === 'failed').length;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ height: 2, background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-purple))' }} />
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 'var(--r-md)', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart2 size={16} color="var(--accent-blue)" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Platform Health</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>AI-generated overview across all providers</div>
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '5px 8px', borderRadius: 'var(--r-sm)' }}>
          <RefreshCw size={12} style={{ animation: loading ? 'spin .7s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {loading && !data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
            <Loader size={15} style={{ animation: 'spin .7s linear infinite' }} /> Analyzing platform...
          </div>
        )}
        {data && (
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1 }}>
              {[
                { label: 'Running', value: s.runningDeps, color: 'var(--accent-green)', icon: <Activity size={13} /> },
                { label: 'Failed', value: s.failedDeps, color: 'var(--accent-red)', icon: <XCircle size={13} /> },
                { label: 'Cloud Live', value: cloudLive, color: 'var(--accent-blue)', icon: <Cloud size={13} /> },
                { label: 'Cloud Failed', value: cloudFailed, color: cloudFailed > 0 ? 'var(--accent-red)' : 'var(--text-muted)', icon: <AlertTriangle size={13} /> },
              ].map(stat => (
                <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 'var(--r-md)', background: `${stat.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color }}>{stat.icon}</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
            {healthScore !== null && <ScoreRing score={healthScore} color={hColor} label="Health" />}
          </div>
        )}
        {data?.summary && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, padding: '10px 14px', background: 'rgba(99,102,241,0.06)', borderRadius: 'var(--r-md)', borderLeft: '3px solid var(--accent-blue)' }}>
            <Sparkles size={12} color="var(--accent-blue)" style={{ marginRight: 6 }} />
            {data.summary}
          </div>
        )}
        {data && !data.summary && data.aiError && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--accent-orange)', lineHeight: 1.7, padding: '10px 14px', background: 'var(--accent-orange-dim)', borderRadius: 'var(--r-md)', borderLeft: '3px solid var(--accent-orange)' }}>
            <AlertTriangle size={12} color="var(--accent-orange)" style={{ marginRight: 6 }} />
            {data.aiError}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Risk Score ─────────────────────────────────────────────────────────── */
function RiskScoreCard({ deployments }: { deployments: Deployment[] }) {
  const [depId, setDepId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const run = async () => {
    const dep = deployments.find(d => d.id === depId);
    if (!dep) return;
    setLoading(true);
    try { const { data } = await api.post('/api/ai/risk-score', { name: dep.name }); setResult(data); }
    catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  const rColor = result ? (SEVERITY_COLOR[result.level] || 'var(--accent-orange)') : 'var(--accent-purple)';
  return (
    <FeatureCard icon={<Target size={16} />} title="Deployment Risk Score" subtitle="Pre-deploy risk assessment" accent="var(--accent-purple)">
      <DeploymentSelect value={depId} onChange={v => { setDepId(v); setResult(null); }} deployments={deployments} />
      <RunButton loading={loading} onClick={run} disabled={!depId} icon={<Target size={13} />} label="Score Risk" loadingLabel="Analyzing..." />
      {result && (
        <ResultCard title="Risk Assessment" accent={rColor} onCopy={() => copyToClipboard(JSON.stringify(result, null, 2))}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
            <ScoreRing score={result.score} color={rColor} label="Risk" />
            <div><SeverityBadge level={result.level} /><div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>Risk Level</div></div>
          </div>
          {result.blockers?.length > 0 && (
            <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--r-md)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-red)', marginBottom: 5 }}>🚫 Blockers</div>
              {result.blockers.map((b: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--accent-red)', padding: '1px 0' }}>• {b}</div>)}
            </div>
          )}
          {result.risks?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Risks</div>
              {result.risks.map((r: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>• {r}</div>)}
            </div>
          )}
          {result.recommendations?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Recommendations</div>
              {result.recommendations.map((r: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--accent-green)', padding: '2px 0' }}>✓ {r}</div>)}
            </div>
          )}
        </ResultCard>
      )}
    </FeatureCard>
  );
}

/* ── Root Cause ─────────────────────────────────────────────────────────── */
function RootCauseCard({ deployments }: { deployments: Deployment[] }) {
  const [depId, setDepId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const run = async () => {
    setLoading(true);
    try { const { data } = await api.post('/api/ai/root-cause', { deploymentId: depId }); setResult(data); }
    catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <FeatureCard icon={<Search size={16} />} title="Root Cause Analysis" subtitle="AI explains why things failed" accent="var(--accent-orange)">
      <DeploymentSelect value={depId} onChange={v => { setDepId(v); setResult(null); }} deployments={deployments} filter={d => ['failed', 'stopped', 'running'].includes(d.status)} />
      <RunButton loading={loading} onClick={run} disabled={!depId} icon={<Search size={13} />} label="Diagnose" loadingLabel="Diagnosing..." />
      {result && (
        <ResultCard title="Root Cause" accent="var(--accent-orange)" onCopy={() => copyToClipboard(result.rootCause)}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{result.rootCause}</div>
        </ResultCard>
      )}
    </FeatureCard>
  );
}

/* ── Optimize ───────────────────────────────────────────────────────────── */
function OptimizeCard({ deployments }: { deployments: Deployment[] }) {
  const [depId, setDepId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const run = async () => {
    setLoading(true);
    try { const { data } = await api.post('/api/ai/optimize-config', { deploymentId: depId }); setResult(data); }
    catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <FeatureCard icon={<Cpu size={16} />} title="Resource Optimizer" subtitle="Right-size CPU, memory & replicas" accent="var(--accent-teal, #14b8a6)">
      <DeploymentSelect value={depId} onChange={v => { setDepId(v); setResult(null); }} deployments={deployments} />
      <RunButton loading={loading} onClick={run} disabled={!depId} icon={<Cpu size={13} />} label="Optimize" loadingLabel="Analyzing..." />
      {result && (
        <ResultCard title="Optimization" accent="#14b8a6" onCopy={() => copyToClipboard(JSON.stringify(result, null, 2))}>
          {result.recommendations?.map((rec: any, i: number) => (
            <div key={i} style={{ marginBottom: 10, padding: '10px 13px', background: 'rgba(20,184,166,0.06)', borderRadius: 'var(--r-md)', border: '1px solid rgba(20,184,166,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{rec.field?.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{rec.current} <span style={{ color: '#14b8a6' }}>→ {rec.suggested}</span></span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{rec.reason}</div>
            </div>
          ))}
          {result.estimatedSavings && <div style={{ fontSize: 12, color: 'var(--accent-green)', marginTop: 6 }}>💰 {result.estimatedSavings}</div>}
        </ResultCard>
      )}
    </FeatureCard>
  );
}

/* ── Security Scan ──────────────────────────────────────────────────────── */
function SecurityScanCard({ deployments }: { deployments: Deployment[] }) {
  const [depId, setDepId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const run = async () => {
    setLoading(true);
    try { const { data } = await api.post('/api/ai/security-scan', { deploymentId: depId }); setResult(data); }
    catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  const sColor = result ? (result.score > 70 ? 'var(--accent-green)' : result.score > 40 ? 'var(--accent-orange)' : 'var(--accent-red)') : 'var(--accent-red)';
  return (
    <FeatureCard icon={<Shield size={16} />} title="Security Scanner" subtitle="GDPR, SOC2 & hardening review" accent="var(--accent-red)">
      <DeploymentSelect value={depId} onChange={v => { setDepId(v); setResult(null); }} deployments={deployments} />
      <RunButton loading={loading} onClick={run} disabled={!depId} icon={<Shield size={13} />} label="Security Scan" loadingLabel="Scanning..." />
      {result && (
        <ResultCard title="Security Report" accent={sColor} onCopy={() => copyToClipboard(JSON.stringify(result, null, 2))}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
            <ScoreRing score={result.score} color={sColor} label="Score" />
            <div><SeverityBadge level={result.overallRisk} /><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Overall Risk</div></div>
          </div>
          {result.findings?.map((f: any, i: number) => (
            <div key={i} style={{ marginBottom: 8, padding: '9px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', borderLeft: `3px solid ${SEVERITY_COLOR[f.severity] || 'var(--border)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><SeverityBadge level={f.severity} /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.category}</span></div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>{f.issue}</div>
              <div style={{ fontSize: 11, color: 'var(--accent-green)' }}>Fix: {f.fix}</div>
            </div>
          ))}
          {result.passed?.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {result.passed.map((p: string, i: number) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle size={10} />{p}
                </div>
              ))}
            </div>
          )}
        </ResultCard>
      )}
    </FeatureCard>
  );
}

/* ── AI Deploy (provider-aware quick deploy from hub) ────────────────────── */
function QuickDeployCard({ providers }: { providers: Provider[] }) {
  const navigate = useNavigate();
  const connectedProviders = providers.filter(p => p.connected && !p.isDemo);

  return (
    <FeatureCard icon={<Zap size={16} />} title="Quick AI Deploy" subtitle="Natural language → provider deployment" accent="var(--accent-blue)" badge="AI">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {connectedProviders.length === 0 ? (
          <div style={{ padding: '14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--accent-orange)', textAlign: 'center' }}>
            <AlertTriangle size={14} style={{ marginBottom: 6, display: 'block', margin: '0 auto 6px' }} />
            Connect a provider to enable AI Deploy
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {connectedProviders.map(p => (
              <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: '3px 10px' }}>
                {PROVIDER_LOGOS[p.id]} {p.name}
              </span>
            ))}
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          Describe your app in plain language — AI configures and deploys it to your connected provider automatically.
        </p>
        {[
          'Node.js REST API with PostgreSQL on port 3000',
          'Python FastAPI backend with Redis cache',
          'Next.js app with SSR on port 3000',
        ].map((ex, i) => (
          <button key={i} onClick={() => navigate(`/deploy`)} style={{ fontSize: 11, padding: '7px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', cursor: 'pointer', color: 'var(--text-secondary)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 120ms' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
            <ChevronRight size={11} color="var(--accent-blue)" />{ex}
          </button>
        ))}
        <Button variant="primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => navigate('/deploy')} icon={<Sparkles size={13} />}>
          Open AI Deploy
        </Button>
      </div>
    </FeatureCard>
  );
}

/* ── Incident Report ────────────────────────────────────────────────────── */
function IncidentReportCard({ deployments }: { deployments: Deployment[] }) {
  const [depId, setDepId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const run = async () => {
    setLoading(true);
    try { const { data } = await api.post('/api/ai/incident-report', { deploymentId: depId }); setResult(data); }
    catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <FeatureCard icon={<FileText size={16} />} title="Incident Report" subtitle="Auto-generate professional incident docs" accent="var(--accent-purple)">
      <DeploymentSelect value={depId} onChange={v => { setDepId(v); setResult(null); }} deployments={deployments} />
      <RunButton loading={loading} onClick={run} disabled={!depId} icon={<FileText size={13} />} label="Generate Report" loadingLabel="Generating..." />
      {result && (
        <ResultCard title={`Incident Report — ${result.deployment}`} accent="var(--accent-purple)" onCopy={() => copyToClipboard(result.report)}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Generated at {new Date(result.generatedAt).toLocaleString()}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto' }}>{result.report}</div>
        </ResultCard>
      )}
    </FeatureCard>
  );
}

/* ── Cost Analysis (provider-aware) ─────────────────────────────────────── */
function CostAnalysisCard({ cloudDeps, providers }: { cloudDeps: CloudDep[]; providers: Provider[] }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const { data: d } = await api.get('/api/ai/cost-analysis'); setData(d); } catch {}
    setLoading(false);
  };

  const providerBreakdown = providers.filter(p => p.connected && !p.isDemo).map(p => ({
    name: p.name,
    id: p.id,
    count: cloudDeps.filter(d => d.provider === p.id).length,
    live: cloudDeps.filter(d => d.provider === p.id && d.status === 'live').length,
  }));

  return (
    <FeatureCard icon={<DollarSign size={16} />} title="Cost Analysis" subtitle="Estimated spend across all providers" accent="var(--accent-green)">
      {providerBreakdown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {providerBreakdown.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', fontSize: 12 }}>
              {PROVIDER_LOGOS[p.id] || <Globe size={13} />}
              <span style={{ flex: 1, color: 'var(--text-secondary)', fontWeight: 600 }}>{p.name}</span>
              <span style={{ color: 'var(--accent-green)' }}>{p.live} live</span>
              <span style={{ color: 'var(--text-muted)' }}>/ {p.count} total</span>
            </div>
          ))}
        </div>
      )}
      <RunButton loading={loading} onClick={load} icon={<DollarSign size={13} />} label="Analyze Costs" loadingLabel="Loading..." />
      {data && (
        <ResultCard title="Monthly Cost Estimate" accent="var(--accent-green)">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 14 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-green)' }}>${data.totalMonthlyEstimate}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/mo</span>
          </div>
          {data.breakdown?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {data.breakdown.map((d: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-muted)', fontSize: 13 }}>
                  <div><span style={{ fontWeight: 600 }}>{d.name}</span> <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({d.provider})</span></div>
                  <div style={{ color: 'var(--accent-green)', fontWeight: 700 }}>${d.estimatedMonthlyCost.toFixed(2)}</div>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No running cloud deployments</div>}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{data.note}</div>
        </ResultCard>
      )}
    </FeatureCard>
  );
}

/* ── Compare Deployments ────────────────────────────────────────────────── */
function CompareCard({ deployments }: { deployments: Deployment[] }) {
  const [depA, setDepA] = useState('');
  const [depB, setDepB] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const run = async () => {
    if (!depA || !depB || depA === depB) return;
    setLoading(true);
    try {
      const { data } = await api.post('/api/ai/compare-deployments', { deploymentIdA: depA, deploymentIdB: depB });
      setResult(data);
    } catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  const opts = deployments.map(d => ({ value: d.id, label: `${d.name} (${d.status})` }));
  return (
    <FeatureCard icon={<GitCompare size={16} />} title="Compare Deployments" subtitle="A/B performance & config comparison" accent="var(--accent-cyan)">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select value={depA} onChange={e => { setDepA(e.target.value); setResult(null); }} style={{ padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: depA ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
          <option value="">Deployment A</option>
          {opts.filter(o => o.value !== depB).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={depB} onChange={e => { setDepB(e.target.value); setResult(null); }} style={{ padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: depB ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
          <option value="">Deployment B</option>
          {opts.filter(o => o.value !== depA).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <RunButton loading={loading} onClick={run} disabled={!depA || !depB || depA === depB} icon={<GitCompare size={13} />} label="Compare" loadingLabel="Comparing..." />
      {result && (
        <ResultCard title={`${result.deploymentA} vs ${result.deploymentB}`} accent="var(--accent-cyan)" onCopy={() => copyToClipboard(result.comparison)}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{result.comparison}</div>
        </ResultCard>
      )}
    </FeatureCard>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function AIHub() {
  const navigate = useNavigate();
  const [deps, setDeps] = useState<Deployment[]>([]);
  const [cloudDeps, setCloudDeps] = useState<CloudDep[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [dRes, cdRes, pRes] = await Promise.all([
        api.get('/api/deployments').catch(() => ({ data: [] })),
        api.get('/api/providers/deployments').catch(() => ({ data: [] })),
        api.get('/api/providers').catch(() => ({ data: [] })),
      ]);
      setDeps(dRes.data || []);
      setCloudDeps(cdRes.data || []);
      setProviders(pRes.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Merge local + cloud deployments for AI tools
  const allDeps: Deployment[] = [
    ...deps,
    ...cloudDeps.map(d => ({ id: d.id, name: `${d.name} (${d.provider})`, status: d.status })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 'var(--r-xl)', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 28px rgba(99,102,241,0.35)' }}>
          <Bot size={22} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-.01em' }}>AI Intelligence Hub</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0' }}>
            Global deployments overview + 8 AI-powered DevOps tools
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={load}>Refresh</Button>
          <button onClick={() => navigate('/deploy')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', borderRadius: 'var(--r-md)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', boxShadow: '0 0 16px rgba(99,102,241,0.3)', border: 'none', cursor: 'pointer' }}>
            <Sparkles size={13} /> AI Deploy
          </button>
        </div>
      </div>

      {/* Global deployments panel */}
      <GlobalDeploymentsPanel providers={providers} cloudDeps={cloudDeps} />

      {/* Platform health summary */}
      <PlatformSummaryCard cloudDeps={cloudDeps} />

      {/* AI tools grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        <RiskScoreCard deployments={allDeps} />
        <RootCauseCard deployments={allDeps} />
        <OptimizeCard deployments={allDeps} />
        <SecurityScanCard deployments={allDeps} />
        <QuickDeployCard providers={providers} />
        <IncidentReportCard deployments={allDeps} />
        <CostAnalysisCard cloudDeps={cloudDeps} providers={providers} />
        <CompareCard deployments={allDeps} />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
