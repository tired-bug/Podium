import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle, Users, MoreHorizontal, Pencil, Send, UserX, Mail, Search, ArrowUp,
} from 'lucide-react';
import { Card, Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Select, Modal } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { parseApiError, timeAgo } from '../lib/utils';
import api from '../lib/api';

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

export default function Team() {
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
