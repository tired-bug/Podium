import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot, Zap, Shield, FileText, DollarSign, GitCompare,
  AlertTriangle, Cpu, Send, RefreshCw, CheckCircle, XCircle,
  ChevronDown, Copy, BarChart2, Globe, Loader,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useDeployments } from '../hooks/useDeployments';
import { useToast } from '../contexts/ToastContext';
import api from '../lib/api';
import { copyToClipboard } from '../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Deployment { id: string; name: string; status: string; }

// ─── Shared: Result Card ──────────────────────────────────────────────────────
function ResultCard({ title, onCopy, children }: { title: string; onCopy?: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 16, background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--border-muted)',
        background: 'var(--bg-tertiary)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
        {onCopy && (
          <button onClick={onCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <Copy size={11} /> Copy
          </button>
        )}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

// ─── Shared: FeatureCard wrapper ──────────────────────────────────────────────
function FeatureCard({ icon, title, subtitle, accent, children }: {
  icon: React.ReactNode; title: string; subtitle: string; accent: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: `${accent}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, flexShrink: 0,
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: 20, flex: 1 }}>{children}</div>
    </div>
  );
}

// ─── Shared: Select ───────────────────────────────────────────────────────────
function Select({ value, onChange, options, placeholder = 'Select...' }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
      color: 'var(--text-primary)', fontSize: 13,
    }}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
const SEVERITY_COLOR: Record<string, string> = { low: '#3FB950', medium: '#DB6D28', high: '#F85149', critical: '#FF0000' };
const RISK_COLOR: Record<string, string> = { low: '#3FB950', medium: '#DB6D28', high: '#F85149', critical: '#FF0000' };

function SeverityBadge({ level }: { level: string }) {
  const color = SEVERITY_COLOR[level?.toLowerCase()] || 'var(--text-muted)';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}18`, borderRadius: 9999, padding: '2px 8px', textTransform: 'uppercase' }}>
      {level}
    </span>
  );
}

function ScoreRing({ score, max = 100, color }: { score: number; max?: number; color: string }) {
  const pct = Math.min(100, (score / max) * 100);
  const r = 28, circ = 2 * Math.PI * r;
  return (
    <svg width={70} height={70} style={{ flexShrink: 0 }}>
      <circle cx={35} cy={35} r={r} fill="none" stroke="var(--bg-tertiary)" strokeWidth={5} />
      <circle cx={35} cy={35} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
        strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={35} y={40} textAnchor="middle" fontSize={14} fontWeight="bold" fill={color}>{score}</text>
    </svg>
  );
}

// ─── 1. Platform Summary ──────────────────────────────────────────────────────
function PlatformSummaryCard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data: d } = await api.get('/api/ai/platform-summary'); setData(d); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = data?.stats;
  const healthScore = s ? Math.max(0, 100 - (s.failedDeps * 15) - (s.criticalAnomalies * 20) - (s.openAnomalies * 5) - Math.min(s.recentErrors * 2, 20)) : null;

  return (
    <FeatureCard icon={<BarChart2 size={16} />} title="Platform Health Summary" subtitle="AI-generated executive overview" accent="var(--accent-blue)">
      {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}><Loader size={14} className="spin" /> Analyzing platform...</div>}
      {data && (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              { label: 'Running', value: s.runningDeps, color: 'var(--accent-green)' },
              { label: 'Failed', value: s.failedDeps, color: 'var(--accent-red)' },
              { label: 'Anomalies', value: s.openAnomalies, color: s.openAnomalies > 0 ? 'var(--accent-orange)' : 'var(--accent-green)' },
              { label: 'Cloud Live', value: s.cloudRunning, color: 'var(--accent-blue)' },
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center', minWidth: 50 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
            {healthScore !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                <ScoreRing score={healthScore} color={healthScore > 70 ? 'var(--accent-green)' : healthScore > 40 ? 'var(--accent-orange)' : 'var(--accent-red)'} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Health<br/>Score</div>
              </div>
            )}
          </div>
          {data.summary && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-blue)' }}>
              {data.summary}
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        </>
      )}
    </FeatureCard>
  );
}

