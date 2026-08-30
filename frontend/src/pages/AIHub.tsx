import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot, FileText, AlertTriangle, RefreshCw, XCircle,
  Copy, Loader, Sparkles, Activity,
  TrendingUp, Search, Globe, Download,
  ExternalLink, Plug, Cloud, BarChart2,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { copyToClipboard, timeAgo } from '../lib/utils';
import { buildIncidentReportPdfPreview } from '../lib/incidentPdf';

interface Deployment { id: string; name: string; status: string; }
interface CloudDep {
  id: string; provider: string; name: string; status: string;
  url?: string; created_at: string; updated_at: string;
  provider_deployment_id?: string; provider_error?: string; config?: any;
}
interface Provider { id: string; name: string; connected: boolean; }

const PROVIDER_LOGOS: Record<string, React.ReactNode> = {
  render:  <svg viewBox="0 0 20 20" width="14" height="14"><rect width="20" height="20" rx="5" fill="#46E3B7"/><path d="M10 5 L14 10 L10 15 L6 10 Z" fill="#fff" fillOpacity=".9"/></svg>,
  railway: <svg viewBox="0 0 20 20" width="14" height="14"><rect width="20" height="20" rx="5" fill="#0B0D0E"/><rect x="4" y="9" width="12" height="2" rx="1" fill="#fff"/><rect x="6" y="5" width="2" height="10" rx="1" fill="#fff"/><rect x="12" y="5" width="2" height="10" rx="1" fill="#fff"/></svg>,
  vercel:  <svg viewBox="0 0 20 20" width="14" height="14"><rect width="20" height="20" rx="5" fill="#000"/><path d="M10 5 L16 15 H4 Z" fill="#fff"/></svg>,
};

const STATUS_COLORS: Record<string, string> = {
  live: '#10b981', building: '#6366f1', deploying: '#22d3ee',
  failed: '#ef4444', queued: '#f59e0b', suspended: '#5a5a7a',
};

