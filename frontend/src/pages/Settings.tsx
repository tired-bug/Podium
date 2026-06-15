import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings as SettingsIcon, Bot, Cloud, Shield, Info, Bell,
  Eye, EyeOff, Save, RefreshCw, CheckCircle, XCircle,
  Cpu, Database, Clock, Server, Key, AlertTriangle, Users,
  Globe, Zap, ChevronRight,
} from 'lucide-react';
import { Card, SectionHeader, Skeleton, Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { parseApiError, timeAgo } from '../lib/utils';
import api from '../lib/api';

// ── Reusable components ────────────────────────────────────────────────────────
function SettingSection({ icon, title, description, children, danger }: {
  icon: React.ReactNode; title: string; description?: string;
  children: React.ReactNode; danger?: boolean;
}) {
  return (
    <Card style={{ borderColor: danger ? 'var(--accent-red)' : undefined }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 'var(--r-md)', flexShrink: 0,
          background: danger ? 'var(--accent-red-dim)' : 'var(--accent-blue-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: danger ? 'var(--accent-red)' : 'var(--accent-blue)',
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: danger ? 'var(--accent-red)' : 'var(--text-primary)' }}>{title}</div>
          {description && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{description}</div>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="settings-item">
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {description && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>}
      </div>
      <label className="toggle-switch">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
  );
}

function MaskedInput({ settingKey, label, placeholder, hint, local, update }: {
  settingKey: string; label: string; placeholder: string;
  hint?: string; local: Record<string, string>; update: (k: string, v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const isMasked = local[settingKey] === '***masked***';
  return (
    <Input
      label={label}
      type={show ? 'text' : 'password'}
      value={isMasked ? '' : (local[settingKey] || '')}
      onChange={e => update(settingKey, e.target.value)}
      placeholder={isMasked ? '••••• (leave empty to keep current)' : placeholder}
      hint={hint}
      iconRight={
        <button type="button" onClick={() => setShow(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      }
    />
  );
}

function ProviderCard({ name, icon, color, keys, local, update, onSave, onTest, testing, testResult }: {
  name: string; icon: string; color: string;
  keys: Array<{ key: string; label: string; placeholder: string; masked?: boolean }>;
  local: Record<string, string>; update: (k: string, v: string) => void;
  onSave: () => void; onTest?: () => void; testing?: boolean;
  testResult?: 'success' | 'fail' | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasAnyValue = keys.some(k => local[k.key] && local[k.key] !== '***masked***' || local[k.key] === '***masked***');

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
      overflow: 'hidden', transition: 'border-color 200ms',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 18px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
        }}
      >
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{name}</div>
          <div style={{ fontSize: '11px', marginTop: 2, color: hasAnyValue ? 'var(--accent-green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasAnyValue ? <><CheckCircle size={10} />Credentials configured</> : <><XCircle size={10} />Not configured — demo mode active</>}
          </div>
        </div>
        {testResult === 'success' && <CheckCircle size={16} color="var(--accent-green)" />}
        {testResult === 'fail' && <XCircle size={16} color="var(--accent-red)" />}
        <ChevronRight size={14} color="var(--text-muted)"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 200ms' }} />
      </button>

      {expanded && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border-muted)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            {keys.map(k => k.masked
              ? <MaskedInput key={k.key} settingKey={k.key} label={k.label} placeholder={k.placeholder} local={local} update={update} />
              : <Input key={k.key} label={k.label} value={local[k.key] || ''} onChange={e => update(k.key, e.target.value)} placeholder={k.placeholder} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button size="sm" variant="primary" icon={<Save size={12} />} onClick={onSave}>Save</Button>
            {onTest && (
              <Button size="sm" variant="secondary" loading={testing} onClick={onTest}>Test Connection</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type TabId = 'general' | 'ai' | 'cloud' | 'security' | 'team' | 'about' | 'mail';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'general',  label: 'General',  icon: <SettingsIcon size={14} /> },
  { id: 'ai',       label: 'AI',       icon: <Bot size={14} /> },
  { id: 'cloud',    label: 'Cloud',    icon: <Cloud size={14} /> },
  { id: 'security', label: 'Security', icon: <Shield size={14} /> },
  { id: 'team',     label: 'Team',     icon: <Users size={14} /> },
  { id: 'about',    label: 'About',    icon: <Info size={14} /> },
  { id: 'mail',     label: 'Email',    icon: <Bell size={14} /> },
];

export function AIAnomalies() {
  const { success, error: showError } = useToast();
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  const fetch = useCallback(async () => {
    try { const { data } = await api.get('/api/ai/anomalies'); setAnomalies(data); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); const id = setInterval(fetch, 15000); return () => clearInterval(id); }, [fetch]);

  const handleResolve = async (id: string) => {
    setResolving(id);
    try {
      await api.put(`/api/ai/anomalies/${id}/resolve`);
      setAnomalies(prev => prev.filter(a => a.id !== id));
      success('Anomaly resolved');
    } catch (err) { showError(parseApiError(err)); }
    finally { setResolving(null); }
  };

  const filtered = filter === 'all' ? anomalies : anomalies.filter(a => a.severity === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader title="Anomalies" subtitle={`${anomalies.length} active`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<RefreshCw size={13} />} size="sm" onClick={fetch}>Refresh</Button>
            {anomalies.length > 0 && (
              <Button variant="success" size="sm" icon={<CheckCircle size={13} />}
                onClick={() => anomalies.forEach(a => handleResolve(a.id))}>
                Resolve All
              </Button>
            )}
          </div>
        }
      />
      <div style={{ display: 'flex', gap: 6 }}>
        {['all', 'critical', 'warning'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '4px 12px', borderRadius: 'var(--r-pill)',
              background: filter === f ? 'var(--gradient-brand)' : 'var(--bg-card)',
              color: filter === f ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${filter === f ? 'transparent' : 'var(--border)'}`,
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              textTransform: 'capitalize',
            }}>{f === 'all' ? `All (${anomalies.length})` : f}
          </button>
        ))}
      </div>
      {loading ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[1, 2].map(i => <Card key={i}><div className="skeleton" style={{ height: 60 }} /></Card>)}</div>
        : filtered.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: 48 }}>
            <CheckCircle size={40} color="var(--accent-green)" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>All systems healthy</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 4 }}>No active anomalies detected</div>
          </Card>
        ) : filtered.map(a => (
          <Card key={a.id} style={{ borderLeft: `3px solid ${a.severity === 'critical' ? 'var(--accent-red)' : 'var(--accent-orange)'}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <AlertTriangle size={18} color={a.severity === 'critical' ? 'var(--accent-red)' : 'var(--accent-orange)'} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>{a.deployment_name}</span>
                    <Badge variant="severity" value={a.severity}>{a.severity}</Badge>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{a.type}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{a.message}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>Detected {timeAgo(a.created_at)}</div>
                </div>
              </div>
              <Button size="sm" variant="success" icon={<CheckCircle size={12} />}
                loading={resolving === a.id} onClick={() => handleResolve(a.id)}>Resolve</Button>
            </div>
          </Card>
        ))
      }
    </div>
  );
}

export function Team() {
  const { user } = useAuth();
  const { success, error: showError } = useToast();
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState('developer');
  const [inviteExpiry, setInviteExpiry] = useState('48');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [generated, setGenerated] = useState<any>(null);
  const [inviteEmail, setInviteEmail] = useState('');

  const fetch = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([api.get('/api/auth/users'), api.get('/api/invites')]);
      setMembers(m.data); setInvites(i.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleGenerate = async () => {
    setInviteLoading(true);
    try {
      const { data } = await api.post('/api/invites', {
        role: inviteRole,
        expiryHours: parseInt(inviteExpiry),
        email: inviteEmail || undefined,
      });
      setGenerated(data);
      fetch();
    } catch (err) { showError(parseApiError(err)); }
    finally { setInviteLoading(false); }
  };

  const ROLE_COLORS: Record<string, string> = { admin: 'var(--accent-purple)', developer: 'var(--accent-blue)', viewer: 'var(--text-muted)' };
  const gradients = ['linear-gradient(135deg,#6366f1,#a855f7)', 'linear-gradient(135deg,#22d3ee,#6366f1)', 'linear-gradient(135deg,#10b981,#22d3ee)', 'linear-gradient(135deg,#f59e0b,#ef4444)', 'linear-gradient(135deg,#ec4899,#a855f7)'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader title="Team" subtitle={`${members.length} members`}
        action={<Button variant="primary" onClick={() => { setGenerated(null); setInviteOpen(true); }}>+ Invite Member</Button>} />

      {inviteOpen && (
        <Card style={{ borderColor: 'var(--accent-blue)', animation: 'float-up 200ms ease-out' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: 16, display:'flex', alignItems:'center', gap:8 }}>
            {generated ? <><CheckCircle size={16} color="var(--accent-green)" />Invite Ready</> : '+ Invite Team Member'}
          </div>
          {!generated ? (
            <div style={{ display: 'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display: 'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <Select label="Role" value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  options={[
                    { value: 'viewer',    label: '👁 Viewer — read only' },
                    { value: 'developer', label: '⚙️ Developer — manage deployments' },
                    { value: 'admin',     label: '🔑 Admin — full access' },
                  ]} />
                <Select label="Expires in" value={inviteExpiry} onChange={e => setInviteExpiry(e.target.value)}
                  options={[{ value: '24', label: '24 hours' }, { value: '48', label: '48 hours' }, { value: '168', label: '7 days' }]} />
              </div>
              <Input label="Send to Email (optional)"
                type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                hint="Leave empty to just generate a code you can share manually" />
              <div style={{ padding:'10px 14px', background:'var(--bg-elevated)', borderRadius:'var(--r-md)', border:'1px solid var(--border)', fontSize:'12px', color:'var(--text-muted)', lineHeight:1.6 }}>
                <strong style={{color:'var(--text-secondary)'}}>Role permissions:</strong>
                <div style={{marginTop:6, display:'flex', flexDirection:'column', gap:4}}>
                  <div>👁 <strong>Viewer</strong> — read-only access to all pages, no actions</div>
                  <div>⚙️ <strong>Developer</strong> — can create/manage deployments, containers, GitHub</div>
                  <div>🔑 <strong>Admin</strong> — full access including team management and settings</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" loading={inviteLoading} onClick={handleGenerate}
                  icon={inviteEmail ? <span>📧</span> : undefined}>
                  {inviteEmail ? 'Generate & Send Email' : 'Generate Code'}
                </Button>
                <Button variant="ghost" onClick={() => { setInviteOpen(false); setInviteEmail(''); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {generated.emailSent && (
                <div style={{padding:'10px 14px', background:'var(--accent-green-dim)', border:'1px solid rgba(16,185,129,.3)', borderRadius:'var(--r-md)', fontSize:'12px', color:'var(--accent-green)', display:'flex', alignItems:'center', gap:8}}>
                  <CheckCircle size={14}/> Email sent to <strong>{inviteEmail}</strong>
                </div>
              )}
              {generated.emailError && (
                <div style={{padding:'10px 14px', background:'var(--accent-orange-dim)', border:'1px solid rgba(245,158,11,.3)', borderRadius:'var(--r-md)', fontSize:'12px', color:'var(--accent-orange)'}}>
                  ⚠ Email failed: {generated.emailError} — share the code manually below.
                </div>
              )}
              <div>
                <div style={{fontSize:'12px', color:'var(--text-secondary)', marginBottom:6, fontWeight:600}}>INVITE CODE</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <code style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', fontSize: '18px', fontFamily: 'var(--font-mono)', letterSpacing: '.12em', color: 'var(--text-primary)', border: '1px solid var(--border-glow)', textAlign:'center' }}>
                    {generated.code}
                  </code>
                  <Button icon={<CheckCircle size={13} />} onClick={() => { navigator.clipboard.writeText(generated.code); success('Copied!'); }}>
                    Copy
                  </Button>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap:'wrap' }}>
                <span>Role: <strong style={{ color: ROLE_COLORS[inviteRole], textTransform: 'capitalize' }}>{inviteRole}</strong></span>
                <span>Expires: {timeAgo(generated.expires_at)}</span>
              </div>
              <div style={{display:'flex', gap:8}}>
                <Button variant="ghost" size="sm" onClick={() => { setGenerated(null); setInviteEmail(''); }}>Generate Another</Button>
                <Button variant="ghost" size="sm" onClick={() => { setInviteOpen(false); setGenerated(null); setInviteEmail(''); }}>Done</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Members table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700 }}>Members</div>
        {loading ? <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 48 }} /></div> : (
          members.map((m, i) => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
              borderBottom: i < members.length - 1 ? '1px solid var(--border-muted)' : 'none',
            }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: gradients[m.username.charCodeAt(0) % 5], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {m.username.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.username}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.email}</div>
              </div>
              {m.id === user?.id ? (
                <Badge variant="role" value={m.role}>{m.role}</Badge>
              ) : (
                <select value={m.role}
                  onChange={async e => {
                    await api.put(`/api/auth/users/${m.id}/role`, { role: e.target.value });
                    success('Role updated'); fetch();
                  }}
                  style={{ background: ROLE_COLORS[m.role] + '20', color: ROLE_COLORS[m.role], border: `1px solid ${ROLE_COLORS[m.role]}40`, borderRadius: 'var(--r-pill)', padding: '3px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize', outline: 'none' }}>
                  {['admin', 'developer', 'viewer'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: 80, textAlign: 'right' }}>
                {m.last_login ? timeAgo(m.last_login) : 'Never'}
              </div>
              {m.id !== user?.id && (
                <Button size="sm" variant="danger"
                  onClick={async () => { if (confirm(`Remove ${m.username}?`)) { await api.delete(`/api/auth/users/${m.id}`); success('Removed'); fetch(); } }}>
                  Remove
                </Button>
              )}
            </div>
          ))
        )}
      </Card>

      {/* Active invites */}
      {invites.filter((i: any) => !i.used_by).length > 0 && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700 }}>Pending Invites</div>
          {invites.filter((i: any) => !i.used_by).map((inv: any, idx: number) => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: idx < invites.length - 1 ? '1px solid var(--border-muted)' : 'none' }}>
              <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '13px', letterSpacing: '.06em', color: 'var(--text-primary)' }}>{inv.code}</code>
              <Badge variant="role" value={inv.role}>{inv.role}</Badge>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Expires {timeAgo(inv.expires_at)}</span>
              <Button size="sm" variant="danger" onClick={async () => { await api.delete(`/api/invites/${inv.id}`); success('Revoked'); fetch(); }}>Revoke</Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { success, error: showError } = useToast();
  const [tab, setTab] = useState<TabId>('general');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [local, setLocal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [testingGroq, setTestingGroq] = useState(false);
  const [groqTestResult, setGroqTestResult] = useState<'success' | 'fail' | null>(null);

  useEffect(() => {
    api.get('/api/settings').then(r => { setSettings(r.data); setLocal(r.data); }).finally(() => setLoading(false));
    api.get('/api/health').then(r => setHealth(r.data)).catch(() => {});
  }, []);

  const update = (k: string, v: string) => setLocal(p => ({ ...p, [k]: v }));

  const handleSave = async (subset?: Record<string, string>) => {
    setSaving(true);
    try {
      await api.put('/api/settings', subset || local);
      success('Settings saved');
      const { data } = await api.get('/api/settings');
      setSettings(data); setLocal(data);
    } catch (err) { showError(parseApiError(err)); }
    finally { setSaving(false); }
  };

  const handleTestGroq = async () => {
    setTestingGroq(true); setGroqTestResult(null);
    try {
      const { data } = await api.get('/api/ai/model');
      if (data.hasKey) { success(`Connected ✓ — model: ${data.model}`); setGroqTestResult('success'); }
      else { showError('No API key configured'); setGroqTestResult('fail'); }
    } catch { showError('Connection failed'); setGroqTestResult('fail'); }
    finally { setTestingGroq(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader title="Settings" subtitle="Platform configuration and credentials"
        action={tab !== 'about' && tab !== 'team' ? (
          <Button variant="primary" icon={<Save size={13} />} loading={saving} onClick={() => handleSave()}>
            Save All
          </Button>
        ) : undefined}
      />

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 'var(--r-pill)',
              background: tab === t.id ? 'var(--gradient-brand)' : 'var(--bg-card)',
              color: tab === t.id ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${tab === t.id ? 'transparent' : 'var(--border)'}`,
              fontSize: '12px', fontWeight: tab === t.id ? 700 : 500,
              cursor: 'pointer', transition: 'all 150ms', fontFamily: 'var(--font-sans)',
              boxShadow: tab === t.id ? 'var(--glow-blue)' : 'none',
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 720 }}>

        {/* ── General ────────────────────────────────────────────────────────── */}
        {tab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SettingSection icon={<Globe size={18} />} title="Platform" description="Basic platform configuration">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Input label="Platform Name" value={local.platform_name || ''} onChange={e => update('platform_name', e.target.value)} hint="Shown in the browser tab and emails" />
                <Input label="CORS Origins" value={local.cors_origins || ''} onChange={e => update('cors_origins', e.target.value)} hint="Comma-separated list of allowed origins for API access" />
              </div>
            </SettingSection>
          </div>
        )}

        {/* ── AI ─────────────────────────────────────────────────────────────── */}
        {tab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SettingSection icon={<Bot size={18} />} title="Groq AI" description="Power the AI Assistant with a free Groq API key — get one at console.groq.com">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <MaskedInput settingKey="groq_api_key" label="API Key" placeholder="gsk_..." local={local} update={update}
                  hint="Your Groq API key. Free tier available at console.groq.com" />
                <Select label="Model" value={local.groq_model || 'llama3-70b-8192'} onChange={e => update('groq_model', e.target.value)}
                  options={[
                    { value: 'llama-3.3-70b-versatile', label: 'LLaMA 3.3 70B Versatile — Best quality (recommended)' },
                    { value: 'llama-3.1-8b-instant', label: 'LLaMA 3.1 8B Instant — Fastest' },
                    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8×7B — Long context (32k tokens)' },
                    { value: 'gemma2-9b-it', label: 'Gemma 2 9B — Lightweight' },
                    { value: 'llama-3.1-70b-versatile', label: 'LLaMA 3.1 70B Versatile — High capability' },
                  ]} />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Button variant="secondary" loading={testingGroq} onClick={handleTestGroq} icon={groqTestResult === 'success' ? <CheckCircle size={13} color="var(--accent-green)" /> : groqTestResult === 'fail' ? <XCircle size={13} color="var(--accent-red)" /> : undefined}>
                    Test Connection
                  </Button>
                  {groqTestResult === 'success' && <span style={{ fontSize: '12px', color: 'var(--accent-green)' }}>Connected!</span>}
                  {groqTestResult === 'fail' && <span style={{ fontSize: '12px', color: 'var(--accent-red)' }}>Connection failed</span>}
                </div>
              </div>
            </SettingSection>

            <SettingSection icon={<AlertTriangle size={18} />} title="Anomaly Detection" description="Automatically detect infrastructure issues and create alerts">
              <ToggleRow label="Enable anomaly detection"
                description="Monitor CPU and memory thresholds across all running deployments"
                checked={local.anomaly_detection === 'true'}
                onChange={v => update('anomaly_detection', v ? 'true' : 'false')} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
                <Input label="CPU Alert Threshold (%)" type="number" value={local.cpu_threshold || '90'} onChange={e => update('cpu_threshold', e.target.value)} hint="Alert when CPU exceeds this %" />
                <Input label="Memory Alert Threshold (MB)" type="number" value={local.memory_threshold_mb || '900'} onChange={e => update('memory_threshold_mb', e.target.value)} hint="Alert when memory exceeds this MB" />
              </div>
            </SettingSection>
          </div>
        )}

        {/* ── Cloud ──────────────────────────────────────────────────────────── */}
        {tab === 'cloud' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '12px 16px', background: 'var(--accent-blue-dim)', border: '1px solid var(--border-glow)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--accent-blue-2)' }}>All credentials are optional.</strong>{' '}
              Cloud deployments work in demo mode without any credentials — add real keys to deploy to production.
            </div>

            {[
              {
                name: 'Amazon Web Services', icon: '☁️', color: '#FF9900',
                keys: [
                  { key: 'aws_access_key_id', label: 'Access Key ID', placeholder: 'AKIA...', masked: true },
                  { key: 'aws_secret_access_key', label: 'Secret Access Key', placeholder: 'your-secret-access-key', masked: true },
                  { key: 'aws_default_region', label: 'Default Region', placeholder: 'us-east-1' },
                ],
              },
              {
                name: 'Microsoft Azure', icon: '🔷', color: '#0078D4',
                keys: [
                  { key: 'azure_subscription_id', label: 'Subscription ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
                  { key: 'azure_client_id', label: 'Client ID (App Registration)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
                  { key: 'azure_client_secret', label: 'Client Secret', placeholder: 'your-secret-value', masked: true },
                  { key: 'azure_tenant_id', label: 'Tenant ID (Directory ID)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
                  { key: 'azure_resource_group', label: 'Resource Group', placeholder: 'podium-rg' },
                  { key: 'azure_location', label: 'Default Location', placeholder: 'eastus' },
                ],
              },
              {
                name: 'Vercel', icon: '▲', color: '#000000',
                keys: [
                  { key: 'vercel_api_token', label: 'API Token', placeholder: 'vercel_...', masked: true },
                  { key: 'vercel_team_id', label: 'Team ID (optional)', placeholder: 'team_...' },
                ],
              },
              {
                name: 'Render', icon: '🟣', color: '#46E3B7',
                keys: [
                  { key: 'render_api_key', label: 'API Key', placeholder: 'rnd_...', masked: true },
                  { key: 'render_owner_id', label: 'Owner ID', placeholder: 'usr_... or tea_...' },
                  { key: 'render_region', label: 'Default Region', placeholder: 'oregon' },
                ],
              },
              {
                name: 'Podium Self-Hosted', icon: '🏠', color: '#22c55e',
                keys: [
                  { key: 'selfhosted_domain', label: 'Local Domain', placeholder: 'localhost' },
                  { key: 'cloudflare_tunnel_id', label: 'Cloudflare Tunnel ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
                  { key: 'cloudflare_tunnel_token', label: 'Tunnel Token', placeholder: 'eyJ...', masked: true },
                  { key: 'cloudflare_tunnel_domain', label: 'Public Domain (via Tunnel)', placeholder: 'apps.yourdomain.com' },
                ],
              },
              {
                name: 'GitHub', icon: '🐙', color: '#333',
                keys: [
                  { key: 'github_token', label: 'Personal Access Token', placeholder: 'ghp_...', masked: true },
                ],
              },
            ].map(p => (
              <ProviderCard key={p.name} {...p} local={local} update={update}
                onSave={() => handleSave(Object.fromEntries(p.keys.map(k => [k.key, local[k.key] || ''])))} />
            ))}
          </div>
        )}

        {/* ── Security ───────────────────────────────────────────────────────── */}
        {tab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SettingSection icon={<Key size={18} />} title="JWT Configuration" description="Authentication token signing secrets">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <MaskedInput settingKey="jwt_secret" label="JWT Secret" placeholder="long-random-string..." local={local} update={update}
                  hint="Must be at least 32 characters. Changing this logs all users out." />
                <Input label="Session Expiry" value={local.jwt_expiry || '7d'} onChange={e => update('jwt_expiry', e.target.value)}
                  hint="Format: 7d, 24h, 30m. Default: 7d" />
              </div>
            </SettingSection>

            <SettingSection icon={<Shield size={18} />} title="Access Control" description="Rate limiting and security headers">
              <ToggleRow label="Helmet security headers" description="Add security headers to all API responses (recommended)"
                checked={local.helmet_enabled !== 'false'} onChange={v => update('helmet_enabled', v ? 'true' : 'false')} />
              <ToggleRow label="Request logging" description="Log all incoming HTTP requests to console"
                checked={local.request_logging !== 'false'} onChange={v => update('request_logging', v ? 'true' : 'false')} />
            </SettingSection>
          </div>
        )}

        {/* ── Team ──────────────────────────────────────────────────────────── */}
        {tab === 'team' && <Team />}

        {/* ── Email / SMTP ────────────────────────────────────────────────── */}
        {tab === 'mail' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <SettingSection icon={<Bell size={18}/>} title="SMTP Email" description="Configure your mail server to send invite emails to teammates.">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <Input label="SMTP Host" value={local.smtp_host||''} onChange={e=>update('smtp_host',e.target.value)} placeholder="smtp.gmail.com" />
                <Input label="SMTP Port" value={local.smtp_port||'587'} onChange={e=>update('smtp_port',e.target.value)} placeholder="587" />
                <Input label="Username / Email" value={local.smtp_user||''} onChange={e=>update('smtp_user',e.target.value)} placeholder="you@gmail.com" />
                <MaskedInput settingKey="smtp_pass" label="Password / App Password" placeholder="your-app-password" local={local} update={update} />
                <Input label="From Address" value={local.smtp_from||''} onChange={e=>update('smtp_from',e.target.value)} placeholder="Podium <noreply@yourapp.com>" />
                <Input label="App URL" value={local.app_url||''} onChange={e=>update('app_url',e.target.value)} placeholder="http://localhost:4000" hint="Used in invite email links" />
              </div>
              <div style={{marginTop:14, padding:'10px 14px', background:'var(--accent-blue-dim)', borderRadius:'var(--r-md)', border:'1px solid var(--border-glow)', fontSize:'12px', color:'var(--text-secondary)', lineHeight:1.6}}>
                <strong style={{color:'var(--accent-blue-2)'}}>Gmail tip:</strong> Use <code style={{fontFamily:'var(--font-mono)'}}>smtp.gmail.com</code> port <code style={{fontFamily:'var(--font-mono)'}}>587</code>, and generate an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" style={{color:'var(--accent-blue-2)'}}>App Password</a> instead of your Google account password.
              </div>
              <Button variant="secondary" style={{marginTop:12}} onClick={()=>handleSave({smtp_host:local.smtp_host,smtp_port:local.smtp_port,smtp_user:local.smtp_user,smtp_pass:local.smtp_pass,smtp_from:local.smtp_from,app_url:local.app_url})}>
                Save Email Settings
              </Button>
            </SettingSection>
          </div>
        )}

        {/* ── About ─────────────────────────────────────────────────────────── */}
        {tab === 'about' && health && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SettingSection icon={<Zap size={18} />} title="Podium v4.0.0" description="AIOps Desktop Platform for DevOps teams">
              {[
                { icon: <Server size={14} />, label: 'Node.js', value: health.nodeVersion },
                { icon: <Database size={14} />, label: 'Database', value: `${(health.dbSize / 1024).toFixed(1)} KB (SQLite)` },
                { icon: <Clock size={14} />, label: 'Uptime', value: health.uptimeHuman },
                { icon: <Cpu size={14} />, label: 'Memory', value: `${health.memory?.free} MB free / ${health.memory?.total} MB total` },
                { icon: <Users size={14} />, label: 'Users', value: health.userCount },
                { icon: <Globe size={14} />, label: 'Platform', value: health.platform },
              ].map(row => (
                <div key={row.label} className="settings-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {row.icon}{row.label}
                  </div>
                  <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{row.value}</span>
                </div>
              ))}
            </SettingSection>

            <SettingSection icon={<CheckCircle size={18} />} title="System Status" description="All services operational">
              {[
                { name: 'API Server', status: 'operational' },
                { name: 'Database', status: 'operational' },
                { name: 'Metrics Collection', status: 'operational' },
                { name: 'Anomaly Detection', status: local.anomaly_detection === 'true' ? 'operational' : 'disabled' },
              ].map(s => (
                <div key={s.name} className="settings-item">
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{s.name}</span>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '2px 10px',
                    borderRadius: 'var(--r-pill)', textTransform: 'capitalize',
                    background: s.status === 'operational' ? 'var(--accent-green-dim)' : 'var(--bg-elevated)',
                    color: s.status === 'operational' ? 'var(--accent-green)' : 'var(--text-muted)',
                  }}>
                    {s.status === 'operational' ? '● ' : '○ '}{s.status}
                  </span>
                </div>
              ))}
            </SettingSection>
          </div>
        )}
      </div>
    </div>
  );
}
