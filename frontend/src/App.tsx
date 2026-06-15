import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { ProfileProvider } from './contexts/ProfileContext';
import { AppShell, ProtectedRoute } from './components/layout/AppShell';
import { Spinner } from './components/ui/Badge';

const Login        = lazy(() => import('./pages/Login'));
const Dashboard    = lazy(() => import('./pages/Dashboard'));
const Deployments  = lazy(() => import('./pages/Deployments'));
const DeploymentDetail = lazy(() => import('./pages/DeploymentDetail'));
const Containers   = lazy(() => import('./pages/Containers'));
const Domains      = lazy(() => import('./pages/Domains'));
const NaturalDeploy = lazy(() => import('./pages/NaturalDeploy'));
const GitHub       = lazy(() => import('./pages/GitHub'));
const Logs         = lazy(() => import('./pages/Logs'));
const Metrics      = lazy(() => import('./pages/Metrics'));
const AIAssistant  = lazy(() => import('./pages/AIAssistant'));
const AIHub        = lazy(() => import('./pages/AIHub'));
const AIAnomalies  = lazy(() => import('./pages/Settings').then(m => ({ default: m.AIAnomalies })));
const Team         = lazy(() => import('./pages/Settings').then(m => ({ default: m.Team })));
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.SettingsPage })));
const Profile      = lazy(() => import('./pages/Profile'));

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <Spinner size={28} color="var(--accent-blue)" />
    </div>
  );
}

const PROTECTED_ROUTES = [
  { path: '/dashboard',       el: <Dashboard /> },
  { path: '/deployments',     el: <Deployments /> },
  { path: '/deployments/:id', el: <DeploymentDetail /> },
  { path: '/containers',      el: <Containers /> },
  { path: '/domains',          el: <Domains /> },
  { path: '/deploy',          el: <NaturalDeploy /> },
  { path: '/github',          el: <GitHub /> },
  { path: '/logs',            el: <Logs /> },
  { path: '/metrics',         el: <Metrics /> },
  { path: '/ai',              el: <AIAssistant /> },
  { path: '/ai/hub',          el: <AIHub /> },
  { path: '/ai/anomalies',    el: <AIAnomalies /> },
  { path: '/team',            el: <Team /> },
  { path: '/settings',        el: <SettingsPage /> },
  { path: '/profile',         el: <Profile /> },
];

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <ProfileProvider>
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Navigate to="/login" replace />} />
                  <Route path="/cloud" element={<Navigate to="/hosting" replace />} />
                  <Route path="/" element={
                    <ProtectedRoute><AppShell><Navigate to="/dashboard" replace /></AppShell></ProtectedRoute>
                  } />
                  {PROTECTED_ROUTES.map(({ path, el }) => (
                    <Route key={path} path={path} element={
                      <ProtectedRoute>
                        <AppShell>
                          <Suspense fallback={<PageLoader />}>{el}</Suspense>
                        </AppShell>
                      </ProtectedRoute>
                    } />
                  ))}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ProfileProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