// ── AI Tool definitions for the navigation cards ──────────────────────────
const AI_TOOLS = [
  { id: 'rootcause', icon: <Search size={18} />,    label: 'Root Cause',       desc: 'AI explains why deployments fail',     accent: '#f59e0b', gradient: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
  { id: 'incident',  icon: <FileText size={18} />,  label: 'Incident Report',  desc: 'Auto-generate professional docs',      accent: '#a855f7', gradient: 'linear-gradient(135deg,#a855f7,#ec4899)' },
];

// ── Sub-components ────────────────────────────────────────────────────────

function ResultCard({ title, onCopy, accent = 'var(--border)', children }: {
  title: string; onCopy?: () => void; accent?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 14, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', borderLeft: `3px solid ${accent}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
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

function ToolPanel({ tool, children }: { tool: typeof AI_TOOLS[0]; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 2, background: tool.gradient }} />
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: `${tool.accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tool.accent, flexShrink: 0 }}>
            {tool.icon}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{tool.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{tool.desc}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: 16, flex: 1 }}>{children}</div>
    </div>
  );
}

function DeploymentSelect({ value, onChange, deployments, placeholder = 'Select deployment…', filter }: {
  value: string; onChange: (v: string) => void; deployments: Deployment[]; placeholder?: string; filter?: (d: Deployment) => boolean;
}) {
  const opts = filter ? deployments.filter(filter) : deployments;
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: value ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 13, outline: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
      <option value="">{placeholder}</option>
      {opts.map(o => <option key={o.id} value={o.id}>{o.name} ({o.status})</option>)}
    </select>
  );
}

function ScoreRing({ score, max = 100, color, label }: { score: number; max?: number; color: string; label?: string }) {
  const pct = Math.min(100, (score / max) * 100);
  const r = 26, circ = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={64} height={64}>
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

function RunButton({ loading, onClick, disabled, icon, label, loadingLabel, accent }: {
  loading: boolean; onClick: () => void; disabled?: boolean; icon: React.ReactNode;
  label: string; loadingLabel: string; accent?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      width: '100%', marginTop: 10, padding: '9px 14px', borderRadius: 'var(--r-md)',
      background: disabled || loading ? 'var(--bg-elevated)' : (accent ? `${accent}22` : 'var(--accent-blue-dim)'),
      border: `1px solid ${disabled || loading ? 'var(--border)' : (accent ? `${accent}44` : 'var(--border-glow)')}`,
      color: disabled || loading ? 'var(--text-muted)' : (accent || 'var(--accent-blue-2)'),
      fontSize: 13, fontWeight: 600, cursor: disabled || loading ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      fontFamily: 'var(--font-sans)', transition: 'all 150ms',
    }}>
      {loading ? <><Loader size={13} style={{ animation: 'spin .7s linear infinite' }} /> {loadingLabel}</> : <>{icon} {label}</>}
    </button>
  );
}

// ── Navigation Cards ──────────────────────────────────────────────────────

function ToolNavCards({ activeToolId, onSelect }: { activeToolId: string | null; onSelect: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 28 }}>
      {AI_TOOLS.map(tool => {
        const isActive = activeToolId === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => onSelect(tool.id)}
            style={{
              padding: '14px 16px', borderRadius: 'var(--r-lg)', border: `1px solid ${isActive ? `${tool.accent}55` : 'var(--border)'}`,
              background: isActive ? `${tool.accent}12` : 'var(--bg-card)',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
              transition: 'all 150ms', position: 'relative', overflow: 'hidden',
            }}
            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = `${tool.accent}44`; e.currentTarget.style.background = `${tool.accent}08`; } }}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; } }}
          >
            {isActive && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: tool.gradient }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ color: tool.accent, display: 'flex', opacity: isActive ? 1 : 0.7 }}>{tool.icon}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? tool.accent : 'var(--text-primary)', marginBottom: 2 }}>{tool.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{tool.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

// ── Overview Panel ────────────────────────────────────────────────────────

function OverviewPanel({ providers, cloudDeps }: { providers: Provider[]; cloudDeps: CloudDep[] }) {
  const navigate = useNavigate();
  const connected = providers.filter(p => p.connected);
  const totalLive = cloudDeps.filter(d => d.status === 'live').length;
  const totalBuilding = cloudDeps.filter(d => ['building', 'deploying', 'queued'].includes(d.status)).length;
  const totalFailed = cloudDeps.filter(d => d.status === 'failed').length;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ height: 2, background: 'linear-gradient(90deg,#6366f1,#a855f7,#22d3ee)' }} />
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 'var(--r-md)', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={16} color="var(--accent-blue)" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Global Deployments</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Live across {connected.length} connected provider{connected.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <Button size="sm" variant="ghost" icon={<ExternalLink size={12} />} onClick={() => navigate('/cloud')}>Manage</Button>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {connected.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Plug size={22} color="var(--text-muted)" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>No providers connected yet</div>
            <Button size="sm" variant="primary" onClick={() => navigate('/providers')}>Connect a provider</Button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Live', value: totalLive, color: '#10b981', icon: <Activity size={12} /> },
                { label: 'Building', value: totalBuilding, color: '#6366f1', icon: <TrendingUp size={12} /> },
                { label: 'Failed', value: totalFailed, color: totalFailed > 0 ? '#ef4444' : 'var(--text-muted)', icon: <XCircle size={12} /> },
                { label: 'Providers', value: connected.length, color: '#a855f7', icon: <Cloud size={12} /> },
              ].map(stat => (
                <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 'var(--r-md)', background: `${stat.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color }}>{stat.icon}</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
            {cloudDeps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cloudDeps.slice(0, 4).map(d => {
                  const sc = STATUS_COLORS[d.status] || 'var(--text-muted)';
                  return (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', fontSize: 12 }}>
                      {PROVIDER_LOGOS[d.provider] || <Globe size={12} />}
                      <span style={{ flex: 1, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 'var(--r-pill)', background: `${sc}18`, border: `1px solid ${sc}33` }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: sc }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: sc, textTransform: 'capitalize' }}>{d.status}</span>
                      </div>
                      {d.url && <a href={d.url} target="_blank" rel="noreferrer" style={{ color: '#6366f1', display: 'flex' }}><ExternalLink size={11} /></a>}
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 56, textAlign: 'right' }}>{timeAgo(d.updated_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Platform Health ───────────────────────────────────────────────────────

function PlatformHealth({ cloudDeps }: { cloudDeps: CloudDep[] }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data: d } = await api.get('/api/ai/platform-summary'); setData(d); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = data?.stats;
  const cloudLive = cloudDeps.filter(d => d.status === 'live').length;
  const cloudFailed = cloudDeps.filter(d => d.status === 'failed').length;
  const healthScore = s ? Math.max(0, 100 - (s.failedDeps * 10) - Math.min(s.recentErrors * 2, 20)) : null;
  const hColor = healthScore === null ? 'var(--text-muted)' : healthScore > 70 ? '#10b981' : healthScore > 40 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden', marginBottom: 28 }}>
      <div style={{ height: 2, background: 'linear-gradient(90deg,#6366f1,#a855f7)' }} />
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart2 size={15} color="var(--accent-blue)" />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Platform Health</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— AI-generated overview</span>
        </div>
        <button onClick={load} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', borderRadius: 'var(--r-sm)', fontFamily: 'var(--font-sans)' }}>
          <RefreshCw size={12} style={{ animation: loading ? 'spin .7s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>
      <div style={{ padding: '14px 18px' }}>
        {loading && !data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <Loader size={14} style={{ animation: 'spin .7s linear infinite' }} /> Analyzing…
          </div>
        )}
        {data && (
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1 }}>
              {[
                { label: 'Running', value: s.runningDeps, color: '#10b981', icon: <Activity size={12} /> },
                { label: 'Failed', value: s.failedDeps, color: '#ef4444', icon: <XCircle size={12} /> },
                { label: 'Cloud Live', value: cloudLive, color: '#6366f1', icon: <Cloud size={12} /> },
                { label: 'Cloud Failed', value: cloudFailed, color: cloudFailed > 0 ? '#ef4444' : 'var(--text-muted)', icon: <AlertTriangle size={12} /> },
              ].map(stat => (
                <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 'var(--r-md)', background: `${stat.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color }}>{stat.icon}</div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
            {healthScore !== null && <ScoreRing score={healthScore} color={hColor} label="Health" />}
          </div>
        )}
        {data?.summary && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, padding: '10px 14px', background: 'rgba(99,102,241,0.06)', borderRadius: 'var(--r-md)', borderLeft: '3px solid #6366f1' }}>
            <Sparkles size={12} color="#6366f1" style={{ marginRight: 6 }} />{data.summary}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Individual tool panels ────────────────────────────────────────────────

function RootCauseTool({ deployments, onSaved }: { deployments: Deployment[]; onSaved: () => void }) {
  const [depId, setDepId] = useState(''); const [result, setResult] = useState<any>(null); const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();
  const tool = AI_TOOLS.find(t => t.id === 'rootcause')!;
  const run = async () => {
    setLoading(true);
    try { const { data } = await api.post('/api/ai/root-cause', { deploymentId: depId }); setResult(data); onSaved(); }
    catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };
  return (
    <ToolPanel tool={tool}>
      <DeploymentSelect value={depId} onChange={v => { setDepId(v); setResult(null); }} deployments={deployments} filter={d => ['failed', 'stopped', 'running'].includes(d.status)} />
      <RunButton loading={loading} onClick={run} disabled={!depId} icon={<Search size={13} />} label="Diagnose" loadingLabel="Diagnosing…" accent={tool.accent} />
      {result && <ResultCard title="Root Cause" accent={tool.accent} onCopy={() => copyToClipboard(result.rootCause)}><div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{result.rootCause}</div></ResultCard>}
    </ToolPanel>
  );
}

function IncidentTool({ deployments, onSaved }: { deployments: Deployment[]; onSaved: () => void }) {
  const [depId, setDepId] = useState(''); const [result, setResult] = useState<any>(null); const [loading, setLoading] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; filename: string; save: () => void; revoke: () => void } | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const { error: showError } = useToast();
  const tool = AI_TOOLS.find(t => t.id === 'incident')!;
  const run = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/ai/incident-report', { deploymentId: depId });
      setResult(data);
      pdf?.revoke();
      const built = buildIncidentReportPdfPreview({ deploymentName: data.deployment, generatedAt: data.generatedAt, reportText: data.report });
      setPdf(built);
      setPdfOpen(true);
      onSaved();
    } catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };
  useEffect(() => () => pdf?.revoke(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ToolPanel tool={tool}>
      <DeploymentSelect value={depId} onChange={v => { setDepId(v); setResult(null); }} deployments={deployments} />
      <RunButton loading={loading} onClick={run} disabled={!depId} icon={<FileText size={13} />} label="Generate Report" loadingLabel="Generating…" accent={tool.accent} />
      {result && !pdfOpen && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Report for <strong style={{ color: 'var(--text-primary)' }}>{result.deployment}</strong> is ready</div>
          <Button size="sm" variant="ghost" icon={<FileText size={12} />} onClick={() => setPdfOpen(true)}>View PDF</Button>
        </div>
      )}
      <Modal
        open={pdfOpen && !!pdf}
        onClose={() => setPdfOpen(false)}
        title={result ? `Incident Report — ${result.deployment}` : 'Incident Report'}
        width={760}
        footer={
          <>
            <Button variant="ghost" icon={<Copy size={13} />} onClick={() => result && copyToClipboard(result.report)}>Copy Markdown</Button>
            <Button variant="primary" icon={<Download size={13} />} onClick={() => pdf?.save()}>Download PDF</Button>
          </>
        }
      >
        {pdf && (
          <div style={{ borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--border)', background: '#fff' }}>
            <iframe title="Incident report PDF preview" src={pdf.url} style={{ width: '100%', height: '70vh', border: 'none', display: 'block' }} />
          </div>
        )}
      </Modal>
    </ToolPanel>
  );
}

// ── Reports history ─────────────────────────────────────────────────────────
// Root-cause and incident reports are persisted server-side (ai_reports
// table) so they survive a refresh — this panel is just a reader over them.

function ReportsHistory({ refreshKey }: { refreshKey: number }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any>(null);
  const [pdf, setPdf] = useState<{ url: string; save: () => void; revoke: () => void } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/ai/reports'); setReports(data); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => () => pdf?.revoke(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (r: any) => {
    pdf?.revoke();
    const built = buildIncidentReportPdfPreview({ deploymentName: r.deployment_name, generatedAt: r.created_at, reportText: r.content });
    setPdf(built);
    setActive(r);
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await api.delete(`/api/ai/reports/${id}`); setReports(rs => rs.filter(r => r.id !== id)); } catch {}
  };

  if (loading && reports.length === 0) return null;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden', marginBottom: 28 }}>
      <div style={{ height: 2, background: 'linear-gradient(90deg,#f59e0b,#a855f7)' }} />
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={15} color="var(--accent-blue)" />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Saved Reports</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{reports.length} saved</span>
        </div>
        <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', borderRadius: 'var(--r-sm)', fontFamily: 'var(--font-sans)' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      <div style={{ padding: reports.length ? '10px 14px' : '20px' }}>
        {reports.length === 0 ? (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>
            Root cause and incident reports you generate are saved here automatically.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reports.map(r => {
              const isIncident = r.type === 'incident';
              const accent = isIncident ? '#a855f7' : '#f59e0b';
              return (
                <div key={r.id} onClick={() => open(r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', cursor: 'pointer', borderLeft: `3px solid ${accent}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0, width: 78 }}>
                    {isIncident ? 'Incident' : 'Root Cause'}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.deployment_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(r.created_at)}</div>
                  <button onClick={e => remove(r.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0, padding: 2 }}>
                    <XCircle size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={!!active && !!pdf}
        onClose={() => setActive(null)}
        title={active ? `${active.type === 'incident' ? 'Incident Report' : 'Root Cause'} — ${active.deployment_name}` : 'Report'}
        width={760}
        footer={
          <>
            <Button variant="ghost" icon={<Copy size={13} />} onClick={() => active && copyToClipboard(active.content)}>Copy Markdown</Button>
            <Button variant="primary" icon={<Download size={13} />} onClick={() => pdf?.save()}>Download PDF</Button>
          </>
        }
      >
        {pdf && (
          <div style={{ borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--border)', background: '#fff' }}>
            <iframe title="Report PDF preview" src={pdf.url} style={{ width: '100%', height: '70vh', border: 'none', display: 'block' }} />
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function AIHub() {
  const navigate = useNavigate();
  const [deps, setDeps] = useState<Deployment[]>([]);
  const [cloudDeps, setCloudDeps] = useState<CloudDep[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [reportsRefreshKey, setReportsRefreshKey] = useState(0);
  const bumpReports = () => setReportsRefreshKey(k => k + 1);

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

  const allDeps: Deployment[] = [
    ...deps,
    ...cloudDeps.map(d => ({ id: d.id, name: `${d.name} (${d.provider})`, status: d.status })),
  ];

  const renderActiveTool = () => {
    switch (activeTool) {
      case 'rootcause': return <RootCauseTool deployments={allDeps} onSaved={bumpReports} />;
      case 'incident':  return <IncidentTool deployments={allDeps} onSaved={bumpReports} />;
      default:          return null;
    }
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 44, height: 44, borderRadius: 'var(--r-xl)', background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(99,102,241,0.35)', flexShrink: 0 }}>
          <Bot size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-.01em' }}>AI Intelligence Hub</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
            AI-powered root cause analysis & incident reporting
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={load}>Refresh</Button>
          <button onClick={() => navigate('/ai/deploy')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'linear-gradient(135deg,#6366f1,#a855f7)', borderRadius: 'var(--r-md)', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 0 14px rgba(99,102,241,0.3)', fontFamily: 'var(--font-sans)' }}>
            <Sparkles size={12} /> AI Deploy
          </button>
        </div>
      </div>

      {/* Tool navigation cards */}
      <ToolNavCards activeToolId={activeTool} onSelect={id => setActiveTool(prev => prev === id ? null : id)} />

      {/* Active tool panel */}
      {activeTool && (
        <div style={{ marginBottom: 28, animation: 'float-up 200ms ease-out' }}>
          {renderActiveTool()}
        </div>
      )}

      {/* Saved reports (root cause + incident) */}
      <ReportsHistory refreshKey={reportsRefreshKey} />

      {/* Overview + Health */}
      <OverviewPanel providers={providers} cloudDeps={cloudDeps} />
      <PlatformHealth cloudDeps={cloudDeps} />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