// ─── 2. Risk Score ────────────────────────────────────────────────────────────
function RiskScoreCard({ deployments }: { deployments: Deployment[] }) {
  const [depId, setDepId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const run = async () => {
    const dep = deployments.find(d => d.id === depId);
    if (!dep) return;
    setLoading(true);
    try {
      const { data } = await api.post('/api/ai/risk-score', { name: dep.name });
      setResult(data);
    } catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <FeatureCard icon={<Shield size={16} />} title="Deployment Risk Score" subtitle="Pre-deploy risk assessment" accent="var(--accent-purple)">
      <Select value={depId} onChange={setDepId} options={deployments.map(d => ({ value: d.id, label: `${d.name} (${d.status})` }))} placeholder="Select deployment..." />
      <Button variant="primary" style={{ width: '100%', marginTop: 10 }} onClick={run} disabled={!depId || loading}>
        {loading ? <><Loader size={13} className="spin" /> Analyzing...</> : <><Shield size={13} /> Score Risk</>}
      </Button>
      {result && (
        <ResultCard title="Risk Assessment" onCopy={() => copyToClipboard(JSON.stringify(result, null, 2))}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <ScoreRing score={result.score} color={RISK_COLOR[result.level] || 'var(--accent-orange)'} />
            <div>
              <SeverityBadge level={result.level} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Risk Level</div>
            </div>
          </div>
          {result.blockers?.length > 0 && (
            <div style={{ marginBottom: 10, padding: '8px 12px', background: '#F8514918', border: '1px solid #F85149', borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-red)', marginBottom: 4 }}>🚫 Blockers</div>
              {result.blockers.map((b: string, i: number) => <div key={i} style={{ fontSize: 12, color: '#F85149' }}>• {b}</div>)}
            </div>
          )}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Risks</div>
            {result.risks?.map((r: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>• {r}</div>)}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Recommendations</div>
            {result.recommendations?.map((r: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--accent-green)', padding: '2px 0' }}>✓ {r}</div>)}
          </div>
        </ResultCard>
      )}
    </FeatureCard>
  );
}

// ─── 3. Root Cause Analysis ───────────────────────────────────────────────────
function RootCauseCard({ deployments }: { deployments: Deployment[] }) {
  const [depId, setDepId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/ai/root-cause', { deploymentId: depId });
      setResult(data);
    } catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <FeatureCard icon={<AlertTriangle size={16} />} title="Root Cause Analysis" subtitle="AI explains why things failed" accent="var(--accent-orange)">
      <Select value={depId} onChange={setDepId} options={deployments.filter(d => d.status === 'failed' || d.status === 'stopped' || d.status === 'running').map(d => ({ value: d.id, label: `${d.name} (${d.status})` }))} placeholder="Select deployment..." />
      <Button variant="primary" style={{ width: '100%', marginTop: 10 }} onClick={run} disabled={!depId || loading}>
        {loading ? <><Loader size={13} className="spin" /> Diagnosing...</> : <><AlertTriangle size={13} /> Diagnose</>}
      </Button>
      {result && (
        <ResultCard title="Root Cause" onCopy={() => copyToClipboard(result.rootCause)}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{result.rootCause}</div>
        </ResultCard>
      )}
    </FeatureCard>
  );
}

// ─── 4. Optimize Config ───────────────────────────────────────────────────────
function OptimizeCard({ deployments }: { deployments: Deployment[] }) {
  const [depId, setDepId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/ai/optimize-config', { deploymentId: depId });
      setResult(data);
    } catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <FeatureCard icon={<Cpu size={16} />} title="Resource Optimizer" subtitle="Right-size CPU, memory & replicas" accent="var(--accent-teal)">
      <Select value={depId} onChange={setDepId} options={deployments.map(d => ({ value: d.id, label: `${d.name} (${d.status})` }))} placeholder="Select deployment..." />
      <Button variant="primary" style={{ width: '100%', marginTop: 10 }} onClick={run} disabled={!depId || loading}>
        {loading ? <><Loader size={13} className="spin" /> Analyzing...</> : <><Cpu size={13} /> Optimize</>}
      </Button>
      {result && (
        <ResultCard title="Optimization Recommendations" onCopy={() => copyToClipboard(JSON.stringify(result, null, 2))}>
          {result.recommendations?.map((rec: any, i: number) => (
            <div key={i} style={{ marginBottom: 10, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, borderLeft: '3px solid var(--accent-teal)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase' }}>{rec.field?.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rec.current} → <strong style={{ color: 'var(--accent-teal)' }}>{rec.suggested}</strong></span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{rec.reason}</div>
            </div>
          ))}
          {result.estimatedSavings && (
            <div style={{ fontSize: 12, color: 'var(--accent-green)', marginTop: 8 }}>💰 {result.estimatedSavings}</div>
          )}
        </ResultCard>
      )}
    </FeatureCard>
  );
}

// ─── 5. Security Scan ─────────────────────────────────────────────────────────
function SecurityScanCard({ deployments }: { deployments: Deployment[] }) {
  const [depId, setDepId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/ai/security-scan', { deploymentId: depId });
      setResult(data);
    } catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <FeatureCard icon={<Shield size={16} />} title="Security Scanner" subtitle="GDPR, SOC2 & hardening review" accent="var(--accent-red)">
      <Select value={depId} onChange={setDepId} options={deployments.map(d => ({ value: d.id, label: `${d.name} (${d.status})` }))} placeholder="Select deployment..." />
      <Button variant="primary" style={{ width: '100%', marginTop: 10 }} onClick={run} disabled={!depId || loading}>
        {loading ? <><Loader size={13} className="spin" /> Scanning...</> : <><Shield size={13} /> Security Scan</>}
      </Button>
      {result && (
        <ResultCard title="Security Report" onCopy={() => copyToClipboard(JSON.stringify(result, null, 2))}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <ScoreRing score={result.score} color={result.score > 70 ? 'var(--accent-green)' : result.score > 40 ? 'var(--accent-orange)' : 'var(--accent-red)'} />
            <div>
              <SeverityBadge level={result.overallRisk} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Overall Risk</div>
            </div>
          </div>
          {result.findings?.map((f: any, i: number) => (
            <div key={i} style={{ marginBottom: 8, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, borderLeft: `3px solid ${SEVERITY_COLOR[f.severity] || 'var(--border)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <SeverityBadge level={f.severity} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.category}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>{f.issue}</div>
              <div style={{ fontSize: 11, color: 'var(--accent-green)' }}>Fix: {f.fix}</div>
            </div>
          ))}
          {result.passed?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {result.passed.map((p: string, i: number) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--accent-green)', padding: '2px 0' }}><CheckCircle size={10} style={{ marginRight: 4 }} />{p}</div>
              ))}
            </div>
          )}
        </ResultCard>
      )}
    </FeatureCard>
  );
}

// ─── 6. Natural Language Deploy ───────────────────────────────────────────────
function NaturalDeployCard() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const EXAMPLES = [
    'Deploy nginx to Render with 512MB RAM on port 80',
    'Run a Redis cache locally with restart always',
    'Deploy my GitHub repo tired-bug/Butterfly to Vercel on the main branch',
  ];

  const run = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post('/api/ai/natural-deploy', { prompt });
      setResult(data);
    } catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <FeatureCard icon={<Send size={16} />} title="Natural Language Deploy" subtitle="Describe in plain English, get a config" accent="var(--accent-blue)">
      <div style={{ marginBottom: 8 }}>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="e.g. Deploy nginx to Render with 512MB RAM on port 80"
          rows={3}
          style={{
            width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => setPrompt(ex)} style={{
              fontSize: 11, padding: '3px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: 9999, cursor: 'pointer', color: 'var(--text-secondary)',
            }}>{ex.slice(0, 36)}…</button>
          ))}
        </div>
      </div>
      <Button variant="primary" style={{ width: '100%' }} onClick={run} disabled={!prompt.trim() || loading}>
        {loading ? <><Loader size={13} className="spin" /> Generating config...</> : <><Zap size={13} /> Generate Config</>}
      </Button>
      {result && (
        <ResultCard title="Generated Deploy Config" onCopy={() => copyToClipboard(JSON.stringify(result, null, 2))}>
          <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Confidence:</span>
            <div style={{ flex: 1, height: 4, background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${result.confidence}%`, background: result.confidence > 70 ? 'var(--accent-green)' : 'var(--accent-orange)', transition: 'width 0.4s' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{result.confidence}%</span>
          </div>
          <pre style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 200 }}>
            {JSON.stringify({ name: result.name, image: result.image, repoUrl: result.repoUrl, ports: result.ports, memoryLimit: result.memoryLimit, cpuLimit: result.cpuLimit, provider: result.provider, restartPolicy: result.restartPolicy }, null, 2)}
          </pre>
          {result.clarifications?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-orange)', marginBottom: 4 }}>⚠️ Needs clarification:</div>
              {result.clarifications.map((c: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)' }}>• {c}</div>)}
            </div>
          )}
        </ResultCard>
      )}
    </FeatureCard>
  );
}

// ─── 7. Incident Report ───────────────────────────────────────────────────────
function IncidentReportCard({ deployments }: { deployments: Deployment[] }) {
  const [depId, setDepId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/ai/incident-report', { deploymentId: depId });
      setResult(data);
    } catch (e: any) { showError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <FeatureCard icon={<FileText size={16} />} title="Incident Report" subtitle="Auto-generate professional incident docs" accent="var(--accent-purple)">
      <Select value={depId} onChange={setDepId} options={deployments.map(d => ({ value: d.id, label: `${d.name} (${d.status})` }))} placeholder="Select deployment..." />
      <Button variant="primary" style={{ width: '100%', marginTop: 10 }} onClick={run} disabled={!depId || loading}>
        {loading ? <><Loader size={13} className="spin" /> Generating report...</> : <><FileText size={13} /> Generate Report</>}
      </Button>
      {result && (
        <ResultCard title={`Incident Report — ${result.deployment}`} onCopy={() => copyToClipboard(result.report)}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Generated at {new Date(result.generatedAt).toLocaleString()}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto' }}>
            {result.report}
          </div>
        </ResultCard>
      )}
    </FeatureCard>
  );
}

// ─── 8. Cost Analysis ─────────────────────────────────────────────────────────
function CostAnalysisCard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const { data: d } = await api.get('/api/ai/cost-analysis'); setData(d); } catch {}
    setLoading(false);
  };

  return (
    <FeatureCard icon={<DollarSign size={16} />} title="Cost Analysis" subtitle="Estimated cloud spend by provider" accent="var(--accent-green)">
      <Button variant="primary" style={{ width: '100%' }} onClick={load} disabled={loading}>
        {loading ? <><Loader size={13} className="spin" /> Loading...</> : <><DollarSign size={13} /> Analyze Costs</>}
      </Button>
      {data && (
        <ResultCard title="Monthly Cost Estimate">
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-green)', marginBottom: 12 }}>${data.totalMonthlyEstimate}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>/mo</span></div>
          {data.breakdown?.length > 0 ? (
            <div>
              {data.breakdown.map((d: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-muted)', fontSize: 13 }}>
                  <div><span style={{ fontWeight: 600 }}>{d.name}</span> <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({d.provider})</span></div>
                  <div style={{ color: 'var(--accent-green)', fontWeight: 700 }}>${d.estimatedMonthlyCost.toFixed(2)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No running cloud deployments</div>
          )}
          {data.localDeployments > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>+ {data.localDeployments} local deployments (infra cost only)</div>}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{data.note}</div>
        </ResultCard>
      )}
    </FeatureCard>
  );
}

// ─── 9. Compare Deployments ───────────────────────────────────────────────────
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
    <FeatureCard icon={<GitCompare size={16} />} title="Compare Deployments" subtitle="A/B performance & config comparison" accent="var(--accent-blue)">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Select value={depA} onChange={setDepA} options={opts} placeholder="Deployment A" />
        <Select value={depB} onChange={setDepB} options={opts} placeholder="Deployment B" />
      </div>
      <Button variant="primary" style={{ width: '100%', marginTop: 10 }} onClick={run} disabled={!depA || !depB || depA === depB || loading}>
        {loading ? <><Loader size={13} className="spin" /> Comparing...</> : <><GitCompare size={13} /> Compare</>}
      </Button>
      {result && (
        <ResultCard title={`${result.deploymentA} vs ${result.deploymentB}`} onCopy={() => copyToClipboard(result.comparison)}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{result.comparison}</div>
        </ResultCard>
      )}
    </FeatureCard>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AIHub() {
  const { deployments } = useDeployments();
  const deps = (deployments || []) as Deployment[];

  return (
    <div style={{ padding: '0 24px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, paddingTop: 4 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>AI Intelligence Hub</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>9 AI-powered tools for DevOps teams — risk scoring, root cause analysis, security scans & more</p>
        </div>
      </div>

      {/* Platform Summary — full width */}
      <div style={{ marginBottom: 20 }}>
        <PlatformSummaryCard />
      </div>

      {/* Grid of feature cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
        <RiskScoreCard deployments={deps} />
        <RootCauseCard deployments={deps} />
        <OptimizeCard deployments={deps} />
        <SecurityScanCard deployments={deps} />
        <NaturalDeployCard />
        <IncidentReportCard deployments={deps} />
        <CostAnalysisCard />
        <CompareCard deployments={deps} />
      </div>
    </div>
  );
}
