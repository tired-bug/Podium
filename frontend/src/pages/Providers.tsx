import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, XCircle, Zap, Eye, EyeOff, Copy, Check,
  ChevronRight, RefreshCw, Trash2, Globe, Settings2,
  Cpu, Database, Cloud, Server, ArrowRight, X,
} from 'lucide-react';
import { Card, SectionHeader, Badge, Spinner } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useRole } from '../hooks/useRole';
import { parseApiError } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
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

  const [renderOwners, setRenderOwners] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [fetchingOwners, setFetchingOwners] = useState(false);

  const update = (k: string, v: string) => {
    setValues(prev => ({ ...prev, [k]: v }));
    // When Render API key changes, auto-fetch available owners
    if (provider.id === 'render' && k === 'render_api_key' && v.length > 10) {
      fetchRenderOwners(v);
    }
  };

  const fetchRenderOwners = async (apiKey?: string) => {
    if (provider.id !== 'render') return;
    setFetchingOwners(true);
    try {
      // Save API key temporarily so backend can use it
      if (apiKey) {
        await api.post('/api/providers/render/credentials', { render_api_key: apiKey });
      }
      const r = await api.get('/api/providers/render/owners');
      setRenderOwners(r.data || []);
    } catch {
      setRenderOwners([]);
    } finally {
      setFetchingOwners(false);
    }
  };

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

                // Render: show owner dropdown for render_owner_id
                if (provider.id === 'render' && k.key === 'render_owner_id') {
                  return (
                    <div key={k.key}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                        {k.label}
                      </label>
                      {fetchingOwners ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: 'var(--text-muted)', fontSize: '13px' }}>
                          <Spinner size={12} color="var(--accent-blue)" /> Fetching workspaces…
                        </div>
                      ) : renderOwners.length > 0 ? (
                        <select
                          value={values[k.key] || ''}
                          onChange={e => setValues(prev => ({ ...prev, [k.key]: e.target.value }))}
                          style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '14px', fontFamily: 'var(--font-sans)', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value="">Auto-select default workspace</option>
                          {renderOwners.map(o => (
                            <option key={o.id} value={o.id}>{o.name} ({o.type}) — {o.id}</option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          label=""
                          type="text"
                          value={isMasked ? '' : (values[k.key] || '')}
                          onChange={e => setValues(prev => ({ ...prev, [k.key]: e.target.value }))}
                          placeholder={isMasked ? '••••• (leave empty to keep current)' : 'Enter API key above to auto-populate'}
                          hint={k.hint}
                        />
                      )}
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 6 }}>{k.hint}</p>
                    </div>
                  );
                }

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
  const navigate = useNavigate();
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
              {provider.connected ? 'Connected' : 'Not connected'}
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

      {/* Actions — flex:1 on each button so they stay side by side and never overflow the card */}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        {provider.connected ? (
          <>
            <Button variant="secondary" size="sm" icon={<Settings2 size={12} />} onClick={() => navigate(`/cloud?provider=${provider.id}`)} style={{ flex: '1 1 0', flexShrink: 1, minWidth: 0 }}>
              Manage
            </Button>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />} onClick={onConnect} style={{ flex: '1 1 0', flexShrink: 1, minWidth: 0 }}>
              Reconfigure
            </Button>
            {can.deleteDeployment && (
              <Button variant="danger" size="sm" icon={<Trash2 size={12} />} loading={disconnecting} onClick={handleDisconnect} style={{ flex: '1 1 0', flexShrink: 1, minWidth: 0 }}>
                Disconnect
              </Button>
            )}
          </>
        ) : (
          <Button variant="primary" size="sm" icon={<Zap size={12} />} onClick={onConnect} style={{ flex: '1 1 0', flexShrink: 1, minWidth: 0 }} disabled={!can.startStopRestart}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {providers.map(p => (
            <ProviderCard
              key={p.id}
              provider={p}
              onConnect={() => setWizard(p)}
              onDisconnect={load}
            />
          ))}
        </div>
      )}

      {/* Coming soon — not wired up to the backend yet */}
      <div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          Coming Soon
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {[
            { id: 'azure', name: 'Microsoft Azure', description: 'Deploy containers to Azure Container Instances across any region.' },
            { id: 'aws', name: 'Amazon Web Services', description: 'Ship to AWS App Runner with serverless container deploys.' },
            { id: 'gcp', name: 'Google Cloud Platform', description: 'Deploy to Cloud Run with automatic scale-to-zero.' },
          ].map(p => (
            <div key={p.id} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
              opacity: 0.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flexShrink: 0 }}>{LOGOS[p.id]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Coming soon</span>
                  </div>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                {p.description}
              </p>
              <Button variant="secondary" size="sm" disabled fullWidth style={{ marginTop: 'auto' }}>
                Coming Soon
              </Button>
            </div>
          ))}
        </div>
      </div>

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
