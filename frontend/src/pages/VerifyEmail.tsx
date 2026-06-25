import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader, RefreshCw, Zap } from 'lucide-react';
import api from '../lib/api';
import { parseApiError } from '../lib/utils';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'resend'>('loading');
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('resend');
      setMessage('No verification token found.');
      return;
    }
    api.post('/api/auth/verify-email', { token })
      .then(() => { setStatus('success'); })
      .catch(e => {
        setStatus('error');
        setMessage(parseApiError(e));
      });
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;
    setResending(true);
    setResendMsg('');
    try {
      await api.post('/api/auth/resend-verification', { email: resendEmail });
      setResendMsg('If that email exists and is unverified, a new link has been sent.');
    } catch {
      setResendMsg('If that email exists and is unverified, a new link has been sent.');
    } finally {
      setResending(false);
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

  const bodyStyle: React.CSSProperties = {
    padding: '36px 40px',
    textAlign: 'center',
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ height: 5, background: 'linear-gradient(90deg,#6366f1,#a855f7,#ec4899)' }} />
        <div style={bodyStyle}>
          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(99,102,241,0.4)' }}>
              <Zap size={22} color="#fff" strokeWidth={2.5} />
            </div>
          </div>

          {status === 'loading' && (
            <>
              <Loader size={40} color="#6366f1" style={{ margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
              <h1 style={{ color: '#f0f0ff', fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Verifying…</h1>
              <p style={{ color: '#9090b8', fontSize: 14, margin: 0 }}>Please wait while we verify your email.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={48} color="#10b981" style={{ margin: '0 auto 16px' }} />
              <h1 style={{ color: '#f0f0ff', fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Email Verified!</h1>
              <p style={{ color: '#9090b8', fontSize: 14, marginBottom: 28 }}>Your email has been confirmed. You can now log in.</p>
              <button
                onClick={() => navigate('/login')}
                style={{ display: 'block', width: '100%', padding: '13px', background: 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Go to Login
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
              <h1 style={{ color: '#f0f0ff', fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Verification Failed</h1>
              <p style={{ color: '#9090b8', fontSize: 14, marginBottom: 24 }}>{message || 'The link may have expired or already been used.'}</p>

              <form onSubmit={handleResend} style={{ textAlign: 'left' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,247,0.4)', display: 'block', marginBottom: 7, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Resend verification to
                </label>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={e => setResendEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', color: '#f5f5f7', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                />
                <button
                  type="submit"
                  disabled={resending || !resendEmail}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: '11px', background: resending ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: resending ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                >
                  {resending ? <><Loader size={14} /> Sending…</> : <><RefreshCw size={14} /> Resend Email</>}
                </button>
                {resendMsg && <p style={{ fontSize: '12px', color: '#10b981', marginTop: 10, textAlign: 'center' }}>{resendMsg}</p>}
              </form>
            </>
          )}

          {status === 'resend' && (
            <>
              <RefreshCw size={40} color="#6366f1" style={{ margin: '0 auto 16px' }} />
              <h1 style={{ color: '#f0f0ff', fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Resend Verification</h1>
              <p style={{ color: '#9090b8', fontSize: 14, marginBottom: 24 }}>Enter your email to receive a new verification link.</p>

              <form onSubmit={handleResend} style={{ textAlign: 'left' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,247,0.4)', display: 'block', marginBottom: 7, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={e => setResendEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', color: '#f5f5f7', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                />
                <button
                  type="submit"
                  disabled={resending || !resendEmail}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: '11px', background: resending ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: resending ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                >
                  {resending ? <><Loader size={14} /> Sending…</> : 'Send Verification Email'}
                </button>
                {resendMsg && <p style={{ fontSize: '12px', color: '#10b981', marginTop: 10, textAlign: 'center' }}>{resendMsg}</p>}
              </form>
            </>
          )}

          <p style={{ marginTop: 24, fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>
            <span style={{ cursor: 'pointer', color: '#818cf8' }} onClick={() => navigate('/login')}>Back to login</span>
          </p>
        </div>
      </div>
    </div>
  );
}
