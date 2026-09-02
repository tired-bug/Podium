import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingDown, AlertCircle, CheckCircle,
  RefreshCw, ChevronDown, ChevronUp, Zap, Activity,
  Server, PieChart, Cloud,
} from 'lucide-react';
import { Card, Badge, EmptyState, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import api from '../lib/api';
import { parseApiError } from '../lib/utils';
import { useToast } from '../contexts/ToastContext';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProviderSummary {
  provider: string;
  deploymentCount: number;
  activeServices: number;
  failedServices: number;
  idleServices: number;
  recentBuilds: number;
  weekBuilds: number;
  estimatedMonthlyCost: number;
  freeTierServices: number;
  billableServices: number;
}

interface Recommendation {
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  deploymentId?: string;
  deploymentName?: string;
  provider?: string;
  estimatedSaving?: number;
}

interface BuildPoint { date: string; count: number; }

interface FinOpsData {
  summary: {
    totalDeployments: number;
    totalActiveServices: number;
    totalEstimatedMonthlyCost: number;
    totalSavingsOpportunity: number;
    providerCount: number;
  };
  providerSummaries: ProviderSummary[];
  recommendations: Recommendation[];
  buildTimeline: BuildPoint[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PROVIDER_COLOR: Record<string, string> = {
  render:  'var(--accent-green)',
  railway: 'var(--accent-purple)',
  vercel:  '#fff',
  azure:   'var(--accent-blue)',
  aws:     'var(--accent-orange)',
};

const SEVERITY_COLOR: Record<string, string> = {
  high:   'var(--accent-red)',
  medium: 'var(--accent-orange)',
  low:    'var(--accent-blue)',
};

const SEVERITY_BG: Record<string, string> = {
  high:   'var(--accent-red-dim)',
  medium: 'var(--accent-orange-dim)',
  low:    'var(--accent-blue-dim)',
};

const SEVERITY_LABEL: Record<string, string> = {
  high:   'High impact — likely costing you money right now; act on this first.',
  medium: 'Medium impact — worth fixing soon, but not urgent.',
  low:    'Low impact — a suggestion or best practice, no immediate cost risk.',
};

function fmt(n: number) { return n === 0 ? 'Free' : `$${n.toFixed(2)}`; }

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, accent, delay = 0 }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; accent: string; delay?: number;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '20px', borderRadius: 'var(--r-lg)',
        background: hov ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        border: `1px solid ${hov ? 'var(--border-glow)' : 'var(--border)'}`,
        transition: 'all 200ms ease',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? 'var(--shadow-lg)' : 'var(--shadow-card)',
        animation: `float-up 350ms ease-out ${delay}ms both`,
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0, opacity: hov ? 0.06 : 0,
        background: accent, transition: 'opacity 200ms',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            {label}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-.02em' }}>
            {value}
          </div>
          {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 6 }}>{sub}</div>}
        </div>
        <div style={{
          width: 42, height: 42, borderRadius: 'var(--r-lg)', flexShrink: 0,
          background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
      </div>
    </div>
  );
}

