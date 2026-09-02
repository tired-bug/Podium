import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket, FileText,
  TrendingUp, TrendingDown, RefreshCw,
  Activity, Zap, Search, CheckCircle2, XCircle, Cloud,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, Badge, EmptyState } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { MetricBarChart } from '../components/charts/MetricChart';
import { timeAgo } from '../lib/utils';
import api from '../lib/api';

const PIE_COLORS = ['#6366f1', '#a855f7', '#22d3ee', '#f59e0b', '#30d158', '#ec4899', '#ff453a'];

function ProviderPieChart({ cloudDeps }: { cloudDeps: any[] }) {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const counts: Record<string, number> = {};
  for (const d of cloudDeps) counts[d.provider || 'unknown'] = (counts[d.provider || 'unknown'] || 0) + 1;
  const chartData = Object.entries(counts).map(([name, value]) => ({ name, value }));

  if (chartData.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '20px 0' }}>
        <Cloud size={28} color="var(--text-muted)" />
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No providers yet</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={44}
            outerRadius={activeIndex === null ? 70 : 74}
            paddingAngle={2}
            isAnimationActive
            onClick={(_, i) => navigate('/providers')}
            style={{ cursor: 'pointer' }}
          >
            {chartData.map((entry, i) => (
              <Cell
                key={entry.name}
                fill={PIE_COLORS[i % PIE_COLORS.length]}
                stroke="var(--bg-card)"
                strokeWidth={2}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                opacity={activeIndex === null || activeIndex === i ? 1 : 0.45}
                style={{ transition: 'opacity 150ms' }}
              />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const p = payload[0];
              return (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '6px 10px', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700, textTransform: 'capitalize' }}>{p.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}> · {p.value} deployment{p.value !== 1 ? 's' : ''}</span>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 }}>
        {chartData.map((entry, i) => (
          <div
            key={entry.name}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', color: 'var(--text-secondary)', cursor: 'default', opacity: activeIndex === null || activeIndex === i ? 1 : 0.45, transition: 'opacity 150ms' }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span style={{ textTransform: 'capitalize' }}>{entry.name}</span>
            <span style={{ color: 'var(--text-muted)' }}>({entry.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label, value, icon, gradient, trend, onClick, delay = 0,
}: {
  label: string; value: number | string; icon: React.ReactNode;
  gradient: string; trend?: number; onClick?: () => void; delay?: number;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '20px', borderRadius: 'var(--r-lg)',
        background: hovered ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--border-glow)' : 'var(--border)'}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 200ms ease',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hovered ? 'var(--shadow-lg)' : 'var(--shadow-card)',
        animation: `float-up 350ms ease-out ${delay}ms both`,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {}
      <div style={{
        position: 'absolute', inset: 0, opacity: hovered ? 0.08 : 0,
        background: gradient, transition: 'opacity 200ms',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500, letterSpacing: '.03em', textTransform: 'uppercase' }}>
            {label}
          </div>
          <div className="stat-value" style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-.02em' }}>
            {value}
          </div>
          {trend !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '11px', color: trend >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {Math.abs(trend)}% this week
            </div>
          )}
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: 'var(--r-lg)', flexShrink: 0,
          background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: hovered ? '0 4px 16px rgba(99,102,241,.4)' : 'none',
          transition: 'box-shadow 200ms',
        }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function ReportRow({ report, onOpen }: { report: any; onOpen: (r: any) => void }) {
  const isIncident = report.type === 'incident';
  const color = isIncident ? '#a855f7' : '#f59e0b';
  return (
    <div
      onClick={() => onOpen(report)}
      style={{
        padding: '10px 12px', borderRadius: 'var(--r-md)',
        background: 'var(--bg-elevated)',
        borderLeft: `3px solid ${color}`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
        animation: 'float-up 250ms ease-out both',
        cursor: 'pointer', transition: 'all 200ms',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{report.deployment_name}</span>
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--r-pill)', background: color + '20', color }}>
            {isIncident ? 'Incident' : 'Root Cause'}
          </span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {report.content.replace(/[#*_`]/g, '').slice(0, 90)}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 3 }}>{timeAgo(report.created_at)}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading,    setLoading]    = useState(true);
  const [reports,    setReports]    = useState<any[]>([]);
  const [cloudDeps,  setCloudDeps]  = useState<any[]>([]);
  const [buildTimeline, setBuildTimeline] = useState<Array<{ date: string; count: number }>>([]);

  const fetchAll = useCallback(async () => {
    const [reportsRes, cloudRes, finopsRes] = await Promise.allSettled([
      api.get('/api/ai/reports'),
      api.get('/api/cloud'),
      api.get('/api/finops'),
    ]);
    if (reportsRes.status === 'fulfilled') setReports(reportsRes.value.data);
    if (cloudRes.status === 'fulfilled') setCloudDeps(cloudRes.value.data);
    if (finopsRes.status === 'fulfilled') {
      // Last 14 days is plenty for an at-a-glance dashboard card (FinOps has the full 30-day view).
      const timeline = finopsRes.value.data?.buildTimeline || [];
      setBuildTimeline(timeline.slice(-14));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // "Total Deployments" counts every deployment on the platform. Real deploys
  // all go through the cloud provider engine now (see /api/cloud), so that's
  // the single source of truth — not the legacy/local `deployments` table.
  const totalDeployments = cloudDeps.length;
  const liveDeployments   = cloudDeps.filter(d => ['live', 'active', 'running', 'ready'].includes(d.status)).length;
  const failedDeployments = cloudDeps.filter(d => ['failed', 'error', 'crashed'].includes(d.status)).length;
  const providerCount     = new Set(cloudDeps.map(d => d.provider)).size;

  const statCards = [
    { label: 'Total Deployments', value: totalDeployments, icon: <Rocket size={20} color="#fff" />, gradient: 'linear-gradient(135deg,#6366f1,#a855f7)', onClick: () => navigate('/providers') },
    { label: 'Live', value: liveDeployments, icon: <CheckCircle2 size={20} color="#fff" />, gradient: 'linear-gradient(135deg,#30d158,#22d3ee)', onClick: () => navigate('/providers') },
    { label: 'Failed', value: failedDeployments, icon: <XCircle size={20} color="#fff" />, gradient: 'linear-gradient(135deg,#ff453a,#f59e0b)', onClick: () => navigate('/providers') },
    { label: 'Providers', value: providerCount, icon: <Cloud size={20} color="#fff" />, gradient: 'linear-gradient(135deg,#a855f7,#ec4899)', onClick: () => navigate('/providers') },
    { label: 'AI Reports', value: reports.length, icon: <FileText size={20} color="#fff" />, gradient: 'linear-gradient(135deg,#f59e0b,#ec4899)', onClick: () => navigate('/ai/hub') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', animation: 'float-up 250ms ease-out' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, letterSpacing: '-.01em' }}>Dashboard</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 3 }}>Platform health at a glance</p>
        </div>
        <Button icon={<RefreshCw size={14} />} onClick={() => { setLoading(true); fetchAll(); }} size="sm">Refresh</Button>
      </div>

      {}
      <div className="anim-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16 }}>
        {loading
          ? [...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 110, borderRadius: 'var(--r-lg)' }} />)
          : statCards.map((c, i) => <StatCard key={c.label} {...c} delay={i * 60} />)
        }
      </div>

      {}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
        {}
        <Card style={{ animation: 'float-up 350ms ease-out 240ms both' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Deploy Activity</div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Last 14 days</span>
            </div>
            {buildTimeline.length > 0 && (() => {
              const total = buildTimeline.reduce((s, d) => s + d.count, 0);
              const lastWeek = buildTimeline.slice(-7).reduce((s, d) => s + d.count, 0);
              return (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--accent-blue)', lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
                    {total}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginTop: 3 }}>
                    {lastWeek} in the last 7 days
                  </div>
                </div>
              );
            })()}
          </div>
          <div style={{ position: 'relative' }}>
            {buildTimeline.length > 0 ? (
              <MetricBarChart
                data={buildTimeline}
                dataKey="count"
                labelKey="date"
                color="var(--accent-blue)"
                unit=" deploys"
                height={190}
              />
            ) : (
              <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No deploy activity yet
              </div>
            )}
          </div>
        </Card>

        {}
        <Card style={{ display: 'flex', flexDirection: 'column', animation: 'float-up 350ms ease-out 270ms both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Deployments by Provider</div>
          </div>
          <ProviderPieChart cloudDeps={cloudDeps} />
        </Card>

        {}
        <Card style={{ display: 'flex', flexDirection: 'column', animation: 'float-up 350ms ease-out 300ms both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Recent AI Reports</div>
            {reports.length > 0 && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-pill)', background: 'var(--accent-blue-dim)', color: 'var(--accent-blue-2)' }}>
                {reports.length}
              </span>
            )}
          </div>
          {reports.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={20} color="var(--accent-blue-2)" />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>No reports generated yet</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 220, flex: 1 }}>
              {reports.slice(0, 4).map(r => (
                <ReportRow key={r.id} report={r} onOpen={() => navigate('/ai/hub')} />
              ))}
            </div>
          )}
          {reports.length > 0 && (
            <Button size="sm" variant="ghost" fullWidth icon={<Search size={12} />} onClick={() => navigate('/ai/hub')} style={{ marginTop: 10 }}>
              Open AI Hub
            </Button>
          )}
        </Card>
      </div>

      {}
      <Card style={{ padding: 0, overflow: 'hidden', animation: 'float-up 350ms ease-out 360ms both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 'var(--r-md)', background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={15} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Recent Deployments</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cloudDeps.length} total</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => navigate('/providers')}>View all →</Button>
        </div>

        {loading ? (
          <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 44 }} />)}
          </div>
        ) : cloudDeps.length === 0 ? (
          <EmptyState icon="🚀" title="No deployments yet"
            description="Deploy your first project to get started."
            action={<Button variant="primary" size="sm" onClick={() => navigate('/providers')}>New Deployment</Button>}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Name', 'Status', 'Provider', 'Region', 'Updated'].map(h => (
                    <th key={h} style={{ padding: '9px 20px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...cloudDeps]
                  .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
                  .slice(0, 8)
                  .map((d, i) => (
                  <tr
                    key={d.id}
                    onClick={() => navigate('/providers')}
                    style={{
                      borderTop: '1px solid var(--border-muted)',
                      cursor: 'pointer', transition: 'background 120ms',
                      animation: `float-up 250ms ease-out ${i * 40}ms both`,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-glass-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,var(--accent-blue-dim),var(--accent-purple-dim))', border: '1px solid var(--border-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Zap size={12} color="var(--accent-blue-2)" />
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{d.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px' }}><Badge variant="status" value={d.status}>{d.status}</Badge></td>
                    <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'capitalize' }}>{d.provider}</td>
                    <td style={{ padding: '12px 20px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{d.region || '—'}</td>
                    <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(d.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
