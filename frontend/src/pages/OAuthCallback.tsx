import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Spinner } from '../components/ui/Badge';

export default function OAuthCallback() {
  const { loginWithToken } = useAuth();
  const { success } = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const err = params.get('error');

    if (err) {
      setError(err);
      return;
    }
    if (!token) {
      setError('No sign-in token was returned. Please try again.');
      return;
    }

    loginWithToken(token)
      .then(() => {
        success('Signed in successfully');
        navigate('/dashboard', { replace: true });
      })
      .catch(() => setError('Could not complete sign-in. Please try again.'));
  }, [loginWithToken, navigate, success]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#000', color: '#f5f5f7',
      fontFamily: "'Inter', -apple-system, sans-serif", gap: 16, padding: 24, textAlign: 'center',
    }}>
      {error ? (
        <>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,69,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={22} color="#ff453a" />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: 6 }}>Sign-in failed</div>
            <div style={{ fontSize: '13px', color: 'rgba(245,245,247,0.5)', maxWidth: 320 }}>{error}</div>
          </div>
          <button
            onClick={() => navigate('/login', { replace: true })}
            style={{
              marginTop: 8, padding: '9px 18px', borderRadius: 10, border: 'none',
              background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: '13px',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <Spinner size={26} color="#6366f1" />
          <span style={{ fontSize: '13px', color: 'rgba(245,245,247,0.4)' }}>Finishing sign-in…</span>
        </>
      )}
    </div>
  );
}
