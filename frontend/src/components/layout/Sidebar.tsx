import React, { useState, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Rocket,
  Github, ScrollText, BarChart2, Bot, AlertTriangle, Users, Settings,
  ChevronLeft, ChevronRight, Zap, User, Sparkles, Plug, Globe2,
} from 'lucide-react';
import { useRole } from '../../hooks/useRole';

interface NavItem { to: string; icon: React.ReactNode; label: string; }
interface NavSection { section: string; items: NavItem[]; }

const buildNav = (isDeveloper: boolean, isAdmin: boolean): NavSection[] => [
  { section: 'Overview',
    items: [{ to: '/dashboard', icon: <LayoutDashboard size={15} />, label: 'Dashboard' }] },
  { section: 'Platform',
    items: [
      { to: '/deployments', icon: <Rocket size={15} />,   label: 'Deployments' },
      { to: '/providers',   icon: <Plug size={15} />,     label: 'Providers' },
      { to: '/cloud',       icon: <Globe2 size={15} />,   label: 'Cloud Deploys' },
    ]},
  { section: 'Developer',
    items: [
      { to: '/github',  icon: <Github size={15} />,    label: 'GitHub' },
      { to: '/logs',    icon: <ScrollText size={15} />, label: 'Logs' },
      { to: '/metrics', icon: <BarChart2 size={15} />,  label: 'Metrics' },
    ]},
  { section: 'Intelligence',
    items: [
      ...(isDeveloper ? [
        { to: '/ai',     icon: <Bot size={15} />,       label: 'AI Assistant' },
        { to: '/deploy', icon: <Sparkles size={15} />,  label: 'AI Deploy' },
        { to: '/ai/hub', icon: <Zap size={15} />,       label: 'AI Hub' },
      ] : []),
      { to: '/ai/anomalies', icon: <AlertTriangle size={15} />, label: 'Anomalies' },
    ]},
  { section: 'Account',
    items: [
      { to: '/profile', icon: <User size={15} />, label: 'Profile' },
      ...(isAdmin ? [
        { to: '/team',     icon: <Users size={15} />,    label: 'Team' },
        { to: '/settings', icon: <Settings size={15} />, label: 'Settings' },
      ] : []),
    ]},
];

function NavItem({ to, icon, label, collapsed, index }: {
  to: string; icon: React.ReactNode; label: string;
  collapsed: boolean; index: number;
}) {
  const location = useLocation();
  const itemRef  = useRef<HTMLDivElement>(null);
  const [tilt,   setTilt]   = useState({ x: 0, y: 0 });
  const [hovered, setHov]   = useState(false);

  const active = location.pathname === to ||
    (to !== '/dashboard' && location.pathname.startsWith(to));

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = itemRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 8;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 4;
    setTilt({ x, y });
  };

  return (
    <div ref={itemRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setTilt({ x: 0, y: 0 }); }}
      title={collapsed ? label : undefined}
      style={{
        transform: hovered && !active
          ? `perspective(300px) rotateX(${-tilt.y}deg) rotateY(${tilt.x}deg) translateZ(2px)`
          : 'none',
        transition: hovered ? 'transform 80ms ease-out' : 'transform 200ms ease-out',
        animation: `slide-right 300ms ease-out ${index * 30}ms both`,
      }}
    >
      <NavLink to={to} style={{
        display: 'flex', alignItems: 'center',
        gap: collapsed ? 0 : 10,
        padding: collapsed ? '9px' : '8px 12px',
        margin: '1px 8px',
        borderRadius: 'var(--r-md)',
        color: active ? 'var(--accent-blue-2)' : hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: active
          ? 'linear-gradient(135deg,var(--accent-blue-dim),var(--accent-purple-dim))'
          : hovered ? 'var(--bg-glass-light)' : 'transparent',
        border: `1px solid ${active ? 'var(--border-glow)' : hovered ? 'var(--border)' : 'transparent'}`,
        fontWeight: active ? 700 : 400,
        fontSize: '13px', textDecoration: 'none',
        transition: 'color 150ms, background 150ms, border-color 150ms',
        justifyContent: collapsed ? 'center' : 'flex-start',
        whiteSpace: 'nowrap',
        boxShadow: active ? 'inset 0 0 20px rgba(99,102,241,0.08)' : 'none',
        position: 'relative', overflow: 'hidden',
      }}>
        {hovered && !active && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)',
            animation: 'shimmer .6s ease-out',
            pointerEvents: 'none',
          }} />
        )}
        <span style={{ flexShrink: 0, display: 'flex', position: 'relative' }}>{icon}</span>
        {!collapsed && <span style={{ position: 'relative' }}>{label}</span>}
      </NavLink>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('podium-sidebar') === 'collapsed'
  );
  const { isDeveloper, isAdmin } = useRole();
  const nav = buildNav(isDeveloper, isAdmin);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('podium-sidebar', next ? 'collapsed' : 'expanded');
  };

  const w = collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)';

  let itemIndex = 0;

  return (
    <aside className="sidebar" style={{
      width: w, minWidth: w, flexShrink: 0,
      background: 'var(--bg-glass)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', height: '100%',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 120,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{
        padding: collapsed ? '14px 0' : '14px 16px',
        display: 'flex', alignItems: 'center',
        gap: collapsed ? 0 : 10,
        borderBottom: '1px solid var(--border-muted)',
        flexShrink: 0,
        justifyContent: collapsed ? 'center' : 'flex-start',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          background: 'var(--gradient-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--glow-blue)',
          transition: 'box-shadow 300ms',
        }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 30px rgba(99,102,241,0.6)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--glow-blue)')}
        >
          <Zap size={15} color="#fff" />
        </div>
        {!collapsed && (
          <span style={{
            fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)',
            letterSpacing: '.08em',
            animation: 'slide-right 250ms ease-out',
          }}>
            PODIUM
          </span>
        )}
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 0', position: 'relative', zIndex: 1 }}>
        {nav.map(({ section, items }) => {
          if (!items.length) return null;
          return (
            <div key={section} style={{ marginBottom: 6 }}>
              {!collapsed && (
                <div style={{
                  padding: '8px 16px 4px',
                  fontSize: '10px', fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '.1em',
                }}>
                  {section}
                </div>
              )}
              {items.map(item => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  collapsed={collapsed}
                  index={itemIndex++}
                />
              ))}
            </div>
          );
        })}
      </nav>

      <button
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '11px 16px', background: 'none', border: 'none',
          borderTop: '1px solid var(--border)', color: 'var(--text-muted)',
          cursor: 'pointer', width: '100%', fontSize: '12px',
          transition: 'all 150ms', flexShrink: 0, fontFamily: 'var(--font-sans)',
          position: 'relative', zIndex: 1,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--text-primary)';
          e.currentTarget.style.background = 'var(--bg-glass-light)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--text-muted)';
          e.currentTarget.style.background = 'none';
        }}
      >
        {collapsed
          ? <ChevronRight size={14} />
          : <><ChevronLeft size={14} /><span>Collapse</span></>
        }
      </button>
    </aside>
  );
}
