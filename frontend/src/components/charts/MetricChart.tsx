import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { formatDate } from '../../lib/utils';

interface MetricDataPoint {
  timestamp: number;
  [key: string]: number | string;
}

interface MetricChartProps {
  data: MetricDataPoint[];
  lines: Array<{
    key: string;
    label: string;
    color: string;
  }>;
  type?: 'line' | 'area';
  unit?: string;
  height?: number;
  title?: string;
  yDomain?: [number | 'auto', number | 'auto'];
}

const CustomTooltip = ({ active, payload, label, unit }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: '8px 12px',
      boxShadow: 'var(--shadow-dropdown)', fontSize: '12px',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
        {formatDate(label, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}{unit}
          </span>
        </div>
      ))}
    </div>
  );
};

export function MetricChart({
  data, lines, type = 'line', unit = '', height = 200, title, yDomain,
}: MetricChartProps) {
  const ChartComponent = type === 'area' ? AreaChart : LineChart;
  const DataComponent = type === 'area' ? Area : Line;

  const formattedData = data.map(d => ({
    ...d,
    _time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div>
      {title && (
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
          {title}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <ChartComponent data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-muted)" vertical={false} />
          <XAxis
            dataKey="_time"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            domain={yDomain || ['auto', 'auto']}
            tickFormatter={v => `${v}${unit}`}
          />
          <Tooltip content={<CustomTooltip unit={unit} />} />
          {lines.length > 1 && (
            <Legend
              formatter={(value) => (
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{value}</span>
              )}
            />
          )}
          {lines.map(line => (
            type === 'area' ? (
              <Area
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                fill={line.color + '22'}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4, fill: line.color }}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4, fill: line.color }}
                isAnimationActive={false}
              />
            )
          ))}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}

export function MiniSparkline({ data, color = 'var(--accent-blue)', height = 40 }: {
  data: number[]; color?: string; height?: number;
}) {
  const points = data.map((v, i) => ({
    v,
    i,
  }));
  const max = Math.max(...data, 1);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points}>
        <Area type="monotone" dataKey="v" stroke={color} fill={color + '30'} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <YAxis domain={[0, max]} hide />
        <XAxis dataKey="i" hide />
      </AreaChart>
    </ResponsiveContainer>
  );
}
