import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Bell, ChevronDown, LogOut, User, Settings, Trash2, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useProfile } from '../../contexts/ProfileContext';
import { timeAgo } from '../../lib/utils';
import api from '../../lib/api';

const GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#a855f7)',
  'linear-gradient(135deg,#22d3ee,#6366f1)',
  'linear-gradient(135deg,#10b981,#22d3ee)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#ec4899,#a855f7)',
  'linear-gradient(135deg,#14b8a6,#10b981)',
];

const NOTIF_ICONS: Record<string, string> = {
  deployment: '🚀', anomaly: '⚠️', build: '🔨', team: '👤', cloud: '☁️', system: '⚡',
};

export function Topbar() {
  const { user, logout }        = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const { avatar, displayName } = useProfile();
  const navigate                = useNavigate();

  const [menuOpen,   setMenuOpen]   = useState(false);
  const [notifOpen,  setNotifOpen]  = useState(false);
  const [notifs,     setNotifs]     = useState<any[]>([]);
  const [unread,     setUnread]     = useState(0);

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

  // ── Icon button helper ────────────────────────────────────────────────────
  const IconBtn = ({ label: lbl, onClick, children, badge }: {
    label: string; onClick: () => void; children: React.ReactNode; badge?: number;
  }) => {
    const [hov, setHov] = useState(false);
    return (
      <button aria-label={lbl} onClick={onClick}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          width: 36, height: 36, borderRadius: 'var(--r-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hov ? 'var(--bg-glass-light)' : 'transparent',
          border: `1px solid ${hov ? 'var(--border)' : 'transparent'}`,
          cursor: 'pointer', color: hov ? 'var(--text-primary)' : 'var(--text-secondary)',
          transition: 'all 150ms', position: 'relative',
        }}>
        {children}
        {badge != null && badge > 0 && (
          <span className="notif-badge">{badge > 99 ? '99+' : badge}</span>
        )}
      </button>
    );
  };

  return (
    <header style={{
      height: 'var(--topbar-height)',
      background: 'var(--bg-glass)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', gap: 8, flexShrink: 0,
      position: 'relative', zIndex: 50,
    }}>
      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>

        {/* Theme */}
        <IconBtn label="Toggle theme" onClick={toggleTheme}>
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </IconBtn>

        {/* Notifications */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <IconBtn label="Notifications" badge={unread}
            onClick={() => { setNotifOpen(o => !o); if (!notifOpen) fetchNotifs(); }}>
            <Bell size={15} />
          </IconBtn>

          {notifOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 1000,
              width: 360, background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 'var(--r-xl)',
              boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
              animation: 'slide-down 150ms ease-out',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>Notifications</span>
                  {unread > 0 && (
                    <span style={{ background: 'var(--accent-blue)', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--r-pill)' }}>
                      {unread} new
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {unread > 0 && (
                    <button onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue-2)', fontSize: '11px', fontFamily: 'var(--font-sans)' }}>
                      Mark all read
                    </button>
                  )}
                  <button onClick={clearRead} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                {notifs.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    <Bell size={28} style={{ opacity: .3, display: 'block', margin: '0 auto 8px' }} />
                    All caught up!
                  </div>
                ) : notifs.map(n => (
                  <div key={n.id}
                    onClick={() => { markRead(n.id); if (n.link) { navigate(n.link); setNotifOpen(false); } }}
                    style={{
                      display: 'flex', gap: 12, padding: '12px 16px',
                      borderBottom: '1px solid var(--border-muted)',
                      background: n.read ? 'transparent' : 'var(--accent-blue-dim)',
                      cursor: 'pointer', transition: 'background 120ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-glass-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'var(--accent-blue-dim)'}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', flexShrink: 0, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                      {NOTIF_ICONS[n.type] || '📌'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</span>
                        {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-blue)', flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                    </div>
                    {n.link && <ExternalLink size={11} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 2 }} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={menuRef} style={{ position: 'relative', marginLeft: 4 }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 8px 4px 4px', borderRadius: 'var(--r-lg)',
              background: menuOpen ? 'var(--bg-glass-light)' : 'transparent',
              border: `1px solid ${menuOpen ? 'var(--border)' : 'transparent'}`,
              cursor: 'pointer', transition: 'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-glass-light)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            onMouseLeave={e => { if (!menuOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
          >
            {/* Avatar — real image or gradient initials */}
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: avatar ? 'transparent' : GRADIENTS[gradIdx],
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 2px var(--border-glow)',
              fontSize: '11px', fontWeight: 800, color: '#fff',
            }}>
              {avatar
                ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials
              }
            </div>

            {/* Name + role */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'capitalize', lineHeight: 1.2 }}>
                {user?.role}
              </span>
            </div>

            <ChevronDown size={11} color="var(--text-muted)"
              style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', flexShrink: 0 }} />
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 1000,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-xl)',
              minWidth: 210, overflow: 'hidden',
              animation: 'slide-down 150ms ease-out',
            }}>
              {/* Header with avatar */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-muted)', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: avatar ? 'transparent' : GRADIENTS[gradIdx],
                  overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 800, color: '#fff',
                  boxShadow: '0 0 0 2px var(--border-glow)',
                }}>
                  {avatar
                    ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : initials
                  }
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.email}
                  </div>
                </div>
              </div>

              {[
                { icon: <User size={13} />,     label: 'My Profile', action: () => { navigate('/profile');  setMenuOpen(false); } },
                { icon: <Settings size={13} />, label: 'Settings',   action: () => { navigate('/settings'); setMenuOpen(false); } },
              ].map(item => (
                <button key={item.label} onClick={item.action}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'left', transition: 'background 120ms', fontFamily: 'var(--font-sans)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-glass-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  {item.icon}{item.label}
                </button>
              ))}

              <div style={{ borderTop: '1px solid var(--border-muted)' }}>
                <button onClick={handleLogout}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', fontSize: '13px', textAlign: 'left', transition: 'background 120ms', fontFamily: 'var(--font-sans)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-red-dim)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <LogOut size={13} />Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
