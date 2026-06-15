import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Zap, Shield, BarChart2, Bot, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { parseApiError } from '../lib/utils';
import api from '../lib/api';

type Mode = 'login' | 'signup';

// ── Animated mesh background ──────────────────────────────────────────────────
function MeshBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);

    const orbs = Array.from({ length: 5 }, (_, i) => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 180 + Math.random() * 120,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      hue: [260, 220, 280, 200, 240][i],
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const o of orbs) {
        o.x += o.vx; o.y += o.vy;
        if (o.x < -o.r) o.x = canvas.width + o.r;
        if (o.x > canvas.width + o.r) o.x = -o.r;
        if (o.y < -o.r) o.y = canvas.height + o.r;
        if (o.y > canvas.height + o.r) o.y = -o.r;
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, `hsla(${o.hue},80%,60%,0.18)`);
        g.addColorStop(1, `hsla(${o.hue},80%,60%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

// ── Floating feature card ──────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, delay }: { icon: React.ReactNode; title: string; desc: string; delay: number }) {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '14px 16px',
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      animation: `float-up 600ms ease-out ${delay}ms both`,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.3))',
        border: '1px solid rgba(99,102,241,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#818cf8',
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#e0e0ff', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: '12px', color: 'rgba(160,160,200,0.8)', lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  );
}

// ── Input field ────────────────────────────────────────────────────────────────
function AuthInput({ label, error, iconRight, ...props }: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string; error?: string; iconRight?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, letterSpacing: '.03em' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          {...props}
          onFocus={e => { setFocused(true); props.onFocus?.(e); }}
          onBlur={e => { setFocused(false); props.onBlur?.(e); }}
          style={{
            width: '100%', padding: '10px 14px', paddingRight: iconRight ? 40 : 14,
            background: 'rgba(255,255,255,0.05)',
            color: 'var(--text-primary)',
            border: `1px solid ${error ? 'var(--accent-red)' : focused ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '10px', fontSize: '14px',
            fontFamily: 'var(--font-sans)', outline: 'none',
            transition: 'all 200ms',
            boxShadow: focused ? (error ? '0 0 0 3px rgba(239,68,68,0.15)' : '0 0 0 3px rgba(99,102,241,0.15)') : 'none',
          }}
        />
        {iconRight && (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
            {iconRight}
          </span>
        )}
      </div>
      {error && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: 5, margin: 0 }}>{error}</p>}
    </div>
  );
}

// ── Password strength bar ──────────────────────────────────────────────────────
function PwStrength({ pw }: { pw: string }) {
  if (!pw) return null;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#6366f1'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < s ? colors[s - 1] : 'rgba(255,255,255,0.1)', transition: 'background 300ms' }} />
      ))}
      <span style={{ fontSize: '10px', color: colors[s - 1] || 'rgba(255,255,255,0.3)', marginLeft: 4, minWidth: 36 }}>
        {labels[s - 1] || ''}
      </span>
    </div>
  );
}

