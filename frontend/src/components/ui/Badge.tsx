import React, { ReactNode, CSSProperties, useState } from 'react';
import { getStatusColor, getRoleColor, getSeverityColor } from '../../lib/utils';

export function Spinner({ size = 16, color }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin .7s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke={color || 'var(--accent-blue)'} strokeWidth="2.5"
        strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  );
}

export function Badge({ children, variant = 'default', value, style }: {
  children: ReactNode; variant?: 'status'|'role'|'severity'|'default'; value?: string; style?: CSSProperties;
}) {
  let color = 'var(--text-muted)', bg = 'var(--bg-elevated)';
  if (variant === 'status' && value)   { color = getStatusColor(value);   bg = color + '20'; }
  if (variant === 'role' && value)     { color = getRoleColor(value);      bg = color + '20'; }
  if (variant === 'severity' && value) { color = getSeverityColor(value);  bg = color + '20'; }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 'var(--r-pill)',
      fontSize: '11px', fontWeight: 600, letterSpacing: '.03em',
      background: bg, color, border: `1px solid ${color}33`,
      textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0, ...style,
    }}>
      {variant === 'status' && value && <span className={`status-dot ${value}`} style={{ width: 6, height: 6 }} />}
      {children}
    </span>
  );
}

export function Card({ children, style, className, onClick, padding = 16, hoverable, glow }: {
  children: ReactNode; style?: CSSProperties; className?: string;
  onClick?: () => void; padding?: number | string; hoverable?: boolean; glow?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className={`${className || ''} ${hoverable ? 'card-3d' : ''}`}
      onClick={onClick}
      onMouseEnter={() => hoverable && setHovered(true)}
      onMouseLeave={() => hoverable && setHovered(false)}
      style={{
        background: hovered ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        border: `1px solid ${hovered && glow ? 'var(--border-glow)' : 'var(--border)'}`,
        borderRadius: 'var(--r-lg)', padding,
        boxShadow: hovered && glow ? 'var(--shadow-lg), var(--glow-blue)' : 'var(--shadow-card)',
        transition: 'all 200ms ease', cursor: onClick ? 'pointer' : undefined,
        position: 'relative', overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode; title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', gap: 12, textAlign: 'center' }}>
      {icon && <div style={{ fontSize: 40, marginBottom: 4, opacity: .35 }}>{icon}</div>}
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
      {description && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: 340 }}>{description}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function Tooltip({ children, content, placement = 'top' }: {
  children: ReactNode; content: string; placement?: 'top'|'bottom'|'left'|'right';
}) {
  const [visible, setVisible] = useState(false);
  const pos: Record<string, CSSProperties> = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 6 },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 6 },
  };
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && content && (
        <span style={{
          position: 'absolute', zIndex: 9999,
          background: 'var(--bg-elevated)', color: 'var(--text-primary)',
          border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
          padding: '4px 8px', fontSize: '12px', whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-lg)', pointerEvents: 'none', ...pos[placement],
        }}>
          {content}
        </span>
      )}
    </span>
  );
}

export function SectionHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-.01em' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: 3 }}>{subtitle}</p>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ width, height = 16, style }: {
  width?: number|string; height?: number; style?: CSSProperties;
}) {
  return <div className="skeleton" style={{ width: width || '100%', height, ...style }} />;
}

export function Divider({ style }: { style?: CSSProperties }) {
  return <div style={{ borderTop: '1px solid var(--border)', ...style }} />;
}
