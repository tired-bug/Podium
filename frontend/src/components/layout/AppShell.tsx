import React, { ReactNode, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { TitleBar } from './TitleBar';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Spinner } from '../ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { ToastContainer } from '../ui/Modal';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glow-blue)' }}>
          <Spinner size={22} color="#fff" />
        </div>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading Podium…</span>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      <TitleBar />
      <Topbar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg-primary)', position: 'relative' }}>
          {}
          <div style={{
            position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
            background: 'var(--gradient-mesh)',
          }} />
          <div className="page-enter" style={{ maxWidth: 1400, margin: '0 auto', padding: 28, position: 'relative', zIndex: 1 }}>
            <Suspense fallback={<PageFallback />}>{children}</Suspense>
          </div>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

function PageFallback() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
      <div className="skeleton" style={{ height: 28, width: 200 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 90 }} />)}
      </div>
      <div className="skeleton" style={{ height: 260 }} />
    </div>
  );
}
