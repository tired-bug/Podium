import React from 'react';
import { Eye } from 'lucide-react';
import { useRole } from '../../hooks/useRole';

export function ViewerBanner({ page }: { page?: string }) {
  const { isViewer } = useRole();
  if (!isViewer) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px', borderRadius: 'var(--r-md)',
      background: 'var(--accent-purple-dim)',
      border: '1px solid rgba(168,85,247,0.3)',
      fontSize: '12px', color: 'var(--text-secondary)',
      animation: 'float-up 300ms ease-out',
      marginBottom: 4,
    }}>
      <Eye size={14} color="var(--accent-purple)" style={{ flexShrink: 0 }} />
      <span>
        You have <strong style={{ color: 'var(--accent-purple)' }}>Viewer</strong> access
        {page ? ` on ${page}` : ''} — read only.
        Contact an admin to get Developer or Admin access.
      </span>
    </div>
  );
}
