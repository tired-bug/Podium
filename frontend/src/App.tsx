import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { ProfileProvider } from './contexts/ProfileContext';
import { AppShell, ProtectedRoute } from './components/layout/AppShell';
import { Spinner } from './components/ui/Badge';

const Landing      = lazy(() => import('./pages/Landing'));
const Login        = lazy(() => import('./pages/Login'));
const VerifyEmail  = lazy(() => import('./pages/VerifyEmail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword  = lazy(() => import('./pages/ResetPassword'));
const Dashboard    = lazy(() => import('./pages/Dashboard'));
const GitHub       = lazy(() => import('./pages/GitHub'));
const Logs         = lazy(() => import('./pages/Logs'));
const Metrics      = lazy(() => import('./pages/Metrics'));
const AIAssistant  = lazy(() => import('./pages/AIAssistant'));
const AIHub        = lazy(() => import('./pages/AIHub'));
const AIAnomalies  = lazy(() => import('./pages/Settings').then(m => ({ default: m.AIAnomalies })));
const Team         = lazy(() => import('./pages/Settings').then(m => ({ default: m.Team })));
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.SettingsPage })));
const Profile      = lazy(() => import('./pages/Profile'));
const Providers    = lazy(() => import('./pages/Providers'));
const CloudDeploys = lazy(() => import('./pages/CloudDeployments'));
const FinOps       = lazy(() => import('./pages/FinOps'));
const AIDeploy     = lazy(() => import('./pages/AIDeploy'));

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <Spinner size={24} color="var(--accent)" />
    </div>
  );
}

const PROTECTED_ROUTES = [
  { path: '/dashboard',       el: <Dashboard /> },
  { path: '/github',          el: <GitHub /> },
  { path: '/logs',            el: <Logs /> },
  { path: '/metrics',         el: <Metrics /> },
  { path: '/ai',              el: <AIAssistant /> },
  { path: '/ai/hub',          el: <AIHub /> },
  { path: '/ai/anomalies',    el: <AIAnomalies /> },
  { path: '/team',            el: <Team /> },
  { path: '/settings',        el: <SettingsPage /> },
  { path: '/profile',         el: <Profile /> },
  { path: '/providers',       el: <Providers /> },
  { path: '/cloud',           el: <CloudDeploys /> },
  { path: '/finops',          el: <FinOps /> },
  { path: '/ai/deploy',       el: <AIDeploy /> },
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
                  {/* Public landing page */}
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Navigate to="/login" replace />} />
                  {/* Legacy deployment routes — redirect to /cloud */}
                  <Route path="/deployments" element={<Navigate to="/cloud" replace />} />
                  <Route path="/deployments/:id" element={<Navigate to="/cloud" replace />} />
                  <Route path="/deploy" element={<Navigate to="/cloud" replace />} />
                  {/* Auth flows */}
                  <Route path="/verify-email" element={<VerifyEmail />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  {/* Protected app routes */}
                  {PROTECTED_ROUTES.map(({ path, el }) => (
                    <Route key={path} path={path} element={
                      <ProtectedRoute>
                        <AppShell>
                          <Suspense fallback={<PageLoader />}>{el}</Suspense>
                        </AppShell>
                      </ProtectedRoute>
                    } />
                  ))}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ProfileProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
