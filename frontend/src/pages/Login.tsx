import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { parseApiError } from '../lib/utils';
import api from '../lib/api';

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

  const [suUser, setSuUser] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPw, setSuPw] = useState('');
  const [suConfirm, setSuConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    if (!authLoading && user) navigate('/dashboard', { replace: true });
  }, [user, authLoading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!username) errs.username = 'Required';
    if (!password) errs.password = 'Required';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', { username, password });
      login(data.token, data.user);
      success(`Welcome back, ${data.user.username}`);
      navigate('/dashboard', { replace: true });
    } catch (err) { showError(parseApiError(err)); }
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
      success('Account created');
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
              { title: 'Real-time Metrics', desc: 'CPU, memory, and network with live anomaly detection' },
              { title: 'Groq AI Assistant', desc: 'LLaMA 3 70B powered — analyze logs, fix failures' },
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

        {/* Login form */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#f5f5f7', letterSpacing: '-0.02em' }}>Welcome back</h2>
              <p style={{ fontSize: '13px', color: 'rgba(245,245,247,0.35)', marginTop: 4 }}>Sign in to your workspace</p>
            </div>
            <AuthInput label="Username or email" placeholder="your-username" value={username}
              onChange={e => setUsername(e.target.value)} error={errors.username} autoComplete="username" />
            <AuthInput label="Password" type={showPw ? 'text' : 'password'} placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              error={errors.password} iconRight={eyeBtn} autoComplete="current-password" />
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
