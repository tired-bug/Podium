import React, { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode, useEffect, useRef, CSSProperties, SelectHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { useToast } from '../../contexts/ToastContext';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X as CloseIcon } from 'lucide-react';

// ── Input ──────────────────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string;
  icon?: ReactNode; iconRight?: ReactNode; wrapStyle?: CSSProperties;
}

export function Input({ label, error, hint, icon, iconRight, wrapStyle, style, ...props }: InputProps) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...wrapStyle }}>
      {label && (
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '.03em' }}>
          {label}{props.required && <span style={{ color: 'var(--accent-red)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {icon && <span style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', display: 'flex', pointerEvents: 'none' }}>{icon}</span>}
        <input
          {...props}
          onFocus={e => { setFocused(true); props.onFocus?.(e); }}
          onBlur={e => { setFocused(false); props.onBlur?.(e); }}
          style={{
            width: '100%',
            padding: icon ? '7px 10px 7px 34px' : iconRight ? '7px 34px 7px 10px' : '7px 10px',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)',
            border: `1px solid ${error ? 'var(--accent-red)' : focused ? 'var(--accent-blue)' : 'var(--border)'}`,
            borderRadius: 'var(--r-md)', fontSize: '13px',
            fontFamily: 'var(--font-sans)', outline: 'none', transition: 'all 150ms',
            boxShadow: focused ? (error ? '0 0 0 3px rgba(239,68,68,0.12)' : '0 0 0 3px rgba(99,102,241,0.12)') : 'none',
            ...style,
          }}
        />
        {iconRight && <span style={{ position: 'absolute', right: 10, color: 'var(--text-muted)', display: 'flex' }}>{iconRight}</span>}
      </div>
      {error && <span style={{ fontSize: '11px', color: 'var(--accent-red)' }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{hint}</span>}
    </div>
  );
}

// ── Textarea ───────────────────────────────────────────────────────────────────
export function Textarea({ label, error, style, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>}
      <textarea {...props} style={{
        width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)',
        border: `1px solid ${error ? 'var(--accent-red)' : 'var(--border)'}`,
        borderRadius: 'var(--r-md)', fontSize: '13px', fontFamily: 'var(--font-sans)',
        outline: 'none', resize: 'vertical', transition: 'border-color 150ms', ...style,
      }}
        onFocus={e => e.target.style.borderColor = 'var(--accent-blue)'}
        onBlur={e => e.target.style.borderColor = error ? 'var(--accent-red)' : 'var(--border)'} />
      {error && <span style={{ fontSize: '11px', color: 'var(--accent-red)' }}>{error}</span>}
    </div>
  );
}

// ── Select ─────────────────────────────────────────────────────────────────────
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; error?: string;
  options: Array<{ value: string; label: string }>;
  wrapStyle?: CSSProperties;
}
export function Select({ label, error, options, wrapStyle, style, ...props }: SelectProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...wrapStyle }}>
      {label && <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>}
      <select {...props} style={{
        width: '100%', padding: '7px 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)',
        border: `1px solid ${error ? 'var(--accent-red)' : 'var(--border)'}`,
        borderRadius: 'var(--r-md)', fontSize: '13px', fontFamily: 'var(--font-sans)',
        outline: 'none', cursor: 'pointer', ...style,
      }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <span style={{ fontSize: '11px', color: 'var(--accent-red)' }}>{error}</span>}
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 520, footer }: {
  open: boolean; onClose: () => void; title?: string;
  children: ReactNode; width?: number | string; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) { window.addEventListener('keydown', h); ref.current?.focus(); }
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div ref={ref} tabIndex={-1} style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-modal)',
        width, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)',
        display: 'flex', flexDirection: 'column', animation: 'scale-in 150ms ease-out',
      }}>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 'var(--r-sm)', display: 'flex' }}>
              <X size={16} />
            </button>
          </div>
        )}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange, style }: {
  tabs: Array<{ id: string; label: string; icon?: ReactNode; count?: number }>;
  active: string; onChange: (id: string) => void; style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', ...style }}>
      {tabs.map(tab => {
        const isActive = tab.id === active;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${isActive ? 'var(--accent-blue)' : 'transparent'}`,
            marginBottom: -1,
            color: isActive ? 'var(--accent-blue-2)' : 'var(--text-secondary)',
            fontSize: '13px', fontWeight: isActive ? 600 : 400,
            cursor: 'pointer', transition: 'all 150ms', whiteSpace: 'nowrap',
            fontFamily: 'var(--font-sans)',
          }}>
            {tab.icon}{tab.label}
            {tab.count !== undefined && (
              <span style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: 'var(--r-pill)', fontSize: '11px', fontWeight: 600 }}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── ConfirmDialog ──────────────────────────────────────────────────────────────
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger', onConfirm, onCancel, loading }: {
  open: boolean; title: string; message: string; confirmLabel?: string; cancelLabel?: string;
  variant?: 'danger'|'primary'; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} width={400}
      footer={<><Button variant="ghost" onClick={onCancel} disabled={loading}>{cancelLabel}</Button><Button variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
      </div>
    </Modal>
  );
}

// ── Toast container ────────────────────────────────────────────────────────────
const ICONS: Record<string, ReactNode> = {
  success: <CheckCircle size={15} color="var(--accent-green)" />,
  error:   <AlertCircle  size={15} color="var(--accent-red)" />,
  warning: <AlertTriangle size={15} color="var(--accent-orange)" />,
  info:    <Info          size={15} color="var(--accent-blue)" />,
};
const ACCENTS: Record<string, string> = {
  success: 'var(--accent-green)', error: 'var(--accent-red)',
  warning: 'var(--accent-orange)', info: 'var(--accent-blue)',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'var(--bg-elevated)',
          border: `1px solid var(--border)`,
          borderLeft: `3px solid ${ACCENTS[t.type]}`,
          borderRadius: 'var(--r-lg)', padding: '10px 14px',
          boxShadow: 'var(--shadow-xl)',
          minWidth: 280, maxWidth: 400,
          animation: 'toast-in 250ms ease-out',
          pointerEvents: 'all',
          backdropFilter: 'blur(16px)',
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>{ICONS[t.type]}</span>
          <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1, lineHeight: 1.5 }}>{t.message}</span>
          <button onClick={() => dismiss(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, flexShrink: 0, display: 'flex' }}>
            <CloseIcon size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
