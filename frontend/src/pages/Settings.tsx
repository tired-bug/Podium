import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings as SettingsIcon, Bot, Shield, Info, Bell,
  Eye, EyeOff, Save, RefreshCw, CheckCircle,
  Cpu, Database, Clock, Server, Key, Users,
  Globe, Zap, ChevronRight, Lock, Activity, BarChart2,
  ToggleLeft, ToggleRight,
} from 'lucide-react';
import { Card, SectionHeader, Skeleton, Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { parseApiError, timeAgo } from '../lib/utils';
import api from '../lib/api';

// ── Toggle ────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, accent = 'var(--accent-blue)' }: {
  checked: boolean; onChange: (v: boolean) => void; accent?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: checked ? accent : 'var(--bg-elevated)',
        position: 'relative', transition: 'background 200ms',
        boxShadow: checked ? `0 0 10px ${accent}55` : 'inset 0 0 0 1px var(--border)',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16,
        borderRadius: '50%', background: '#fff', transition: 'left 200ms',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

function ToggleRow({ label, description, checked, onChange, accent }: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; accent?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border-muted)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{description}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} accent={accent} />
    </div>
  );
}

// ── Masked Input ──────────────────────────────────────────────────────────

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

// ── Sidebar nav ───────────────────────────────────────────────────────────

type TabId = 'general' | 'ai' | 'security' | 'team' | 'about';

const TABS: { id: TabId; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'general',  label: 'General',   icon: <Globe size={15} />,       description: 'Platform basics' },
  { id: 'ai',       label: 'AI',        icon: <Bot size={15} />,         description: 'Model & provider' },
  { id: 'security', label: 'Security',  icon: <Lock size={15} />,        description: 'Auth & access control' },
  { id: 'team',     label: 'Team',      icon: <Users size={15} />,       description: 'Members & invites' },
  { id: 'about',    label: 'System',    icon: <Server size={15} />,      description: 'Health & status' },
];

function SettingsSidebar({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  return (
    <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {TABS.map(t => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 'var(--r-md)', border: `1px solid ${active ? 'var(--border-glow)' : 'transparent'}`,
              background: active ? 'linear-gradient(135deg,var(--accent-blue-dim),var(--accent-purple-dim))' : 'transparent',
              color: active ? 'var(--accent-blue-2)' : 'var(--text-secondary)',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
              transition: 'all 150ms', width: '100%',
            }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-glass-light)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
          >
            <span style={{ flexShrink: 0, display: 'flex', color: active ? 'var(--accent-blue-2)' : 'inherit' }}>{t.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: active ? 700 : 500 }}>{t.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{t.description}</div>
            </div>
            {active && <ChevronRight size={12} style={{ flexShrink: 0, opacity: 0.5 }} />}
          </button>
        );
      })}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────

function Section({ title, description, children, accent = 'var(--accent-blue)' }: {
  title: string; description?: string; children: React.ReactNode; accent?: string;
}) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
      <div style={{ height: 2, background: accent === 'var(--accent-blue)' ? 'linear-gradient(90deg,var(--accent-blue),var(--accent-purple))' : accent }} />
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
        {description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{description}</div>}
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  );
}

