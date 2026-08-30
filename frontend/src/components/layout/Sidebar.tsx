import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Github, ScrollText, BarChart2,
  Bot, Users, Settings, ChevronLeft, ChevronRight,
  Zap, User, Plug, DollarSign, Cpu,
} from 'lucide-react';
import { useRole } from '../../hooks/useRole';

interface NavItem { to: string; icon: React.ReactNode; label: string; }
interface NavSection { section: string; items: NavItem[]; }

const buildNav = (isDeveloper: boolean, isAdmin: boolean): NavSection[] => [
  { section: 'Overview',
    items: [{ to: '/dashboard', icon: <LayoutDashboard size={14} />, label: 'Dashboard' }] },
  { section: 'Platform',
    items: [
      { to: '/ai/deploy',   icon: <Cpu size={14} />,          label: 'AI Deploy' },
      { to: '/providers',   icon: <Plug size={14} />,         label: 'Providers' },
      { to: '/finops',      icon: <DollarSign size={14} />,   label: 'FinOps' },
    ]},
  { section: 'Developer',
    items: [
      { to: '/github',  icon: <Github size={14} />,     label: 'GitHub' },
      { to: '/logs',    icon: <ScrollText size={14} />, label: 'Logs' },
      { to: '/metrics', icon: <BarChart2 size={14} />,  label: 'Metrics' },
    ]},
  { section: 'Intelligence',
    items: [
      ...(isDeveloper ? [
        { to: '/ai',     icon: <Bot size={14} />,  label: 'AI Assistant' },
        { to: '/ai/hub', icon: <Zap size={14} />,  label: 'AI Hub' },
      ] : []),
    ]},
  { section: 'Account',
    items: [
      { to: '/profile', icon: <User size={14} />, label: 'Profile' },
      ...(isAdmin ? [
        { to: '/team',     icon: <Users size={14} />,    label: 'Team' },
        { to: '/settings', icon: <Settings size={14} />, label: 'Settings' },
      ] : []),
    ]},
];

function NavItem({ to, icon, label, collapsed, index }: {
  to: string; icon: React.ReactNode; label: string;
  collapsed: boolean; index: number;
}) {
  const location = useLocation();
  const [hovered, setHov] = useState(false);

  const active = location.pathname === to ||
    (to !== '/dashboard' && location.pathname.startsWith(to));

  return (
    <div
      title={collapsed ? label : undefined}
      style={{ animation: `slide-right 200ms ease-out ${index * 20}ms both` }}
    >
      <NavLink to={to} style={{
        display: 'flex', alignItems: 'center',
        gap: collapsed ? 0 : 9,
        padding: collapsed ? '8px 0' : '7px 12px',
        margin: collapsed ? '1px 6px' : '1px 8px',
        borderRadius: 'var(--r-md)',
        color: active ? 'var(--text-primary)' : hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: active ? 'var(--bg-glass-light)' : 'transparent',
        border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
        fontWeight: active ? 600 : 400,
        fontSize: '13px', textDecoration: 'none',
        transition: 'color 120ms, background 120ms, border-color 120ms',
        justifyContent: collapsed ? 'center' : 'flex-start',
        whiteSpace: 'nowrap',
        position: 'relative',
        letterSpacing: '-0.01em',
      }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
      >
        {active && (
          <span style={{
            position: 'absolute', left: collapsed ? '50%' : 0,
            top: '50%', transform: collapsed ? 'translate(-50%,-50%)' : 'translateY(-50%)',
            width: collapsed ? 3 : 2, height: collapsed ? 3 : 14,
            background: 'var(--accent)',
            borderRadius: 2,
            ...(collapsed ? {} : { left: -1 }),
          }} />
        )}
        <span style={{ flexShrink: 0, display: 'flex', opacity: active ? 1 : 0.7 }}>{icon}</span>
        {!collapsed && <span>{label}</span>}
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
  const navigate = useNavigate();

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
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', height: '100%',
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '14px 0' : '14px 16px',
        display: 'flex', alignItems: 'center',
        gap: collapsed ? 0 : 10,
        borderBottom: '1px solid var(--border-muted)',
        flexShrink: 0,
        justifyContent: collapsed ? 'center' : 'flex-start',
        cursor: 'pointer',
      }} onClick={() => navigate('/dashboard')}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Zap size={13} color="#fff" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <span style={{
            fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)',
            letterSpacing: '0.04em',
            animation: 'slide-right 200ms ease-out',
          }}>
            PODIUM
          </span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        {nav.map(({ section, items }) => {
          if (!items.length) return null;
          return (
            <div key={section} style={{ marginBottom: 4 }}>
              {!collapsed && (
                <div style={{
                  padding: '10px 20px 4px',
                  fontSize: '10px', fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '.08em',
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

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '11px 16px', background: 'none', border: 'none',
          borderTop: '1px solid var(--border-muted)', color: 'var(--text-muted)',
          cursor: 'pointer', width: '100%', fontSize: '11px',
          transition: 'color 120ms', flexShrink: 0, fontFamily: 'var(--font-sans)',
          letterSpacing: '0.01em',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        {collapsed
          ? <ChevronRight size={13} />
          : <><ChevronLeft size={13} /><span>Collapse</span></>
        }
      </button>
    </aside>
  );
}
