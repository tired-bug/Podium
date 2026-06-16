import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, XCircle, Zap, Eye, EyeOff, Copy, Check,
  ChevronRight, AlertTriangle, RefreshCw, Trash2, Globe,
  Shield, Cpu, Database, Cloud, Server, ArrowRight, X,
} from 'lucide-react';
import { Card, SectionHeader, Badge, Spinner } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useRole } from '../hooks/useRole';
import { parseApiError } from '../lib/utils';
import api from '../lib/api';

// ── Provider logos (SVG inline) ──────────────────────────────────────────────

const LOGOS: Record<string, React.ReactNode> = {
  render: (
    <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
      <rect width="40" height="40" rx="10" fill="#46E3B7" />
      <path d="M20 10 L28 20 L20 30 L12 20 Z" fill="#fff" fillOpacity=".9" />
    </svg>
  ),
  railway: (
    <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
      <rect width="40" height="40" rx="10" fill="#0B0D0E" />
      <rect x="8" y="17" width="24" height="3" rx="1.5" fill="#fff" />
      <rect x="12" y="10" width="3" height="20" rx="1.5" fill="#fff" />
      <rect x="25" y="10" width="3" height="20" rx="1.5" fill="#fff" />
    </svg>
  ),
  vercel: (
    <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
      <rect width="40" height="40" rx="10" fill="#000" />
      <path d="M20 10 L32 30 H8 Z" fill="#fff" />
    </svg>
  ),
  aws: (
    <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
      <rect width="40" height="40" rx="10" fill="#232F3E" />
      <path d="M12 22c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4s-1.8-4-4-4h-1a5 5 0 0 0-10 0c-1.1.4-2 1.5-2 2.8v1.2z" fill="#FF9900" />
      <path d="M10 28l2-2m18 2l-2-2" stroke="#FF9900" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  azure: (
    <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
      <rect width="40" height="40" rx="10" fill="#0078D4" />
      <path d="M12 28 L20 12 L24 20 L18 20 L26 28 Z" fill="#fff" fillOpacity=".9" />
    </svg>
  ),
  gcp: (
    <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
      <rect width="40" height="40" rx="10" fill="#fff" />
      <path d="M20 10a10 10 0 0 1 0 20 10 10 0 0 1 0-20z" fill="none" stroke="#4285F4" strokeWidth="3" />
      <path d="M20 10 A10 10 0 0 1 30 20" stroke="#EA4335" strokeWidth="3" fill="none" />
      <path d="M30 20 A10 10 0 0 1 20 30" stroke="#FBBC04" strokeWidth="3" fill="none" />
      <circle cx="20" cy="10" r="2.5" fill="#4285F4" />
      <circle cx="30" cy="20" r="2.5" fill="#EA4335" />
      <circle cx="20" cy="30" r="2.5" fill="#34A853" />
    </svg>
  ),
};

interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  isDemo: boolean;
  tier: 'free' | 'enterprise_demo';
  capabilities: string[];
  connected: boolean;
  credentialsMasked: Record<string, string>;
  credentialKeys: Array<{
    key: string; label: string; placeholder: string;
    required: boolean; masked?: boolean; hint?: string;
  }>;
  regions?: string[];
}

// ── Connection Wizard ────────────────────────────────────────────────────────

type WizardStep = 'credentials' | 'validate' | 'done';

