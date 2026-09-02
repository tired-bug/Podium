import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { parseApiError } from '../lib/utils';
import api, { API_BASE_URL } from '../lib/api';

function GithubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.72.08-.7.08-.7 1.16.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.29 1.19-3.09-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.77.12 3.06.74.8 1.18 1.83 1.18 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .3.2.66.79.55A10.51 10.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.64v3h3.88c2.27-2.09 3.57-5.17 3.57-8.83Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.73-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.26a12 12 0 0 0 0 10.78l4.01-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.26 6.61l4.01 3.1C6.22 6.87 8.87 4.77 12 4.77Z" />
    </svg>
  );
}

function SocialButton({ provider, onClick }: { provider: 'github' | 'google'; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '9px', borderRadius: 10,
        background: hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.09)',
        color: '#f5f5f7', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        fontFamily: 'inherit', transition: 'background 130ms',
      }}
    >
      {provider === 'github' ? <GithubMark /> : <GoogleMark />}
      {provider === 'github' ? 'GitHub' : 'Google'}
    </button>
  );
}

type Mode = 'login' | 'signup';

function AuthInput({ label, error, iconRight, ...props }: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string; error?: string; iconRight?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,247,0.4)', display: 'block', marginBottom: 7, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          {...props}
          onFocus={e => { setFocused(true); props.onFocus?.(e); }}
          onBlur={e => { setFocused(false); props.onBlur?.(e); }}
          style={{
            width: '100%', padding: '10px 14px', paddingRight: iconRight ? 40 : 14,
            background: 'rgba(255,255,255,0.04)',
            color: '#f5f5f7',
            border: `1px solid ${error ? '#ff453a' : focused ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 10, fontSize: '14px',
            fontFamily: "'Inter', -apple-system, sans-serif",
            outline: 'none',
            transition: 'border-color 150ms, box-shadow 150ms',
            boxShadow: focused && !error ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
            letterSpacing: '-0.01em',
          }}
        />
        {iconRight && (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
            {iconRight}
          </span>
        )}
      </div>
      {error && <p style={{ fontSize: '11px', color: '#ff453a', marginTop: 5 }}>{error}</p>}
    </div>
  );
}

function PwStrength({ pw }: { pw: string }) {
  if (!pw) return null;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const colors = ['#ff453a', '#ff9f0a', '#30d158', '#6366f1'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ flex: 1, height: 2, borderRadius: 2, background: i < s ? colors[s - 1] : 'rgba(255,255,255,0.08)', transition: 'background 250ms' }} />
      ))}
      <span style={{ fontSize: '10px', color: colors[s - 1] || 'rgba(255,255,255,0.2)', marginLeft: 4, minWidth: 36 }}>
        {labels[s - 1] || ''}
      </span>
    </div>
  );
}

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);

  const [suUser, setSuUser] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPw, setSuPw] = useState('');
  const [suConfirm, setSuConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const [oauthProviders, setOauthProviders] = useState<{ github: boolean; google: boolean }>({ github: false, google: false });

  useEffect(() => {
    api.get('/api/auth/oauth/providers').then(({ data }) => setOauthProviders(data)).catch(() => {});
  }, []);

  const startOAuth = (provider: 'github' | 'google') => {
    window.location.href = `${API_BASE_URL}/api/auth/oauth/${provider}`;
  };

  useEffect(() => {
    if (!authLoading && user) navigate('/dashboard', { replace: true });
  }, [user, authLoading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!username) errs.username = 'Required';
    if (!password) errs.password = 'Required';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (needsTotp && !totpCode) { setErrors({ totpCode: 'Required' }); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', { username, password, totpCode: needsTotp ? totpCode : undefined });
      login(data.token, data.user);
      success(`User authenticated — welcome back, ${data.user.username}`);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      if (err?.response?.data?.requiresTotp) {
        setNeedsTotp(true);
        if (needsTotp) showError('Invalid 2FA code');
      } else {
        showError(parseApiError(err));
      }
    }
    finally { setLoading(false); }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!suUser) errs.suUser = 'Required';
    if (!suEmail) errs.suEmail = 'Required';
    if (!suPw || suPw.length < 8) errs.suPw = 'Min 8 characters';
    if (suPw !== suConfirm) errs.suConfirm = 'Passwords do not match';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/signup', { username: suUser, email: suEmail, password: suPw, inviteCode });
      login(data.token, data.user);
      success(`User authenticated — welcome, ${data.user.username}`);
      navigate('/dashboard', { replace: true });
    } catch (err) { showError(parseApiError(err)); }
    finally { setLoading(false); }
  };

  const eyeBtn = (
    <button type="button" onClick={() => setShowPw(v => !v)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,245,247,0.3)', display: 'flex', padding: 0 }}>
      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );

  return (
    <div style={{
      display: 'flex', height: '100vh',
      background: '#000',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      WebkitFontSmoothing: 'antialiased',
      overflow: 'hidden',
    }}>

      {/* Left panel — brand */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: '48px 56px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Orb */}
        <div style={{
          position: 'absolute', top: '20%', left: '30%',
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.06em', color: '#f5f5f7' }}>PODIUM</span>
        </div>

        {/* Main copy */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <h1 style={{
            fontSize: 'clamp(32px, 3.5vw, 52px)',
            fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1,
            color: '#f5f5f7', marginBottom: 18,
          }}>
            DevOps at<br />
            <span style={{
              background: 'linear-gradient(135deg, #818cf8, #a855f7)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              the speed of AI
            </span>
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(245,245,247,0.4)', lineHeight: 1.7, maxWidth: 360, letterSpacing: '-0.01em' }}>
            Multi-cloud deployments, real-time metrics, and an AI assistant — all in one platform.
          </p>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 48 }}>
            {[
              { title: 'Real-time Metrics', desc: 'CPU, memory, and network at a glance' },
              { title: 'AI Assistant', desc: 'Groq powered — analyze logs, fix failures' },
              { title: 'Role-based Access', desc: 'Admin, Developer, Viewer with invite-based onboarding' },
            ].map(f => (
              <div key={f.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#6366f1', marginTop: 7, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f5f5f7', marginBottom: 2, letterSpacing: '-0.01em' }}>{f.title}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(245,245,247,0.35)', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '11px', color: 'rgba(245,245,247,0.2)', position: 'relative', zIndex: 1 }}>
          Podium v4.0 — Open source AIOps platform
        </div>
      </div>

      {/* Right panel — auth */}
      <div style={{
        width: 440, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 44px',
        background: '#0a0a0a',
        borderLeft: '1px solid rgba(255,255,255,0.07)',
        overflowY: 'auto',
      }}>

        {/* Mode switcher */}
        <div style={{
          width: '100%', display: 'flex', marginBottom: 28,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 10, padding: 3, gap: 3,
        }}>
          {(['login', 'signup'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setErrors({}); }}
              style={{
                flex: 1, padding: '7px', borderRadius: 8,
                background: mode === m ? '#1c1c1e' : 'transparent',
                color: mode === m ? '#f5f5f7' : 'rgba(245,245,247,0.35)',
                border: mode === m ? '1px solid rgba(255,255,255,0.09)' : '1px solid transparent',
                fontWeight: mode === m ? 600 : 400,
                fontSize: '13px', cursor: 'pointer', transition: 'all 160ms',
                fontFamily: 'inherit', letterSpacing: '-0.01em',
              }}>
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {/* Social sign-in */}
        {(oauthProviders.github || oauthProviders.google) && (
          <>
            <div style={{ width: '100%', display: 'flex', gap: 10, marginBottom: 18 }}>
              {oauthProviders.github && <SocialButton provider="github" onClick={() => startOAuth('github')} />}
              {oauthProviders.google && <SocialButton provider="google" onClick={() => startOAuth('google')} />}
            </div>
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              <span style={{ fontSize: '11px', color: 'rgba(245,245,247,0.3)', letterSpacing: '0.04em' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            </div>
          </>
        )}

        {/* Login form */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#f5f5f7', letterSpacing: '-0.02em' }}>Welcome back</h2>
              <p style={{ fontSize: '13px', color: 'rgba(245,245,247,0.35)', marginTop: 4 }}>Sign in to your workspace</p>
            </div>
            <AuthInput label="Username or email" placeholder="your-username" value={username}
              onChange={e => setUsername(e.target.value)} error={errors.username} autoComplete="username" disabled={needsTotp} />
            <AuthInput label="Password" type={showPw ? 'text' : 'password'} placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              error={errors.password} iconRight={eyeBtn} autoComplete="current-password" disabled={needsTotp} />
            {needsTotp && (
              <AuthInput label="Two-factor code" placeholder="6-digit code" value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                error={errors.totpCode} autoComplete="one-time-code" />
            )}
            <div style={{ textAlign: 'right', marginTop: -6 }}>
              <span onClick={() => navigate('/forgot-password')} style={{ fontSize: '12px', color: '#818cf8', cursor: 'pointer' }}>Forgot password?</span>
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '11px', borderRadius: 10, marginTop: 4,
              background: loading ? 'rgba(99,102,241,0.4)' : '#6366f1',
              color: '#fff', border: 'none', fontWeight: 600, fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              transition: 'all 150ms', letterSpacing: '-0.01em',
            }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = '#5457e8'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
              onMouseLeave={e => { e.currentTarget.style.background = loading ? 'rgba(99,102,241,0.4)' : '#6366f1'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {loading ? 'Signing in...' : <><span>Sign in</span><ArrowRight size={14} /></>}
            </button>
          </form>
        )}

        {/* Signup form */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#f5f5f7', letterSpacing: '-0.02em' }}>Create account</h2>
              <p style={{ fontSize: '13px', color: 'rgba(245,245,247,0.35)', marginTop: 4 }}>Join your team workspace</p>
            </div>
            <AuthInput label="Username" placeholder="devops-admin" value={suUser} onChange={e => setSuUser(e.target.value)} error={errors.suUser} />
            <AuthInput label="Email" type="email" placeholder="you@company.com" value={suEmail} onChange={e => setSuEmail(e.target.value)} error={errors.suEmail} />
            <div>
              <AuthInput label="Password" type={showPw ? 'text' : 'password'} placeholder="Min 8 characters" value={suPw} onChange={e => setSuPw(e.target.value)} error={errors.suPw} iconRight={eyeBtn} />
              <PwStrength pw={suPw} />
            </div>
            <AuthInput label="Confirm password" type="password" placeholder="Repeat password" value={suConfirm} onChange={e => setSuConfirm(e.target.value)} error={errors.suConfirm} />
            <AuthInput label="Invite code (optional)" placeholder="XXXXXXXXXXXXXXXX" value={inviteCode} onChange={e => setInviteCode(e.target.value)} error={errors.inviteCode} />
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '11px', borderRadius: 10, marginTop: 4,
              background: loading ? 'rgba(99,102,241,0.4)' : '#6366f1',
              color: '#fff', border: 'none', fontWeight: 600, fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              transition: 'all 150ms', letterSpacing: '-0.01em',
            }}>
              {loading ? 'Creating account...' : <><span>Create account</span><ArrowRight size={14} /></>}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
