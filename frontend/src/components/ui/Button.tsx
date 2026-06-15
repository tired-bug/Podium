import React, { ButtonHTMLAttributes, ReactNode, useState } from 'react';
import { Spinner } from './Badge';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, { base: React.CSSProperties; hover: React.CSSProperties }> = {
  primary: {
    base:  { background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', color: '#fff', border: '1px solid transparent', boxShadow: '0 0 0 0 transparent' },
    hover: { boxShadow: 'var(--glow-blue)', transform: 'translateY(-1px)' },
  },
  secondary: {
    base:  { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' },
    hover: { background: 'var(--bg-card-hover)', borderColor: 'var(--border-bright)' },
  },
  ghost: {
    base:  { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' },
    hover: { background: 'var(--bg-glass-light)', color: 'var(--text-primary)', borderColor: 'var(--border)' },
  },
  danger: {
    base:  { background: 'var(--accent-red-dim)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)' },
    hover: { background: 'var(--accent-red)', color: '#fff', boxShadow: 'var(--glow-red)' },
  },
  success: {
    base:  { background: 'var(--accent-green-dim)', color: 'var(--accent-green)', border: '1px solid rgba(16,185,129,0.3)' },
    hover: { background: 'var(--accent-green)', color: '#fff', boxShadow: 'var(--glow-green)' },
  },
};

const SIZES: Record<Size, React.CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: '12px', gap: 5, height: 28, borderRadius: 'var(--r-md)' },
  md: { padding: '6px 14px', fontSize: '13px', gap: 6, height: 34, borderRadius: 'var(--r-md)' },
  lg: { padding: '9px 22px', fontSize: '14px', gap: 8, height: 42, borderRadius: 'var(--r-lg)' },
};

export function Button({
  variant = 'secondary', size = 'md', loading, icon, iconRight,
  fullWidth, children, disabled, style, ...props
}: ButtonProps) {
  const [hovered, setHovered] = useState(false);
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      disabled={isDisabled}
      onMouseEnter={e => { setHovered(true); props.onMouseEnter?.(e); }}
      onMouseLeave={e => { setHovered(false); props.onMouseLeave?.(e); }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-sans)', fontWeight: 600,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !loading ? 0.45 : 1,
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap', flexShrink: 0,
        width: fullWidth ? '100%' : undefined,
        ...v.base, ...s,
        ...(hovered && !isDisabled ? v.hover : {}),
        ...style,
      }}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} color="currentColor" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
}
