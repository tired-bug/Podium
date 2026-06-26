import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket, Container, AlertTriangle, Cloud, CheckCircle,
  TrendingUp, TrendingDown, RefreshCw,
  Activity, Zap,
} from 'lucide-react';
import { Card, Badge, EmptyState, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { MetricChart } from '../components/charts/MetricChart';
import { useDeployments } from '../hooks/useDeployments';
import { useToast } from '../contexts/ToastContext';
import { timeAgo, parseApiError } from '../lib/utils';
import api from '../lib/api';

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

function AnomalyRow({ anomaly, onResolve, resolving }: {
  anomaly: any; onResolve: (id: string) => void; resolving: boolean;
}) {
  const color = anomaly.severity === 'critical' ? 'var(--accent-red)' : 'var(--accent-orange)';
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--r-md)',
      background: 'var(--bg-elevated)',
      borderLeft: `3px solid ${color}`,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
      animation: 'float-up 250ms ease-out both',
      transition: 'all 200ms',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{anomaly.deployment_name}</span>
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--r-pill)', background: color + '20', color }}>{anomaly.severity}</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{anomaly.message}</div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 3 }}>{timeAgo(anomaly.created_at)}</div>
      </div>
      <Button size="sm" variant="success" loading={resolving} onClick={() => onResolve(anomaly.id)}
        style={{ flexShrink: 0, fontSize: '11px' }}>
        Resolve
      </Button>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { deployments, loading, refetch } = useDeployments(15_000);
  const [anomalies,  setAnomalies]  = useState<any[]>([]);
  const [cloudDeps,  setCloudDeps]  = useState<any[]>([]);
  const [metrics,    setMetrics]    = useState<any[]>([]);
  const [resolving,  setResolving]  = useState<string | null>(null);
  const { success, error: showError } = useToast();

  const fetchAll = useCallback(async () => {
    const [anomRes, cloudRes] = await Promise.allSettled([
      api.get('/api/ai/anomalies'),
      api.get('/api/cloud'),
    ]);
    if (anomRes.status === 'fulfilled') setAnomalies(anomRes.value.data);
    if (cloudRes.status === 'fulfilled') setCloudDeps(cloudRes.value.data);

    const days = Array.from({ length: 7 }, (_, i) => ({
      timestamp: Date.now() - (6 - i) * 86_400_000,
      successRate: 82 + Math.random() * 18,
    }));
    setMetrics(days);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleResolve = async (id: string) => {
    setResolving(id);
    try {
      await api.put(`/api/ai/anomalies/${id}/resolve`);
      setAnomalies(a => a.filter(x => x.id !== id));
      success('Anomaly resolved');
    } catch (err) { showError(parseApiError(err)); }
    finally { setResolving(null); }
  };

  const running  = deployments.filter(d => d.status === 'running').length;
  const failed   = deployments.filter(d => d.status === 'failed').length;

  const statCards = [
    { label: 'Total Deployments', value: deployments.length, icon: <Rocket size={20} color="#fff" />,    gradient: 'linear-gradient(135deg,#6366f1,#a855f7)', trend: 12,  onClick: () => navigate('/cloud') },
    { label: 'Running Deployments', value: running,          icon: <Container size={20} color="#fff" />,  gradient: 'linear-gradient(135deg,#10b981,#14b8a6)', onClick: () => navigate('/cloud') },
    { label: 'Active Anomalies',   value: anomalies.length,  icon: <AlertTriangle size={20} color="#fff" />, gradient: anomalies.length > 0 ? 'linear-gradient(135deg,#ef4444,#f59e0b)' : 'linear-gradient(135deg,#10b981,#14b8a6)', onClick: () => navigate('/ai/anomalies') },
    { label: 'Cloud Deployments',  value: cloudDeps.length,  icon: <Cloud size={20} color="#fff" />,      gradient: 'linear-gradient(135deg,#22d3ee,#6366f1)',  onClick: () => navigate('/cloud') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', animation: 'float-up 250ms ease-out' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, letterSpacing: '-.01em' }}>Dashboard</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 3 }}>Platform health at a glance</p>
        </div>
        <Button icon={<RefreshCw size={14} />} onClick={() => { fetchAll(); refetch(); }} size="sm">Refresh</Button>
      </div>

      {}
      <div className="anim-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 110, borderRadius: 'var(--r-lg)' }} />
            ))
          : statCards.map((c, i) => <StatCard key={c.label} {...c} delay={i * 60} />)
        }
      </div>

      {}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {}
        <Card style={{ animation: 'float-up 350ms ease-out 240ms both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Deployment Health</div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Last 7 days</span>
          </div>
          <MetricChart
            data={metrics}
            lines={[{ key: 'successRate', label: 'Success Rate', color: 'var(--accent-green)' }]}
            type="area" unit="%" height={160} yDomain={[0, 100]}
          />
        </Card>

        {}
        <Card style={{ display: 'flex', flexDirection: 'column', animation: 'float-up 350ms ease-out 300ms both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Active Anomalies</div>
            {anomalies.length > 0 && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-pill)', background: 'var(--accent-red-dim)', color: 'var(--accent-red)' }}>
                {anomalies.length}
              </span>
            )}
          </div>
          {anomalies.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-green-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={22} color="var(--accent-green)" />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>All systems healthy</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 220, flex: 1 }}>
              {anomalies.slice(0, 4).map(a => (
                <AnomalyRow key={a.id} anomaly={a} onResolve={handleResolve} resolving={resolving === a.id} />
              ))}
            </div>
          )}
          {anomalies.length > 0 && (
            <Button size="sm" variant="ghost" fullWidth onClick={() => navigate('/ai/anomalies')} style={{ marginTop: 10 }}>
              View all anomalies
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
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{deployments.length} total</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => navigate('/cloud')}>View all →</Button>
        </div>

        {loading ? (
          <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 44 }} />)}
          </div>
        ) : deployments.length === 0 ? (
          <EmptyState icon="🚀" title="No deployments yet"
            description="Deploy your first project to get started."
            action={<Button variant="primary" size="sm" onClick={() => navigate('/cloud')}>New Deployment</Button>}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Name', 'Status', 'Branch', 'Image', 'Updated', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '9px 20px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deployments.slice(0, 8).map((d, i) => (
                  <tr
                    key={d.id}
                    onClick={() => navigate('/cloud')}
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
                    <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{d.branch}</td>
                    <td style={{ padding: '12px 20px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.image || '—'}</td>
                    <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(d.updated_at)}</td>
                    <td style={{ padding: '12px 20px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {d.status !== 'running' && d.status !== 'building' && (
                          <Button size="sm" variant="success" onClick={async () => { await api.post(`/api/deployments/${d.id}/start`); refetch(); }}>Start</Button>
                        )}
                        {d.status === 'running' && (
                          <Button size="sm" variant="ghost" onClick={async () => { await api.post(`/api/deployments/${d.id}/stop`); refetch(); }}>Stop</Button>
                        )}
                      </div>
                    </td>
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
