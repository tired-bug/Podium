import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Bell, ChevronDown, LogOut, User, Trash2, ExternalLink, X, Circle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useProfile } from '../../contexts/ProfileContext';
import { timeAgo } from '../../lib/utils';
import api from '../../lib/api';

const GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#a855f7)',
  'linear-gradient(135deg,#22d3ee,#6366f1)',
  'linear-gradient(135deg,#30d158,#22d3ee)',
  'linear-gradient(135deg,#ff9f0a,#ff453a)',
  'linear-gradient(135deg,#ec4899,#a855f7)',
  'linear-gradient(135deg,#5ac8fa,#30d158)',
];

export function Topbar() {
  const { user, logout }        = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const { avatar, displayName, activityStatus, setActivityStatus, profile } = useProfile();
  const navigate                = useNavigate();

  const [menuOpen,    setMenuOpen]    = useState(false);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifs,      setNotifs]      = useState<any[]>([]);
  const [unread,      setUnread]      = useState(0);

  const menuRef  = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(async () => {
    try {
      const { data } = await api.get('/api/notifications?limit=20');
      setNotifs(data.notifications || []);
      setUnread(data.unreadCount   || 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifs();
    const id = setInterval(fetchNotifs, 10_000);
    return () => clearInterval(id);
  }, [fetchNotifs]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current  && !menuRef.current.contains(e.target as Node))  setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, []);

  const markAllRead = async () => {
    await api.put('/api/notifications/read-all');
    setNotifs(n => n.map(x => ({ ...x, read: 1 })));
    setUnread(0);
  };

  const markRead = async (id: string) => {
    await api.put(`/api/notifications/${id}/read`);
    setNotifs(n => n.map(x => x.id === id ? { ...x, read: 1 } : x));
    setUnread(c => Math.max(0, c - 1));
  };

  const clearRead = async () => {
    await api.delete('/api/notifications');
    setNotifs(n => n.filter(x => !x.read));
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const gradIdx  = (user?.username?.charCodeAt(0) || 0) % GRADIENTS.length;
  const initials = (displayName || user?.username || '??').slice(0, 2).toUpperCase();
  const label    = displayName || user?.username || '';

  const IconBtn = ({ label: lbl, onClick, children, badge }: {
    label: string; onClick: () => void; children: React.ReactNode; badge?: number;
  }) => {
    const [hov, setHov] = useState(false);
    return (
      <button aria-label={lbl} onClick={onClick}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          width: 32, height: 32, borderRadius: 'var(--r-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hov ? 'var(--bg-glass-light)' : 'transparent',
          border: `1px solid ${hov ? 'var(--border)' : 'transparent'}`,
          cursor: 'pointer', color: hov ? 'var(--text-primary)' : 'var(--text-secondary)',
          transition: 'all 120ms', position: 'relative',
        }}>
        {children}
        {badge != null && badge > 0 && (
          <span className="notif-badge">{badge > 99 ? '99+' : badge}</span>
        )}
      </button>
    );
  };

  const dropdownItem = (icon: React.ReactNode, lbl: string, action: () => void, danger = false) => (
    <button key={lbl} onClick={action}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '9px 14px', background: 'none', border: 'none',
        cursor: 'pointer', color: danger ? 'var(--accent-red)' : 'var(--text-secondary)',
        fontSize: '13px', textAlign: 'left', transition: 'background 100ms, color 100ms',
        fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger ? 'var(--accent-red-dim)' : 'var(--bg-glass-light)';
        if (!danger) e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'none';
        e.currentTarget.style.color = danger ? 'var(--accent-red)' : 'var(--text-secondary)';
      }}
    >
      {icon}{lbl}
    </button>
  );

  return (
    <header style={{
      height: 'var(--topbar-height)',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', gap: 6, flexShrink: 0,
      position: 'relative', zIndex: 50,
    }}>
      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconBtn label="Toggle theme" onClick={toggleTheme}>
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </IconBtn>

        {/* Notifications */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <IconBtn label="Notifications" badge={unread}
            onClick={() => { setNotifOpen(o => !o); if (!notifOpen) fetchNotifs(); }}>
            <Bell size={14} />
          </IconBtn>

          {notifOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 1000,
              width: 348, background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 'var(--r-xl)',
              boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
              animation: 'slide-down 140ms ease-out',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '-0.01em' }}>Notifications</span>
                  {unread > 0 && (
                    <span style={{ background: 'var(--accent)', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--r-pill)' }}>
                      {unread}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {unread > 0 && (
                    <button onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-2)', fontSize: '11px', fontFamily: 'var(--font-sans)' }}>
                      Mark all read
                    </button>
                  )}
                  <button onClick={clearRead} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {notifs.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    All caught up
                  </div>
                ) : notifs.map(n => (
                  <div key={n.id}
                    onClick={() => { markRead(n.id); if (n.link) { navigate(n.link); setNotifOpen(false); } }}
                    style={{
                      display: 'flex', gap: 10, padding: '11px 14px',
                      borderBottom: '1px solid var(--border-muted)',
                      background: n.read ? 'transparent' : 'var(--accent-blue-dim)',
                      cursor: 'pointer', transition: 'background 100ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-glass-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'var(--accent-blue-dim)'}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{n.title}</span>
                        {!n.read && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                    </div>
                    {n.link && <ExternalLink size={10} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 3 }} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={menuRef} style={{ position: 'relative', marginLeft: 6 }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '4px 8px 4px 4px', borderRadius: 'var(--r-lg)',
              background: menuOpen ? 'var(--bg-glass-light)' : 'transparent',
              border: `1px solid ${menuOpen ? 'var(--border)' : 'transparent'}`,
              cursor: 'pointer', transition: 'all 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-glass-light)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            onMouseLeave={e => { if (!menuOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              background: avatar ? 'transparent' : GRADIENTS[gradIdx],
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: 700, color: '#fff',
            }}>
              {avatar
                ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials
              }
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                {label}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'capitalize', lineHeight: 1.2 }}>
                {user?.role}
              </span>
            </div>
            <ChevronDown size={10} color="var(--text-muted)"
              style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', flexShrink: 0 }} />
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 1000,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-xl)',
              minWidth: 200, overflow: 'hidden',
              animation: 'slide-down 140ms ease-out',
            }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-muted)', display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: avatar ? 'transparent' : GRADIENTS[gradIdx],
                  overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700, color: '#fff',
                }}>
                  {avatar
                    ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : initials
                  }
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.email}
                  </div>
                </div>
              </div>
              {dropdownItem(<User size={12} />, 'My Profile', () => { setProfileOpen(true); setMenuOpen(false); })}

              {/* Activity status switch — replaces the old Settings entry */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 14px', fontSize: '13px', color: 'var(--text-secondary)',
                fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Circle size={8} fill={activityStatus === 'active' ? '#30d158' : 'var(--text-muted)'}
                    color={activityStatus === 'active' ? '#30d158' : 'var(--text-muted)'} />
                  {activityStatus === 'active' ? 'Active' : 'Away'}
                </span>
                <button
                  aria-label="Toggle activity status"
                  onClick={() => setActivityStatus(activityStatus === 'active' ? 'away' : 'active')}
                  style={{
                    width: 34, height: 19, borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: activityStatus === 'active' ? '#30d158' : 'var(--bg-glass-light)',
                    position: 'relative', transition: 'background 150ms', padding: 0,
                    outline: activityStatus === 'active' ? 'none' : '1px solid var(--border)',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: activityStatus === 'active' ? 17 : 2,
                    width: 15, height: 15, borderRadius: '50%', background: '#fff',
                    transition: 'left 150ms', boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }} />
                </button>
              </div>

              <div style={{ borderTop: '1px solid var(--border-muted)' }}>
                {dropdownItem(<LogOut size={12} />, 'Sign out', handleLogout, true)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Profile popup */}
      {profileOpen && (
        <div
          onClick={() => setProfileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 340, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
              animation: 'slide-down 140ms ease-out',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 10px 0' }}>
              <button onClick={() => setProfileOpen(false)} aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 24px 24px', textAlign: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                background: avatar ? 'transparent' : GRADIENTS[gradIdx],
                overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: 14,
                position: 'relative',
              }}>
                {avatar ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                <span style={{
                  position: 'absolute', bottom: 1, right: 1, width: 13, height: 13, borderRadius: '50%',
                  background: activityStatus === 'active' ? '#30d158' : 'var(--text-muted)',
                  border: '2px solid var(--bg-elevated)',
                }} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{label}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>{user?.email}</div>
              <div style={{
                marginTop: 10, fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
                textTransform: 'capitalize', background: 'var(--bg-glass-light)',
                border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: '3px 10px',
              }}>
                {user?.role}
              </div>

              {(profile?.profile?.job_title || profile?.profile?.company) && (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: 12 }}>
                  {[profile?.profile?.job_title, profile?.profile?.company].filter(Boolean).join(' · ')}
                </div>
              )}
              {profile?.profile?.bio && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>{profile.profile.bio}</div>
              )}

              <button
                onClick={() => { navigate('/profile'); setProfileOpen(false); }}
                style={{
                  marginTop: 20, width: '100%', padding: '9px', borderRadius: 10,
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                View full profile
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