export default function LoginPage() {
  const { login, user } = useAuth();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Signup fields
  const [suUser, setSuUser] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPw, setSuPw] = useState('');
  const [suConfirm, setSuConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => { if (user) navigate('/dashboard', { replace: true }); }, [user]);
  useEffect(() => {
    api.get('/api/auth/setup').then(({ data }) => {
      if (data.needsSetup) { setNeedsSetup(true); setMode('signup'); }
    }).catch(() => {});
  }, []);

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
      success(`Welcome back, ${data.user.username}!`);
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
    if (!needsSetup && !inviteCode) errs.inviteCode = 'Required';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/signup', {
        username: suUser, email: suEmail, password: suPw,
        inviteCode: needsSetup ? undefined : inviteCode,
      });
      login(data.token, data.user);
      success(needsSetup ? 'Admin account created! Welcome to Podium.' : 'Account created!');
      navigate('/dashboard', { replace: true });
    } catch (err) { showError(parseApiError(err)); }
    finally { setLoading(false); }
  };

  const eyeBtn = (
    <button type="button" onClick={() => setShowPw(v => !v)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(160,160,200,0.6)', display: 'flex', padding: 0 }}>
      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#050508', overflow: 'hidden' }}>

      {/* ── Left: Branding ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', padding: '48px 56px', overflow: 'hidden' }}>
        <MeshBackground />

        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: 'linear-gradient(rgba(99,102,241,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 72, animation: 'float-up 500ms ease-out' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 30px rgba(99,102,241,0.5), 0 0 60px rgba(99,102,241,0.2)',
            }}>
              <Zap size={24} color="#fff" />
            </div>
            <span style={{ fontSize: '26px', fontWeight: 900, color: '#f0f0ff', letterSpacing: '.1em' }}>PODIUM</span>
          </div>

          {/* Headline */}
          <div style={{ animation: 'float-up 500ms ease-out 100ms both' }}>
            <h1 style={{ fontSize: '42px', fontWeight: 900, lineHeight: 1.15, color: '#f0f0ff', letterSpacing: '-.02em', marginBottom: 18 }}>
              DevOps at
              <br />
              <span style={{ background: 'linear-gradient(135deg, #818cf8, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                the speed of AI
              </span>
            </h1>
            <p style={{ fontSize: '15px', color: 'rgba(160,160,200,0.85)', lineHeight: 1.75, maxWidth: 380, marginBottom: 40 }}>
              Docker management, multi-cloud deployments, real-time metrics, and an AI assistant — all in one native desktop app.
            </p>
          </div>

          {/* Feature cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400 }}>
            <FeatureCard icon={<BarChart2 size={17} />} title="Real-time Metrics" desc="CPU, memory, and network monitoring with live anomaly detection" delay={200} />
            <FeatureCard icon={<Bot size={17} />} title="Groq AI Assistant" desc="LLaMA 3 70B powered DevOps expert — analyze logs, fix failures" delay={300} />
            <FeatureCard icon={<Shield size={17} />} title="Role-based Access" desc="Admin, Developer, Viewer roles with invite-based onboarding" delay={400} />
          </div>

          {/* Bottom tag */}
          <div style={{ marginTop: 'auto', fontSize: '12px', color: 'rgba(100,100,140,0.6)', animation: 'float-up 500ms ease-out 500ms both' }}>
            Podium v4.0 — Open source AIOps platform
          </div>
        </div>
      </div>

      {/* ── Right: Auth form ───────────────────────────────────────────────── */}
      <div style={{
        width: 460, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 48px',
        background: 'rgba(12,12,20,0.95)',
        backdropFilter: 'blur(40px)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        overflowY: 'auto',
      }}>

        {needsSetup && (
          <div style={{
            width: '100%', padding: '12px 16px', borderRadius: 10, marginBottom: 24,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15))',
            border: '1px solid rgba(99,102,241,0.3)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <Zap size={16} color="#818cf8" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8', marginBottom: 2 }}>First-time setup</div>
              <div style={{ fontSize: '12px', color: 'rgba(160,160,200,0.8)' }}>Create your admin account to get started. No invite code needed.</div>
            </div>
          </div>
        )}

        {/* Mode toggle */}
        {!needsSetup && (
          <div style={{
            width: '100%', display: 'flex', marginBottom: 28,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: 4, gap: 4,
          }}>
            {(['login', 'signup'] as Mode[]).map(m => (
              <button key={m} onClick={() => { setMode(m); setErrors({}); }}
                style={{
                  flex: 1, padding: '8px', borderRadius: 9,
                  background: mode === m ? 'linear-gradient(135deg, rgba(99,102,241,0.8), rgba(168,85,247,0.8))' : 'transparent',
                  color: mode === m ? '#fff' : 'rgba(160,160,200,0.6)',
                  border: 'none', fontWeight: mode === m ? 700 : 400,
                  fontSize: '13px', cursor: 'pointer', transition: 'all 200ms',
                  fontFamily: 'var(--font-sans)',
                  boxShadow: mode === m ? '0 0 20px rgba(99,102,241,0.3)' : 'none',
                }}>
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>
        )}

        {/* ── Login form ─────────────────────────────────────────────────── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#f0f0ff', margin: 0 }}>Welcome back</h2>
              <p style={{ fontSize: '13px', color: 'rgba(160,160,200,0.6)', marginTop: 4 }}>Sign in to your workspace</p>
            </div>
            <AuthInput label="USERNAME OR EMAIL" placeholder="your-username" value={username}
              onChange={e => setUsername(e.target.value)} error={errors.username} autoComplete="username" />
            <AuthInput label="PASSWORD" type={showPw ? 'text' : 'password'} placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              error={errors.password} iconRight={eyeBtn} autoComplete="current-password" />
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px', borderRadius: 10, marginTop: 4,
              background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #a855f7)',
              color: '#fff', border: 'none', fontWeight: 700, fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 200ms', boxShadow: loading ? 'none' : '0 0 24px rgba(99,102,241,0.4)',
            }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {loading ? 'Signing in...' : <><span>Sign In</span><ArrowRight size={15} /></>}
            </button>
          </form>
        )}

        {/* ── Signup form ────────────────────────────────────────────────── */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!needsSetup && (
              <div style={{ marginBottom: 8 }}>
                <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#f0f0ff', margin: 0 }}>Create account</h2>
                <p style={{ fontSize: '13px', color: 'rgba(160,160,200,0.6)', marginTop: 4 }}>Join your team workspace</p>
              </div>
            )}
            {needsSetup && (
              <div style={{ marginBottom: 8 }}>
                <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#f0f0ff', margin: 0 }}>Create Admin Account</h2>
              </div>
            )}
            <AuthInput label="USERNAME" placeholder="devops-admin" value={suUser}
              onChange={e => setSuUser(e.target.value)} error={errors.suUser} />
            <AuthInput label="EMAIL" type="email" placeholder="you@company.com" value={suEmail}
              onChange={e => setSuEmail(e.target.value)} error={errors.suEmail} />
            <div>
              <AuthInput label="PASSWORD" type={showPw ? 'text' : 'password'} placeholder="Min 8 characters"
                value={suPw} onChange={e => setSuPw(e.target.value)}
                error={errors.suPw} iconRight={eyeBtn} />
              <PwStrength pw={suPw} />
            </div>
            <AuthInput label="CONFIRM PASSWORD" type="password" placeholder="Repeat password"
              value={suConfirm} onChange={e => setSuConfirm(e.target.value)} error={errors.suConfirm} />
            {!needsSetup && (
              <AuthInput label="INVITE CODE" placeholder="XXXXXXXXXXXXXXXX" value={inviteCode}
                onChange={e => setInviteCode(e.target.value)} error={errors.inviteCode} />
            )}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px', borderRadius: 10, marginTop: 4,
              background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #a855f7)',
              color: '#fff', border: 'none', fontWeight: 700, fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 200ms', boxShadow: loading ? 'none' : '0 0 24px rgba(99,102,241,0.4)',
            }}>
              {loading ? 'Creating account...' : <><span>{needsSetup ? 'Create Admin Account' : 'Create Account'}</span><ArrowRight size={15} /></>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
