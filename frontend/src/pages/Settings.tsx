import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings as SettingsIcon, Bot, Shield, Info, Bell,
  Eye, EyeOff, Save, RefreshCw, CheckCircle,
  Cpu, Database, Clock, Server, Key, Users,
  Globe, Zap, ChevronRight, Lock, Activity, BarChart2,
  ToggleLeft, ToggleRight, MoreHorizontal, Pencil, Send, UserX, Mail, Search, ArrowUp,
} from 'lucide-react';
import { Card, SectionHeader, Skeleton, Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Select, Modal } from '../components/ui/Modal';
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

// ── Team ("Manage users", Azure DevOps style) ───────────────────────────────

type TeamRow =
  | { kind: 'member'; id: string; username: string; email: string; role: string; last_login: string | null }
  | { kind: 'invite'; id: string; code: string; role: string; expires_at: string; email?: string };

function RowMenu({ items, onClose }: { items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20,
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-dropdown, 0 8px 24px rgba(0,0,0,.4))', minWidth: 190, overflow: 'hidden',
      animation: 'float-up 120ms ease-out both',
    }}>
      {items.map((it, i) => (
        <button
          key={i}
          onClick={() => { it.onClick(); onClose(); }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
            padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12.5, fontFamily: 'var(--font-sans)',
            color: it.danger ? 'var(--accent-red)' : 'var(--text-primary)',
            borderTop: i > 0 ? '1px solid var(--border-muted)' : 'none',
          }}
          onMouseEnter={e => e.currentTarget.style.background = it.danger ? 'var(--accent-red-dim)' : 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <span style={{ display: 'flex', flexShrink: 0, opacity: 0.85 }}>{it.icon}</span>
          {it.label}
        </button>
      ))}
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
  const [search, setSearch] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [roleEditFor, setRoleEditFor] = useState<any>(null);

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

  const resendInvite = async (inv: any) => {
    try {
      await api.post('/api/invites', { role: inv.role, expiryHours: 48, email: inv.email || undefined });
      await api.delete(`/api/invites/${inv.id}`);
      success('Invite resent');
      fetch();
    } catch (err) { showError(parseApiError(err)); }
  };

  const revokeInvite = async (id: string) => {
    try { await api.delete(`/api/invites/${id}`); success('Invite revoked'); fetch(); }
    catch (err) { showError(parseApiError(err)); }
  };

  const removeMember = async (m: any) => {
    if (!confirm(`Remove ${m.username} from the organization?`)) return;
    try { await api.delete(`/api/auth/users/${m.id}`); success('Removed'); fetch(); }
    catch (err) { showError(parseApiError(err)); }
  };

  const changeRole = async (memberId: string, role: string) => {
    try { await api.put(`/api/auth/users/${memberId}/role`, { role }); success('Access level updated'); fetch(); }
    catch (err) { showError(parseApiError(err)); }
  };

  const ROLE_COLORS: Record<string, string> = { admin: 'var(--accent-purple)', developer: 'var(--accent-blue)', viewer: 'var(--text-muted)' };
  const gradients = ['linear-gradient(135deg,#6366f1,#a855f7)', 'linear-gradient(135deg,#22d3ee,#6366f1)', 'linear-gradient(135deg,#10b981,#22d3ee)', 'linear-gradient(135deg,#f59e0b,#ef4444)', 'linear-gradient(135deg,#ec4899,#a855f7)'];

  const pendingInvites = invites.filter((i: any) => !i.used_by);

  const filteredMembers = members.filter(m =>
    !search || m.username.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  );
  const filteredInvites = pendingInvites.filter((i: any) =>
    !search || (i.email || '').toLowerCase().includes(search.toLowerCase()) || i.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Users size={20} color="var(--text-primary)" />
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-.01em' }}>Manage users</h1>
      </div>

      {/* Toolbar: tab + actions, à la Azure DevOps */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        <div style={{
          padding: '8px 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          borderBottom: '2px solid var(--accent-blue)', marginBottom: -1,
        }}>
          All users
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, paddingBottom: 8 }}>
          <button onClick={() => { setGenerated(null); setInviteOpen(true); }} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent-blue)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)', padding: 0,
          }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Add new users
          </button>
        </div>
      </div>

      {/* Search / filter row */}
      <div style={{ position: 'relative', maxWidth: 320 }}>
        <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Name"
          style={{
            width: '100%', padding: '7px 10px 7px 30px', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: 'var(--text-primary)',
            fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Invite panel */}
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

      {/* Users table — mirrors Azure DevOps "Manage users" list */}
      <Card style={{ padding: 0, overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Name</span>
          <ArrowUp size={11} color="var(--text-muted)" />
        </div>

        {loading ? (
          <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 48 }} /></div>
        ) : filteredMembers.length === 0 && filteredInvites.length === 0 ? (
          <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            No users match "{search}"
          </div>
        ) : (
          <>
            {filteredMembers.map((m, i) => {
              const isSelf = m.id === user?.id;
              const rowId = `member-${m.id}`;
              return (
                <div key={m.id} style={{
                  position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px',
                  borderBottom: (i < filteredMembers.length - 1 || filteredInvites.length > 0) ? '1px solid var(--border-muted)' : 'none',
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: gradients[m.username.charCodeAt(0) % 5], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {m.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.username}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.email}</div>
                  </div>
                  <Badge variant="role" value={m.role}>{m.role}</Badge>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: 76, textAlign: 'right' }}>
                    {m.last_login ? timeAgo(m.last_login) : 'Never'}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setOpenMenu(o => o === rowId ? null : rowId)}
                      disabled={isSelf}
                      style={{
                        width: 28, height: 28, borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'none', border: 'none', cursor: isSelf ? 'default' : 'pointer', color: isSelf ? 'var(--border)' : 'var(--text-muted)',
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {openMenu === rowId && (
                      <RowMenu
                        onClose={() => setOpenMenu(null)}
                        items={[
                          { label: 'Change access level', icon: <Pencil size={13} />, onClick: () => setRoleEditFor(m) },
                          { label: 'Remove from organization', icon: <UserX size={13} />, danger: true, onClick: () => removeMember(m) },
                        ]}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {filteredInvites.map((inv: any, idx: number) => {
              const rowId = `invite-${inv.id}`;
              return (
                <div key={inv.id} style={{
                  position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px',
                  borderBottom: idx < filteredInvites.length - 1 ? '1px solid var(--border-muted)' : 'none',
                  background: 'var(--bg-elevated)',
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px dashed var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-muted)' }}>
                    <Mail size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>{inv.email || 'Pending invite'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '.04em' }}>Code: {inv.code}</div>
                  </div>
                  <Badge variant="role" value={inv.role}>{inv.role}</Badge>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: 76, textAlign: 'right' }}>
                    Expires {timeAgo(inv.expires_at)}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setOpenMenu(o => o === rowId ? null : rowId)}
                      style={{ width: 28, height: 28, borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {openMenu === rowId && (
                      <RowMenu
                        onClose={() => setOpenMenu(null)}
                        items={[
                          { label: 'Resend invite', icon: <Send size={13} />, onClick: () => resendInvite(inv) },
                          { label: 'Revoke invite', icon: <UserX size={13} />, danger: true, onClick: () => revokeInvite(inv.id) },
                        ]}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </Card>

      {/* Change access level modal */}
      <Modal open={!!roleEditFor} onClose={() => setRoleEditFor(null)} title={roleEditFor ? `Change access level — ${roleEditFor.username}` : ''} width={420}
        footer={<Button variant="ghost" onClick={() => setRoleEditFor(null)}>Close</Button>}
      >
        {roleEditFor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['admin', 'developer', 'viewer'].map(r => (
              <button
                key={r}
                onClick={() => { changeRole(roleEditFor.id, r); setRoleEditFor((prev: any) => ({ ...prev, role: r })); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
                  background: roleEditFor.role === r ? 'var(--accent-blue-dim)' : 'var(--bg-elevated)',
                  border: `1px solid ${roleEditFor.role === r ? 'var(--accent-blue)' : 'var(--border)'}`,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: ROLE_COLORS[r], textTransform: 'capitalize' }}>{r}</span>
                {roleEditFor.role === r && <CheckCircle size={14} color="var(--accent-blue)" />}
              </button>
            ))}
          </div>
        )}
      </Modal>
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