function ConnectionWizard({
  provider,
  onClose,
  onSaved,
}: {
  provider: ProviderMeta;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { success, error: showError } = useToast();
  const [step, setStep] = useState<WizardStep>('credentials');
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (k: string, v: string) => setValues(prev => ({ ...prev, [k]: v }));

  const copyToClip = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const allRequired = provider.credentialKeys
    .filter(k => k.required)
    .every(k => values[k.key] || provider.credentialsMasked[k.key]);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.post(`/api/providers/${provider.id}/connect`, values);
      setTestResult(r.data);
      if (r.data.ok) setStep('validate');
    } catch (e) {
      setTestResult({ ok: false, error: parseApiError(e) });
    } finally {
      setTesting(false);
    }
  };

  const saveOnly = async () => {
    setSaving(true);
    try {
      await api.post(`/api/providers/${provider.id}/credentials`, values);
      success(`${provider.name} credentials saved`);
      setStep('done');
      onSaved();
    } catch (e) {
      showError(parseApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const STEPS: WizardStep[] = ['credentials', 'validate', 'done'];
  const stepIdx = STEPS.indexOf(step);
  const stepLabels = ['Credentials', 'Validate', 'Ready'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)', width: '100%', maxWidth: 540,
        boxShadow: 'var(--shadow-modal)',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {LOGOS[provider.id]}
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{provider.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Connect your {provider.name} account</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: i < stepIdx ? 'var(--accent-green)' : i === stepIdx ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                    border: `2px solid ${i < stepIdx ? 'var(--accent-green)' : i === stepIdx ? 'var(--accent-blue)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: i <= stepIdx ? '#fff' : 'var(--text-muted)', fontSize: '11px', fontWeight: 700,
                    transition: 'all 300ms',
                  }}>
                    {i < stepIdx ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: '10px', color: i === stepIdx ? 'var(--accent-blue-2)' : i < stepIdx ? 'var(--accent-green)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {stepLabels[i]}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: i < stepIdx ? 'var(--accent-green)' : 'var(--border)', margin: '0 8px', marginBottom: 16, transition: 'background 400ms' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '0 24px 24px', overflowY: 'auto', flex: 1 }}>
          {step === 'credentials' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                {provider.description}
              </p>

              {provider.credentialKeys.map(k => {
                const showVal = show[k.key];
                const isMasked = !values[k.key] && !!provider.credentialsMasked[k.key];
                return (
                  <div key={k.key}>
                    <Input
                      label={k.label + (k.required ? ' *' : ' (optional)')}
                      type={k.masked && !showVal ? 'password' : 'text'}
                      value={isMasked ? '' : (values[k.key] || '')}
                      onChange={e => update(k.key, e.target.value)}
                      placeholder={isMasked ? '••••• (leave empty to keep current)' : k.placeholder}
                      hint={k.hint}
                      iconRight={k.masked ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {values[k.key] && (
                            <button onClick={() => copyToClip(values[k.key], k.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                              {copied === k.key ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                            </button>
                          )}
                          <button onClick={() => setShow(s => ({ ...s, [k.key]: !s[k.key] }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                            {showVal ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        </div>
                      ) : undefined}
                    />
                  </div>
                );
              })}

              {testResult && (
                <div style={{
                  padding: '10px 14px', borderRadius: 'var(--r-md)',
                  background: testResult.ok ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)',
                  border: `1px solid ${testResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  {testResult.ok
                    ? <CheckCircle size={14} color="var(--accent-green)" />
                    : <XCircle size={14} color="var(--accent-red)" />}
                  <span style={{ fontSize: '12px', color: testResult.ok ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {testResult.ok ? 'Connection successful!' : testResult.error}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button
                  variant="primary" size="md" fullWidth
                  loading={testing} disabled={!allRequired}
                  icon={<Zap size={14} />}
                  onClick={testConnection}
                >
                  Test Connection
                </Button>
                <Button variant="secondary" size="md" loading={saving} disabled={!allRequired} onClick={saveOnly}>
                  Save Only
                </Button>
              </div>
            </div>
          )}

          {step === 'validate' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-green-dim)', border: '2px solid var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <CheckCircle size={28} color="var(--accent-green)" />
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Connection Verified!</div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 24 }}>
                Your {provider.name} credentials are valid and working. Save them to start deploying.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <Button variant="primary" icon={<ArrowRight size={14} />} loading={saving} onClick={saveOnly}>
                  Save & Finish
                </Button>
                <Button variant="ghost" onClick={() => setStep('credentials')}>Back</Button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '40px', marginBottom: 16 }}>🎉</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                {provider.name} is Ready!
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 24 }}>
                You can now deploy projects to {provider.name} from the Providers dashboard.
              </p>
              <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  onConnect,
  onDisconnect,
}: {
  provider: ProviderMeta;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const { can } = useRole();
  const [disconnecting, setDisconnecting] = useState(false);
  const { success, error: showError } = useToast();

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.delete(`/api/providers/${provider.id}/credentials`);
      success(`${provider.name} disconnected`);
      onDisconnect();
    } catch (e) {
      showError(parseApiError(e));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid ${provider.connected ? 'rgba(16,185,129,0.25)' : 'var(--border)'}`,
      borderRadius: 'var(--r-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
      transition: 'border-color 200ms, box-shadow 200ms',
      boxShadow: provider.connected ? '0 0 0 1px rgba(16,185,129,0.1) inset' : 'var(--shadow-card)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Demo badge */}
      {provider.isDemo && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: 'var(--accent-orange-dim)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 'var(--r-pill)', padding: '2px 10px',
          fontSize: '10px', fontWeight: 700, color: 'var(--accent-orange)',
          letterSpacing: '.06em', textTransform: 'uppercase',
        }}>
          Demo Mode
        </div>
      )}

      {/* Connected glow strip */}
      {provider.connected && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--gradient-green)' }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flexShrink: 0 }}>{LOGOS[provider.id]}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{provider.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: provider.connected ? 'var(--accent-green)' : 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: provider.connected ? 'var(--accent-green)' : 'var(--text-muted)' }}>
              {provider.connected ? 'Connected' : provider.isDemo ? 'Demo only' : 'Not connected'}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
        {provider.description}
      </p>

      {/* Capabilities */}
      <div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Capabilities</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {provider.capabilities.map(c => (
            <span key={c} style={{
              fontSize: '10px', padding: '3px 8px', borderRadius: 'var(--r-pill)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontWeight: 500,
            }}>{c}</span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        {provider.connected ? (
          <>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />} onClick={onConnect} fullWidth>
              Reconfigure
            </Button>
            {can.deleteDeployment && (
              <Button variant="danger" size="sm" icon={<Trash2 size={12} />} loading={disconnecting} onClick={handleDisconnect}>
                Disconnect
              </Button>
            )}
          </>
        ) : provider.isDemo ? (
          <div style={{
            flex: 1, padding: '8px 12px', borderRadius: 'var(--r-md)',
            background: 'var(--accent-orange-dim)', border: '1px solid rgba(245,158,11,0.2)',
            fontSize: '11px', color: 'var(--accent-orange)', textAlign: 'center', lineHeight: 1.4,
          }}>
            <AlertTriangle size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Available in Enterprise tier — architecture & cost planning active
          </div>
        ) : (
          <Button variant="primary" size="sm" icon={<Zap size={12} />} onClick={onConnect} fullWidth disabled={!can.startStopRestart}>
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main Providers Page ──────────────────────────────────────────────────────

export default function Providers() {
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState<ProviderMeta | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/api/providers');
      setProviders(r.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const free = providers.filter(p => p.tier === 'free');
  const enterprise = providers.filter(p => p.tier === 'enterprise_demo');
  const connected = providers.filter(p => p.connected).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="Cloud Providers"
        subtitle="Connect deployment platforms to enable one-click cloud deploys"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 10px', borderRadius: 'var(--r-pill)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              {connected} / {providers.length} connected
            </div>
            <Button size="sm" icon={<RefreshCw size={13} />} onClick={load}>Refresh</Button>
          </div>
        }
      />

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', height: 240 }} />
          ))}
        </div>
      ) : (
        <>
          {/* Free Tier */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 24, height: 24, borderRadius: 'var(--r-md)', background: 'var(--accent-green-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={13} color="var(--accent-green)" />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Free Tier — Fully Functional</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
              {free.map(p => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  onConnect={() => setWizard(p)}
                  onDisconnect={load}
                />
              ))}
            </div>
          </div>

          {/* Enterprise Demo */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 24, height: 24, borderRadius: 'var(--r-md)', background: 'var(--accent-orange-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={13} color="var(--accent-orange)" />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Enterprise Demo</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
              {enterprise.map(p => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  onConnect={() => setWizard(p)}
                  onDisconnect={load}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Connection wizard modal */}
      {wizard && (
        <ConnectionWizard
          provider={wizard}
          onClose={() => setWizard(null)}
          onSaved={() => { load(); }}
        />
      )}
    </div>
  );
}
