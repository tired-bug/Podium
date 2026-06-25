import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader, Mail, Zap, ArrowLeft } from 'lucide-react';
import api from '../lib/api';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await api.post('/api/auth/forgot-password', { email });
    } catch {
      // Intentionally ignore — do not reveal whether email exists
    } finally {
      setLoading(false);
      setSent(true);
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.04)',
    color: '#f5f5f7',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    fontSize: 14,
    fontFamily: "'Inter', -apple-system, sans-serif",
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 16,
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

          {!sent ? (
            <>
              <h1 style={{ color: '#f0f0ff', fontSize: 22, fontWeight: 800, margin: '0 0 8px', textAlign: 'center' }}>Forgot Password</h1>
              <p style={{ color: '#9090b8', fontSize: 14, marginBottom: 28, textAlign: 'center', lineHeight: 1.6 }}>
                Enter your email and we'll send a reset link if an account exists.
              </p>

              <form onSubmit={handleSubmit}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,247,0.4)', display: 'block', marginBottom: 7, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  style={inputStyle}
                />
                <button
                  type="submit"
                  disabled={loading || !email}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px', background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                >
                  {loading ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</> : <><Mail size={15} /> Send Reset Link</>}
                </button>
              </form>
            </>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <Mail size={24} color="#10b981" />
              </div>
              <h1 style={{ color: '#f0f0ff', fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Check Your Email</h1>
              <p style={{ color: '#9090b8', fontSize: 14, lineHeight: 1.7, margin: '0 0 28px' }}>
                If an account exists for <strong style={{ color: '#f0f0ff' }}>{email}</strong>, a password reset link has been sent. Check your inbox and spam folder.
              </p>
              <p style={{ color: '#9090b8', fontSize: 12, marginBottom: 28 }}>The link will expire in 1 hour.</p>
            </div>
          )}

          <p style={{ marginTop: 24, textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>
            <span
              onClick={() => navigate('/login')}
              style={{ cursor: 'pointer', color: '#818cf8', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <ArrowLeft size={12} /> Back to login
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