function ProviderCard({ p }: { p: ProviderSummary }) {
  const [expanded, setExpanded] = useState(false);
  const color = PROVIDER_COLOR[p.provider] ?? 'var(--accent)';
  const pct = p.billableServices > 0 ? Math.min(100, (p.billableServices / Math.max(p.deploymentCount, 1)) * 100) : 0;

  return (
    <div style={{
      borderRadius: 'var(--r-lg)', border: '1px solid var(--border)',
      background: 'var(--bg-card)', overflow: 'hidden',
      animation: 'float-up 300ms ease-out both',
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', cursor: 'pointer',
          borderBottom: expanded ? '1px solid var(--border-muted)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color, flexShrink: 0,
            boxShadow: `0 0 8px ${color}`,
          }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
              {p.provider}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
              {p.deploymentCount} deployments · {p.activeServices} active
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: p.estimatedMonthlyCost === 0 ? 'var(--accent-green)' : 'var(--text-primary)', letterSpacing: '-.01em' }}>
              {fmt(p.estimatedMonthlyCost)}<span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>/mo</span>
            </div>
          </div>
          {expanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '16px 20px' }}>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Active', value: p.activeServices, color: 'var(--accent-green)' },
              { label: 'Failed', value: p.failedServices, color: 'var(--accent-red)' },
              { label: 'Idle',   value: p.idleServices,   color: 'var(--accent-orange)' },
              { label: 'Builds (7d)', value: p.weekBuilds, color: 'var(--accent)' },
            ].map(({ label, value, color: c }) => (
              <div key={label} style={{ textAlign: 'center', padding: '10px', borderRadius: 'var(--r-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border-muted)' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: c }}>{value}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2, fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Billable vs free */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: 6 }}>
              <span>Billable services</span>
              <span>{p.billableServices} / {p.deploymentCount}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 600ms ease' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--accent-green-dim)', border: '1px solid rgba(48,209,88,.15)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>FREE TIER</div>
              <div style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 700 }}>{p.freeTierServices} services</div>
            </div>
            <div style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border-muted)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>30-DAY BUILDS</div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 700 }}>{p.recentBuilds}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendationCard({ r, index }: { r: Recommendation; index: number }) {
  const color = SEVERITY_COLOR[r.severity];
  const bg    = SEVERITY_BG[r.severity];
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 'var(--r-lg)',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${color}`,
      animation: `float-up 250ms ease-out ${index * 40}ms both`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '10px', fontWeight: 700,
              padding: '2px 7px', borderRadius: 'var(--r-pill)',
              background: bg, color,
              textTransform: 'uppercase', letterSpacing: '.05em',
              cursor: 'help',
            }} title={SEVERITY_LABEL[r.severity]}>{r.severity}</span>
            {r.provider && (
              <span style={{
                fontSize: '10px', padding: '2px 7px', borderRadius: 'var(--r-pill)',
                background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                border: '1px solid var(--border)', textTransform: 'capitalize',
              }}>{r.provider}</span>
            )}
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {r.type.replace(/_/g, ' ')}
            </span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            {r.title}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {r.description}
          </div>
        </div>
        {r.estimatedSaving !== undefined && r.estimatedSaving > 0 && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: 2 }}>POTENTIAL SAVING</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent-green)' }}>
              ${r.estimatedSaving.toFixed(2)}/mo
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FinOps() {
  const [data, setData]       = useState<FinOpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [tab, setTab]         = useState<'overview' | 'recommendations' | 'providers'>('overview');
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/api/finops');
      setData(res.data);
    } catch (e) {
      const msg = parseApiError(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'overview',        label: 'Overview'         },
    { id: 'providers',       label: 'Providers'        },
    { id: 'recommendations', label: `Recommendations${data ? ` (${data.recommendations.length})` : ''}` },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-.02em', margin: 0 }}>
            FinOps
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 4 }}>
            Cloud cost visibility and optimization · estimated usage
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}
          icon={<RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />}>
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border-muted)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 14px', background: 'none', border: 'none',
            fontSize: '13px', fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
            borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
            marginBottom: -1, transition: 'color 120ms, border-color 120ms',
          }}>{t.label}</button>
        ))}
      </div>

      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} height={100} />)}
        </div>
      )}

      {error && !loading && (
        <EmptyState icon={<AlertCircle size={28} color="var(--accent-red)" />}
          title="Failed to load FinOps data" description={error} />
      )}

      {data && !loading && (
        <>
          {/* Overview tab */}
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                <KpiCard
                  label="Est. Monthly Cost"
                  value={fmt(data.summary.totalEstimatedMonthlyCost)}
                  sub="across all providers"
                  icon={<DollarSign size={18} color="#fff" />}
                  accent="linear-gradient(135deg, var(--accent), var(--accent-2))"
                  delay={0}
                />
                <KpiCard
                  label="Savings Opportunity"
                  value={fmt(data.summary.totalSavingsOpportunity)}
                  sub={`${data.recommendations.length} recommendations`}
                  icon={<TrendingDown size={18} color="#fff" />}
                  accent="linear-gradient(135deg, var(--accent-green), #22c55e)"
                  delay={60}
                />
                <KpiCard
                  label="Active Services"
                  value={String(data.summary.totalActiveServices)}
                  sub={`across ${data.summary.providerCount} providers`}
                  icon={<Activity size={18} color="#fff" />}
                  accent="linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))"
                  delay={120}
                />
                <KpiCard
                  label="Total Deployments"
                  value={String(data.summary.totalDeployments)}
                  sub="all time"
                  icon={<Server size={18} color="#fff" />}
                  accent="linear-gradient(135deg, var(--accent-purple), var(--accent-pink))"
                  delay={180}
                />
              </div>

              {/* Cost breakdown by provider */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <PieChart size={14} color="var(--accent)" />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Cost Breakdown by Provider
                  </span>
                </div>
                {data.providerSummaries.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {data.providerSummaries
                      .slice()
                      .sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost)
                      .map(p => {
                        const max = Math.max(...data.providerSummaries.map(x => x.estimatedMonthlyCost), 1);
                        const pct = Math.max(3, (p.estimatedMonthlyCost / max) * 100);
                        const color = PROVIDER_COLOR[p.provider] ?? 'var(--accent)';
                        return (
                          <div key={p.provider}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                                  {p.provider}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  · {p.activeServices} active
                                </span>
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: p.estimatedMonthlyCost === 0 ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                                {fmt(p.estimatedMonthlyCost)}<span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--text-muted)' }}>/mo</span>
                              </span>
                            </div>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 500ms ease' }} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <EmptyState icon={<PieChart size={22} />} title="No cost data yet" />
                )}
              </Card>

              {/* Top recommendations preview */}
              {data.recommendations.length > 0 && (
                <Card>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Zap size={14} color="var(--accent-orange)" />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Top Recommendations</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.recommendations.slice(0, 3).map((r, i) => (
                      <RecommendationCard key={i} r={r} index={i} />
                    ))}
                    {data.recommendations.length > 3 && (
                      <button
                        onClick={() => setTab('recommendations')}
                        style={{
                          background: 'none', border: 'none', color: 'var(--accent)',
                          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                          textAlign: 'left', padding: '4px 0', fontFamily: 'var(--font-sans)',
                        }}
                      >
                        View all {data.recommendations.length} recommendations
                      </button>
                    )}
                  </div>
                </Card>
              )}

              {data.recommendations.length === 0 && (
                <Card>
                  <EmptyState
                    icon={<CheckCircle size={28} color="var(--accent-green)" />}
                    title="All clear"
                    description="No cost optimization recommendations at this time."
                  />
                </Card>
              )}
            </div>
          )}

          {/* Providers tab */}
          {tab === 'providers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.providerSummaries.length === 0 ? (
                <EmptyState
                  icon={<Cloud size={28} />}
                  title="No providers"
                  description="Add cloud providers and create deployments to see cost breakdowns."
                />
              ) : (
                data.providerSummaries
                  .sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost)
                  .map(p => <ProviderCard key={p.provider} p={p} />)
              )}
            </div>
          )}

          {/* Recommendations tab */}
          {tab === 'recommendations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.recommendations.length > 0 && (
                <div style={{
                  display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center',
                  padding: '8px 12px', borderRadius: 'var(--r-md)',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-muted)',
                  fontSize: '11px', color: 'var(--text-muted)',
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Severity:</span>
                  {(['high', 'medium', 'low'] as const).map(s => (
                    <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEVERITY_COLOR[s], flexShrink: 0 }} />
                      <strong style={{ color: SEVERITY_COLOR[s], textTransform: 'uppercase' }}>{s}</strong>
                      <span>{SEVERITY_LABEL[s].split('—')[1]?.trim()}</span>
                    </span>
                  ))}
                </div>
              )}
              {data.recommendations.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle size={28} color="var(--accent-green)" />}
                  title="No recommendations"
                  description="Your infrastructure looks optimized. Check back after more deployments."
                />
              ) : (
                data.recommendations.map((r, i) => (
                  <RecommendationCard key={i} r={r} index={i} />
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
