import React, { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode, useEffect, CSSProperties, SelectHTMLAttributes } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, X as CloseIcon } from 'lucide-react';
import { Button } from './Button';
import { useToast } from '../../contexts/ToastContext';

export function Input({ label, error, hint, icon, iconRight, wrapStyle, style, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  label?: string; error?: string; hint?: string;
  icon?: ReactNode; iconRight?: ReactNode; wrapStyle?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...wrapStyle }}>
      {label && (
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '.03em' }}>
          {label}{props.required && <span style={{ color: 'var(--accent-red)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {icon && <span style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', display: 'flex', pointerEvents: 'none', zIndex: 1 }}>{icon}</span>}
        <input
          {...props}
          className={`podium-input${error ? ' podium-input-error' : ''}${props.className ? ' ' + props.className : ''}`}
          style={{
            width: '100%',
            padding: icon ? '7px 10px 7px 34px' : iconRight ? '7px 34px 7px 10px' : '7px 10px',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)',
            border: `1px solid ${error ? 'var(--accent-red)' : 'var(--border)'}`,
            borderRadius: 'var(--r-md)', fontSize: '13px',
            fontFamily: 'var(--font-sans)', outline: 'none', transition: 'border-color 150ms, box-shadow 150ms',
            boxSizing: 'border-box',
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

export function Textarea({ label, error, style, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>}
      <textarea {...props} className="podium-input" style={{
        width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)',
        border: `1px solid ${error ? 'var(--accent-red)' : 'var(--border)'}`,
        borderRadius: 'var(--r-md)', fontSize: '13px', fontFamily: 'var(--font-sans)',
        outline: 'none', resize: 'vertical', transition: 'border-color 150ms', boxSizing: 'border-box', ...style,
      }} />
      {error && <span style={{ fontSize: '11px', color: 'var(--accent-red)' }}>{error}</span>}
    </div>
  );
}

export function Select({ label, error, options, wrapStyle, style, ...props }: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string; error?: string;
  options: Array<{ value: string; label: string }>;
  wrapStyle?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...wrapStyle }}>
      {label && <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>}
      <select {...props} className="podium-input" style={{
        width: '100%', padding: '7px 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)',
        border: `1px solid ${error ? 'var(--accent-red)' : 'var(--border)'}`,
        borderRadius: 'var(--r-md)', fontSize: '13px', fontFamily: 'var(--font-sans)',
        outline: 'none', cursor: 'pointer', boxSizing: 'border-box', ...style,
      }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <span style={{ fontSize: '11px', color: 'var(--accent-red)' }}>{error}</span>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 520, footer }: {
  open: boolean; onClose: () => void; title?: string;
  children: ReactNode; width?: number | string; footer?: ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div style={{
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

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel, danger = true }: {
  open: boolean; title: string; message: string;
  confirmLabel?: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}

export function Tabs({ tabs, active, onChange }: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string; onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 'var(--r-md)', padding: 3, flexShrink: 0 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: '5px 10px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
          background: active === t.id ? 'var(--bg-elevated)' : 'transparent',
          color: active === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
          fontWeight: active === t.id ? 600 : 400, fontSize: '12px',
          boxShadow: active === t.id ? 'var(--shadow-sm)' : 'none',
          transition: 'all 150ms', fontFamily: 'var(--font-sans)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {t.label}
          {t.count !== undefined && (
            <span style={{
              fontSize: '10px', padding: '1px 5px', borderRadius: 'var(--r-pill)',
              background: active === t.id ? 'var(--accent-blue-dim)' : 'var(--bg-tertiary)',
              color: active === t.id ? 'var(--accent-blue)' : 'var(--text-muted)',
            }}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  const icons: Record<string, ReactNode> = {
    success: <CheckCircle size={15} color="var(--accent-green)" />,
    error:   <AlertCircle  size={15} color="var(--accent-red)"   />,
    warning: <AlertTriangle size={15} color="var(--accent-yellow)" />,
    info:    <Info          size={15} color="var(--accent-blue)"  />,
  };
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', padding: '12px 14px',
          boxShadow: 'var(--shadow-lg)', animation: 'slide-right 200ms ease-out',
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>{icons[t.type]}</span>
          <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1, lineHeight: 1.4 }}>{t.message}</span>
          <button onClick={() => dismiss(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', flexShrink: 0 }}>
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
