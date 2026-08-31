import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Cloud, CheckCircle, XCircle, Clock, TrendingUp, Activity, Zap } from 'lucide-react';
import { Card, SectionHeader, Skeleton, Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { MetricChart, MiniSparkline } from '../components/charts/MetricChart';
import api from '../lib/api';

const PROVIDER_COLORS: Record<string, string> = {
  railway:  'var(--accent-purple)',
  render:   'var(--accent-green)',
  vercel:   'var(--accent-blue)',
};

const PROVIDER_LABELS: Record<string, string> = {
  railway: 'Railway',
  render:  'Render',
  vercel:  'Vercel',
};

interface TrendPoint {
  date: string;
  deployments: number;
  successful: number;
}

interface DeploymentMetrics {
  id: string;
  name: string;
  status: string;
  url: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  buildDuration: number | null;
  region: string | null;
}

interface ProviderMetrics {
  provider: string;
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  avgBuildDuration: number | null;
  deployFrequency: number;
  uptime: number;
  trend: TrendPoint[];
  deployments: DeploymentMetrics[];
}

type Granularity = 'week' | 'month';

function isoWeekKey(d: Date) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { key: `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`, ts: dt.getTime() };
}

// Aggregates the daily trend into weekly or monthly buckets, keeping
// successful/failed/total sums per bucket for the stacked chart.
function aggregateTrend(trend: TrendPoint[], granularity: Granularity) {
  const buckets: Record<string, { ts: number; total: number; successful: number; failed: number }> = {};
  for (const t of trend) {
    const date = new Date(t.date);
    let key: string, ts: number;
    if (granularity === 'week') {
      const w = isoWeekKey(date);
      key = w.key; ts = w.ts;
    } else {
      key = date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      ts = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    }
    if (!buckets[key]) buckets[key] = { ts, total: 0, successful: 0, failed: 0 };
    buckets[key].total += t.deployments;
    buckets[key].successful += t.successful;
    buckets[key].failed += (t.deployments - t.successful);
  }
  return Object.values(buckets).sort((a, b) => a.ts - b.ts);
}

