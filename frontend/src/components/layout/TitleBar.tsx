import React, { useEffect, useState } from 'react';
import { Minus, Square, X, Zap } from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      onMaximizeChange: (cb: (val: boolean) => void) => () => void;
    };
  }
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI!.isMaximized().then(setMaximized);
    const cleanup = window.electronAPI!.onMaximizeChange(setMaximized);
    return cleanup;
  }, []);

  if (!isElectron) return null;

  const controls = [
    {
      id: 'min',
      icon: <Minus size={10} strokeWidth={2.5} />,
      action: () => window.electronAPI!.minimize(),
      label: 'Minimize',
      hoverBg: 'var(--bg-hover)',
    },
    {
      id: 'max',
      icon: <Square size={10} strokeWidth={2.5} />,
      action: () => window.electronAPI!.maximize(),
      label: maximized ? 'Restore' : 'Maximize',
      hoverBg: 'var(--bg-hover)',
    },
    {
      id: 'close',
      icon: <X size={10} strokeWidth={2.5} />,
      action: () => window.electronAPI!.close(),
      label: 'Close',
      hoverBg: '#E81123',
    },
  ];

  return (
    <div
      className="drag-region"
      style={{
        height: 'var(--titlebar-height)',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        position: 'relative',
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 12 }}>
        <Zap size={12} color="var(--accent-blue)" />
        <span style={{
          fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          Podium
        </span>
      </div>

      {/* Window controls */}
      <div className="no-drag" style={{ display: 'flex' }}>
        {controls.map(ctrl => (
          <button
            key={ctrl.id}
            aria-label={ctrl.label}
            onClick={ctrl.action}
            onMouseEnter={() => setHovered(ctrl.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              width: 46, height: 'var(--titlebar-height)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: hovered === ctrl.id ? ctrl.hoverBg : 'transparent',
              border: 'none', cursor: 'pointer',
              color: hovered === ctrl.id && ctrl.id === 'close' ? '#fff' : 'var(--text-secondary)',
              transition: 'background 100ms, color 100ms',
            }}
          >
            {ctrl.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
