import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, SectionHeader, Skeleton, Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { MetricChart } from '../components/charts/MetricChart';
import { useDeployments } from '../hooks/useDeployments';
import api from '../lib/api';

const TIME_RANGES = [
  { label: '5m',  ms: 5 * 60 * 1000 },
  { label: '15m', ms: 15 * 60 * 1000 },
  { label: '1h',  ms: 60 * 60 * 1000 },
  { label: '6h',  ms: 6 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
];

const CHART_COLORS = ['var(--accent-blue)', 'var(--accent-green)', 'var(--accent-purple)', 'var(--accent-orange)'];

interface MetricPoint {
  timestamp: number;
  cpu: number;
  memory: number;
  network_in: number;
  network_out: number;
  deployment_id: string;
}

export default function Metrics() {
  const { deployments } = useDeployments();
  const runningDeps = deployments.filter(d => d.status === 'running');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState(TIME_RANGES[2]);
  const [metricsMap, setMetricsMap] = useState<Record<string, MetricPoint[]>>({});
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto-select first two running deployments
  useEffect(() => {
    if (selectedIds.length === 0 && runningDeps.length > 0) {
      setSelectedIds(runningDeps.slice(0, 2).map(d => d.id));
    }
  }, [runningDeps]);

  const fetchMetrics = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      const from = Date.now() - timeRange.ms;
      const resolution = timeRange.ms > 60 * 60 * 1000 ? '5m' : timeRange.ms > 15 * 60 * 1000 ? '1m' : 'raw';
      const results = await Promise.all(
        selectedIds.map(id =>
          api.get(`/api/metrics/${id}?from=${from}&resolution=${resolution}`)
            .then(r => ({ id, metrics: r.data.metrics || [], latest: r.data.latest }))
            .catch(() => ({ id, metrics: [], latest: null }))
        )
      );
      const map: Record<string, MetricPoint[]> = {};
      for (const r of results) map[r.id] = r.metrics;
      setMetricsMap(map);
    } finally {
      setLoading(false);
    }
  }, [selectedIds, timeRange]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, [fetchMetrics, autoRefresh]);

  const toggleDep = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Build combined chart data — merge metrics from all selected deployments
  const buildChartData = (key: string): any[] => {
    const allTimestamps = new Set<number>();
    for (const id of selectedIds) {
      for (const m of metricsMap[id] || []) allTimestamps.add(m.timestamp);
    }

    return Array.from(allTimestamps).sort().map(ts => {
      const point: Record<string, number | string> = { timestamp: ts, cpu: 0, memory: 0, network_in: 0, network_out: 0, deployment_id: '' };
      for (const id of selectedIds) {
        const metric = (metricsMap[id] || []).find(m => m.timestamp === ts);
        const dep = deployments.find(d => d.id === id);
        const label = dep?.name || id.slice(0, 8);
        (point as any)[label] = metric ? (metric as any)[key] ?? 0 : 0;
      }
      return point;
    });
  };

  const lineConfigs = selectedIds.map((id, i) => {
    const dep = deployments.find(d => d.id === id);
    return { key: dep?.name || id.slice(0, 8), label: dep?.name || id.slice(0, 8), color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  // Get latest metrics for summary table
  const getLatest = (id: string) => {
    const pts = metricsMap[id] || [];
    return pts[pts.length - 1] || null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Metrics"
        subtitle="Real-time resource monitoring"
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

      {/* Controls */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Time range */}
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Time Range</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {TIME_RANGES.map(r => (
              <button key={r.label} onClick={() => setTimeRange(r)}
                style={{
                  padding: '4px 12px', borderRadius: 'var(--radius-md)',
                  background: timeRange.label === r.label ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                  color: timeRange.label === r.label ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${timeRange.label === r.label ? 'var(--accent-blue)' : 'var(--border)'}`,
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 100ms',
                  fontFamily: 'var(--font-sans)',
                }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Deployment selector */}
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Deployments</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {deployments.map((d, i) => {
              const selected = selectedIds.includes(d.id);
              const color = CHART_COLORS[selectedIds.indexOf(d.id) % CHART_COLORS.length];
              return (
                <button key={d.id} onClick={() => toggleDep(d.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', borderRadius: 'var(--radius-pill)',
                    background: selected ? color + '22' : 'var(--bg-tertiary)',
                    color: selected ? color : 'var(--text-secondary)',
                    border: `1px solid ${selected ? color : 'var(--border)'}`,
                    fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    fontWeight: selected ? 600 : 400,
                  }}>
                  {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />}
                  {d.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Charts 2×2 */}
      {loading && Object.keys(metricsMap).length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[1, 2, 3, 4].map(i => <Card key={i}><Skeleton height={200} /></Card>)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card>
            <MetricChart data={buildChartData('cpu')} lines={lineConfigs} type="line" unit="%" height={200} title="CPU Usage (%)" yDomain={[0, 100]} />
          </Card>
          <Card>
            <MetricChart data={buildChartData('memory')} lines={lineConfigs} type="line" unit=" MB" height={200} title="Memory Usage (MB)" />
          </Card>
          <Card>
            <MetricChart data={buildChartData('network_in')} lines={lineConfigs} type="area" unit=" KB/s" height={200} title="Network In (KB/s)" />
          </Card>
          <Card>
            <MetricChart data={buildChartData('network_out')} lines={lineConfigs} type="area" unit=" KB/s" height={200} title="Network Out (KB/s)" />
          </Card>
        </div>
      )}

      {/* Summary table */}
      {selectedIds.length > 0 && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: '13px', fontWeight: 600 }}>
            Current Stats
          </div>
          <table style={{ width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {['Deployment', 'Status', 'CPU', 'Memory', 'Net In', 'Net Out'].map(h => (
                  <th key={h} style={{ padding: '8px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedIds.map(id => {
                const dep = deployments.find(d => d.id === id);
                const latest = getLatest(id);
                return (
                  <tr key={id} style={{ borderTop: '1px solid var(--border-muted)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{dep?.name || id.slice(0, 8)}</td>
                    <td style={{ padding: '10px 16px' }}><Badge variant="status" value={dep?.status || 'unknown'}>{dep?.status || 'unknown'}</Badge></td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: (latest?.cpu || 0) > 80 ? 'var(--accent-red)' : 'var(--text-primary)' }}>{latest ? `${latest.cpu.toFixed(1)}%` : '—'}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: (latest?.memory || 0) > 800 ? 'var(--accent-orange)' : 'var(--text-primary)' }}>{latest ? `${latest.memory.toFixed(0)} MB` : '—'}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>{latest ? `${latest.network_in.toFixed(1)} KB/s` : '—'}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>{latest ? `${latest.network_out.toFixed(1)} KB/s` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