// ── Team ──────────────────────────────────────────────────────────────────

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
      const { data } = await api.post('/api/invites', { role: inviteRole, expiryHours: parseInt(inviteExpiry), email: inviteEmail || undefined });
      setGenerated(data); fetch();
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
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            {generated ? <><CheckCircle size={16} color="var(--accent-green)" />Invite Ready</> : '+ Invite Team Member'}
          </div>
          {!generated ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Select label="Role" value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  options={[{ value: 'viewer', label: '👁 Viewer — read only' }, { value: 'developer', label: '⚙️ Developer — manage deployments' }, { value: 'admin', label: '🔑 Admin — full access' }]} />
                <Select label="Expires in" value={inviteExpiry} onChange={e => setInviteExpiry(e.target.value)}
                  options={[{ value: '24', label: '24 hours' }, { value: '48', label: '48 hours' }, { value: '168', label: '7 days' }]} />
              </div>
              <Input label="Send to Email (optional)" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com" hint="Leave empty to generate a code to share manually" />
              <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Role permissions:</strong>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>👁 <strong>Viewer</strong> — read-only access to all pages, no actions</div>
                  <div>⚙️ <strong>Developer</strong> — can create/manage deployments, GitHub</div>
                  <div>🔑 <strong>Admin</strong> — full access including team management and settings</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" loading={inviteLoading} onClick={handleGenerate} icon={inviteEmail ? <span>📧</span> : undefined}>
                  {inviteEmail ? 'Generate & Send Email' : 'Generate Code'}
                </Button>
                <Button variant="ghost" onClick={() => { setInviteOpen(false); setInviteEmail(''); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {generated.emailSent && (
                <div style={{ padding: '10px 14px', background: 'var(--accent-green-dim)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={14} /> Email sent to <strong>{inviteEmail}</strong>
                </div>
              )}
              {generated.emailError && (
                <div style={{ padding: '10px 14px', background: 'var(--accent-orange-dim)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--accent-orange)' }}>
                  ⚠ Email failed: {generated.emailError} — share the code manually below.
                </div>
              )}
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>INVITE CODE</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <code style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', fontSize: '18px', fontFamily: 'var(--font-mono)', letterSpacing: '.12em', color: 'var(--text-primary)', border: '1px solid var(--border-glow)', textAlign: 'center' }}>
                    {generated.code}
                  </code>
                  <Button icon={<CheckCircle size={13} />} onClick={() => { navigator.clipboard.writeText(generated.code); success('Copied!'); }}>Copy</Button>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>Role: <strong style={{ color: ROLE_COLORS[inviteRole], textTransform: 'capitalize' }}>{inviteRole}</strong></span>
                <span>Expires: {timeAgo(generated.expires_at)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" size="sm" onClick={() => { setGenerated(null); setInviteEmail(''); }}>Generate Another</Button>
                <Button variant="ghost" size="sm" onClick={() => { setInviteOpen(false); setGenerated(null); setInviteEmail(''); }}>Done</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700 }}>Members</div>
        {loading ? <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 48 }} /></div> : (
          members.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < members.length - 1 ? '1px solid var(--border-muted)' : 'none' }}>
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
                  onChange={async e => { await api.put(`/api/auth/users/${m.id}/role`, { role: e.target.value }); success('Role updated'); fetch(); }}
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

// ── Main Settings Page ────────────────────────────────────────────────────

export function SettingsPage() {
  const { success, error: showError } = useToast();
  const [tab, setTab] = useState<TabId>('general');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [local, setLocal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<any>(null);

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

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
    </div>
  );

  const showSave = tab !== 'about' && tab !== 'team';
  const currentTab = TABS.find(t => t.id === tab)!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 'var(--r-lg)', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glow-blue)' }}>
            <SettingsIcon size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-.01em' }}>Settings</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Platform configuration and credentials</p>
          </div>
        </div>
        {showSave && (
          <Button variant="primary" icon={<Save size={13} />} loading={saving} onClick={() => handleSave()}>
            Save changes
          </Button>
        )}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Sidebar */}
        <SettingsSidebar tab={tab} setTab={setTab} />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>Settings</span>
            <ChevronRight size={11} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currentTab.label}</span>
          </div>

          {/* ── General ──────────────────────────────────────────────── */}
          {tab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Section title="Platform" description="Basic configuration shown in UI and emails">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Input label="Platform Name" value={local.platform_name || ''} onChange={e => update('platform_name', e.target.value)} hint="Shown in the browser tab and emails" />
                  <Input label="CORS Origins" value={local.cors_origins || ''} onChange={e => update('cors_origins', e.target.value)} hint="Comma-separated list of allowed origins for API access" />
                </div>
              </Section>
            </div>
          )}

          {/* ── AI ───────────────────────────────────────────────────── */}
          {tab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', background: 'rgba(99,102,241,0.08)', border: '1px solid var(--border-glow)', borderRadius: 'var(--r-lg)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 'var(--r-md)', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={15} color="var(--accent-blue-2)" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>AI features are active</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    AI features are powered by an API key configured as a server environment variable (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 3 }}>GROQ_API_KEY</code>). It is not visible or editable here for security reasons.
                  </div>
                </div>
              </div>

              <Section title="Model" description="Which AI provider and model Podium's AI tools call" accent="linear-gradient(90deg,#6366f1,#a855f7)">
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Root cause analysis, incident reports, and the AI assistant chat run on <strong style={{ color: 'var(--text-primary)' }}>Groq</strong>'s free tier
                  (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 3 }}>openai/gpt-oss-120b</code>).
                  Change the model via the <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 3 }}>AI_MODEL</code> env var on the server.
                </div>
              </Section>
            </div>
          )}

          {/* ── Security ─────────────────────────────────────────────── */}
          {tab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Section title="JWT Configuration" description="Authentication token signing and session duration" accent="linear-gradient(90deg,#ef4444,#a855f7)">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <MaskedInput settingKey="jwt_secret" label="JWT Secret" placeholder="long-random-string…" local={local} update={update}
                    hint="Must be at least 32 characters. Changing this will log all users out." />
                  <Input label="Session Expiry" value={local.jwt_expiry || '7d'} onChange={e => update('jwt_expiry', e.target.value)}
                    hint="Format: 7d, 24h, 30m. Default: 7d" />
                </div>
              </Section>

              <Section title="Access Control" description="Security headers and request logging">
                <div>
                  <ToggleRow
                    label="Helmet security headers"
                    description="Add security headers to all API responses (strongly recommended for production)"
                    checked={local.helmet_enabled !== 'false'}
                    onChange={v => update('helmet_enabled', v ? 'true' : 'false')}
                    accent="#10b981"
                  />
                  <ToggleRow
                    label="Request logging"
                    description="Log all incoming HTTP requests to console for debugging"
                    checked={local.request_logging !== 'false'}
                    onChange={v => update('request_logging', v ? 'true' : 'false')}
                    accent="#6366f1"
                  />
                </div>
              </Section>
            </div>
          )}

          {/* ── Team ─────────────────────────────────────────────────── */}
          {tab === 'team' && <Team />}

          {/* ── System ───────────────────────────────────────────────── */}
          {tab === 'about' && health && (() => {
              const runtimeRows: { icon: React.ReactNode; label: string; value: any }[] = [
                { icon: <Server size={13} />, label: 'Node.js', value: health.nodeVersion },
                { icon: <Database size={13} />, label: 'Database', value: `${(health.dbSize / 1024).toFixed(1)} KB (SQLite)` },
                { icon: <Clock size={13} />, label: 'Uptime', value: health.uptimeHuman },
                { icon: <Cpu size={13} />, label: 'Memory', value: `${health.memory?.free} MB free / ${health.memory?.total} MB total` },
                { icon: <Users size={13} />, label: 'Users', value: health.userCount },
                { icon: <Globe size={13} />, label: 'Platform', value: health.platform },
              ];
              const serviceRows: { name: string; status: string; icon: React.ReactNode }[] = [
                { name: 'API Server', status: 'operational', icon: <Activity size={13} /> },
                { name: 'Database', status: 'operational', icon: <Database size={13} /> },
                { name: 'Metrics Collection', status: 'operational', icon: <BarChart2 size={13} /> },
                { name: 'AI (Groq)', status: 'operational', icon: <Bot size={13} /> },
              ];
              return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Version badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#6366f1,#a855f7,#22d3ee)' }} />
                <div style={{ width: 44, height: 44, borderRadius: 'var(--r-lg)', background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glow-blue)' }}>
                  <Zap size={20} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Podium v4.0.0</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>AIOps Platform for DevOps teams</div>
                </div>
                <div style={{ marginLeft: 'auto', padding: '4px 12px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  All systems operational
                </div>
              </div>

              <Section title="Runtime Information" description="Server environment details">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {runtimeRows.map((row, i, arr) => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-muted)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {row.icon}{row.label}
                      </div>
                      <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Service Status" description="All subsystems and their current state">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {serviceRows.map((s, i, arr) => (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-muted)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                        {s.icon}{s.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 'var(--r-pill)', background: s.status === 'operational' ? 'rgba(16,185,129,0.1)' : 'var(--bg-elevated)', border: `1px solid ${s.status === 'operational' ? 'rgba(16,185,129,0.25)' : 'var(--border)'}` }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.status === 'operational' ? '#10b981' : 'var(--text-muted)', display: 'inline-block', animation: s.status === 'operational' ? 'pulse-glow 2s infinite' : 'none' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.status === 'operational' ? '#10b981' : 'var(--text-muted)', textTransform: 'capitalize' }}>{s.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )})()}
        </div>
      </div>
    </div>
  );
}