function GranularityToggle({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  const opts: { id: Granularity; label: string }[] = [
    { id: 'week', label: 'Weekly' },
    { id: 'month', label: 'Monthly' },
  ];
  return (
    <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-muted)' }}>
      {opts.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          style={{
            padding: '3px 10px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
            fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-sans)',
            background: value === o.id ? 'var(--accent-blue)' : 'transparent',
            color: value === o.id ? '#fff' : 'var(--text-muted)',
            transition: 'all 150ms',
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function StatCard({
  label, value, icon, color, sub,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  sub?: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span style={{ color: color || 'var(--text-muted)' }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

function ProviderSection({ metrics, expanded, onToggle }: {
  metrics: ProviderMetrics;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = PROVIDER_COLORS[metrics.provider] || 'var(--accent-blue)';
  const label = PROVIDER_LABELS[metrics.provider] || metrics.provider;
  const [granularity, setGranularity] = useState<Granularity>('week');

  // Build chart data from trend, aggregated by the selected granularity
  const aggregated = aggregateTrend(metrics.trend, granularity);
  const trendData = aggregated.map(b => ({
    timestamp: b.ts,
    total: b.total,
    successful: b.successful,
    failed: b.failed,
  }));

  const sparkData = metrics.trend.map(t => t.deployments);

  return (
    <Card style={{ overflow: 'hidden', padding: 0 }}>
      {/* Provider header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px',
          background: 'var(--bg-secondary)',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}88`,
          flexShrink: 0,
        }} />
        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', flex: 1 }}>
          {label}
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {metrics.total} deployment{metrics.total !== 1 ? 's' : ''}
          </div>
          <Badge variant="status" value={metrics.successRate >= 80 ? 'live' : metrics.successRate >= 50 ? 'building' : 'failed'}>
            {metrics.successRate}% success
          </Badge>
          <div style={{ width: 80, height: 28 }}>
            <MiniSparkline data={sparkData} color={color} height={28} />
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatCard
              label="Uptime"
              value={`${metrics.uptime}%`}
              icon={<Activity size={12} />}
              color={metrics.uptime >= 90 ? 'var(--accent-green)' : metrics.uptime >= 70 ? 'var(--accent-orange)' : 'var(--accent-red)'}
              sub="Live / total"
            />
            <StatCard
              label="Avg Build"
              value={formatDuration(metrics.avgBuildDuration)}
              icon={<Clock size={12} />}
              color="var(--accent-blue)"
              sub="Successful deploys"
            />
            <StatCard
              label="Frequency"
              value={metrics.deployFrequency === 0 ? '—' : `${metrics.deployFrequency}/day`}
              icon={<Zap size={12} />}
              color="var(--accent-purple)"
              sub="30-day average"
            />
            <StatCard
              label="Failed"
              value={metrics.failed}
              icon={<XCircle size={12} />}
              color={metrics.failed > 0 ? 'var(--accent-red)' : 'var(--text-muted)'}
              sub={`${metrics.successful} successful`}
            />
          </div>

          {/* Trend chart */}
          {trendData.length > 0 && trendData.some(d => d.total > 0) && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Deployment Trend ({granularity === 'week' ? 'by week' : 'by month'})
                </div>
                <GranularityToggle value={granularity} onChange={setGranularity} />
              </div>
              <MetricChart
                data={trendData}
                lines={[
                  { key: 'total', label: 'Total', color },
                  { key: 'successful', label: 'Successful', color: 'var(--accent-green)' },
                  { key: 'failed', label: 'Failed', color: 'var(--accent-red)' },
                ]}
                type="line"
                unit=""
                height={180}
                yDomain={[0, 'auto']}
              />
            </div>
          )}

          {/* Per-deployment table */}
          {metrics.deployments.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                Deployments
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                      {['Name', 'Status', 'Build Time', 'Region', 'Last Updated'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', fontWeight: 600 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.deployments.map((dep, i) => (
                      <tr key={dep.id} style={{ borderTop: i > 0 ? '1px solid var(--border-muted)' : 'none' }}>
                        <td style={{ padding: '9px 14px', fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', maxWidth: 200 }}>
                          {dep.url ? (
                            <a href={dep.url} target="_blank" rel="noopener noreferrer"
                              style={{ color: color, textDecoration: 'none', fontWeight: 600 }}
                              title={dep.url}
                            >
                              {dep.name}
                            </a>
                          ) : dep.name}
                        </td>
                        <td style={{ padding: '9px 14px' }}>
                          <Badge variant="status" value={dep.status}>{dep.status}</Badge>
                        </td>
                        <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {formatDuration(dep.buildDuration)}
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {dep.region || '—'}
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {dep.updatedAt ? new Date(dep.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Metrics() {
  const [data, setData] = useState<ProviderMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result } = await api.get('/api/metrics');
      setData(result);
      // Auto-expand the first provider
      if (result.length > 0) {
        setExpanded(prev => {
          const next = { ...prev };
          if (!Object.values(next).some(Boolean)) {
            next[result[0].provider] = true;
          }
          return next;
        });
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchMetrics, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchMetrics]);

  // Aggregate totals across all providers
  const totalDeps    = data.reduce((s, p) => s + p.total, 0);
  const totalSuccess = data.reduce((s, p) => s + p.successful, 0);
  const totalFailed  = data.reduce((s, p) => s + p.failed, 0);
  const avgSuccess   = totalDeps > 0 ? Math.round((totalSuccess / totalDeps) * 100) : 0;
  const avgBuild     = (() => {
    const durations = data.filter(p => p.avgBuildDuration !== null).map(p => p.avgBuildDuration as number);
    return durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Metrics"
        subtitle="Cloud deployment analytics across providers"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              Auto-refresh
            </label>
            <Button icon={<RefreshCw size={14} />} onClick={fetchMetrics} loading={loading} size="sm">Refresh</Button>
          </div>
        }
      />

      {/* Global summary row */}
      {!loading && data.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <StatCard label="Total Deployments" value={totalDeps} icon={<Cloud size={12} />} color="var(--accent-blue)" sub={`${data.length} provider${data.length !== 1 ? 's' : ''}`} />
          <StatCard label="Successful" value={totalSuccess} icon={<CheckCircle size={12} />} color="var(--accent-green)" sub="Across all providers" />
          <StatCard label="Failed" value={totalFailed} icon={<XCircle size={12} />} color={totalFailed > 0 ? 'var(--accent-red)' : 'var(--text-muted)'} sub="Across all providers" />
          <StatCard label="Success Rate" value={`${avgSuccess}%`} icon={<TrendingUp size={12} />} color={avgSuccess >= 80 ? 'var(--accent-green)' : avgSuccess >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'} sub={avgBuild !== null ? `Avg build: ${formatDuration(avgBuild)}` : 'No build data yet'} />
        </div>
      )}

      {loading && data.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => (
            <Card key={i}><Skeleton height={64} /></Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--accent-red)', fontSize: '14px' }}>
            {error}
          </div>
        </Card>
      ) : data.length === 0 ? (
        <Card>
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Cloud size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No deployment data yet</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Connect a provider and deploy something to see metrics here.
            </div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.map(metrics => (
            <ProviderSection
              key={metrics.provider}
              metrics={metrics}
              expanded={!!expanded[metrics.provider]}
              onToggle={() => setExpanded(prev => ({ ...prev, [metrics.provider]: !prev[metrics.provider] }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
