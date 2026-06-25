import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader, Lock, Zap, CheckCircle, XCircle } from 'lucide-react';
import api from '../lib/api';
import { parseApiError } from '../lib/utils';

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
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6, marginBottom: 12 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ flex: 1, height: 2, borderRadius: 2, background: i < s ? colors[s - 1] : 'rgba(255,255,255,0.08)', transition: 'background 250ms' }} />
      ))}
      <span style={{ fontSize: '10px', color: colors[s - 1] || 'rgba(255,255,255,0.2)', marginLeft: 4, minWidth: 36 }}>
        {labels[s - 1] || ''}
      </span>
    </div>
  );
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) { setError('Missing reset token. Please use the link from your email.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setSuccess(true);
    } catch (e) {
      setError(parseApiError(e));
    } finally {
      setLoading(false);
    }
  };

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#050508',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    fontFamily: "'Inter', -apple-system, sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    maxWidth: 440,
    width: '100%',
    background: '#0f0f1a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    overflow: 'hidden',
  };

  const inputWrapStyle: React.CSSProperties = { position: 'relative', marginBottom: 4 };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 40px 10px 14px',
    background: 'rgba(255,255,255,0.04)',
    color: '#f5f5f7',
    border: `1px solid ${error ? '#ff453a' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 10,
    fontSize: 14,
    fontFamily: "'Inter', -apple-system, sans-serif",
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,247,0.4)',
    display: 'block', marginBottom: 7, letterSpacing: '0.05em', textTransform: 'uppercase' as const,
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ height: 5, background: 'linear-gradient(90deg,#6366f1,#a855f7,#ec4899)' }} />
        <div style={{ padding: '36px 40px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(99,102,241,0.4)' }}>
              <Zap size={22} color="#fff" strokeWidth={2.5} />
            </div>
          </div>

          {!success ? (
            <>
              <h1 style={{ color: '#f0f0ff', fontSize: 22, fontWeight: 800, margin: '0 0 8px', textAlign: 'center' }}>Reset Password</h1>
              <p style={{ color: '#9090b8', fontSize: 14, marginBottom: 28, textAlign: 'center' }}>Choose a strong new password for your account.</p>

              {!token && (
                <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <XCircle size={14} color="#ef4444" />
                    <span style={{ fontSize: '13px', color: '#ef4444' }}>Invalid or missing reset token.</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <label style={labelStyle}>New password</label>
                <div style={inputWrapStyle}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoFocus
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex' }}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <PwStrength pw={password} />

                <label style={{ ...labelStyle, marginTop: 8 }}>Confirm password</label>
                <div style={{ ...inputWrapStyle, marginBottom: 4 }}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    style={inputStyle}
                  />
                </div>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, marginBottom: 14, marginTop: 8 }}>
                    <XCircle size={13} color="#ef4444" />
                    <span style={{ fontSize: '12px', color: '#ef4444' }}>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !password || !confirm || !token}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px', background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginTop: 14 }}
                >
                  {loading ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Resetting…</> : <><Lock size={15} /> Set New Password</>}
                </button>
              </form>
            </>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <CheckCircle size={48} color="#10b981" style={{ margin: '0 auto 20px' }} />
              <h1 style={{ color: '#f0f0ff', fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Password Updated</h1>
              <p style={{ color: '#9090b8', fontSize: 14, marginBottom: 28 }}>Your password has been reset successfully.</p>
              <button
                onClick={() => navigate('/login')}
                style={{ display: 'block', width: '100%', padding: '13px', background: 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Go to Login
              </button>
            </div>
          )}

          <p style={{ marginTop: 24, textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>
            <span onClick={() => navigate('/login')} style={{ cursor: 'pointer', color: '#818cf8' }}>Back to login</span>
          </p>
        </div>
      </div>
    </div>
  );
}
