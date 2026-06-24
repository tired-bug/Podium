import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const h = () => setY(window.scrollY);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);
  return y;
}

const FEATURES = [
  {
    label: 'Multi-Cloud',
    title: 'Deploy anywhere. Control everything.',
    body: 'Render, Railway, Vercel, AWS, Azure, GCP — unified under a single orchestration layer. Switch providers in seconds.',
  },
  {
    label: 'AIOps',
    title: 'Intelligence built into every workflow.',
    body: 'LLaMA 3 70B reads your logs, detects anomalies, and fixes failures before your team notices them.',
  },
  {
    label: 'FinOps',
    title: 'Spend less. Deploy more.',
    body: 'Real-time cost analysis across all clouds. Identify waste, set budgets, and enforce cost policies automatically.',
  },
  {
    label: 'Security',
    title: 'Role-based from day one.',
    body: 'Admin, Developer, Viewer. Invite-based onboarding with JWT auth and bcrypt. No bolt-ons.',
  },
];

const METRICS = [
  { value: '4', unit: 'cloud providers', desc: 'supported out of the box' },
  { value: '<2s', unit: 'deployment time', desc: 'for container workloads' },
  { value: '99.9%', unit: 'uptime SLA', desc: 'across monitored deployments' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const scrollY = useScrollY();
  const [activeFeature, setActiveFeature] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);

  const navOpaque = scrollY > 40;

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      background: '#000',
      color: '#f5f5f7',
      minHeight: '100vh',
      overflowX: 'hidden',
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* ── Navbar ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 52,
        background: navOpaque ? 'rgba(0,0,0,0.88)' : 'transparent',
        backdropFilter: navOpaque ? 'blur(20px)' : 'none',
        WebkitBackdropFilter: navOpaque ? 'blur(20px)' : 'none',
        borderBottom: navOpaque ? '1px solid rgba(255,255,255,0.07)' : 'none',
        transition: 'background 300ms, border-color 300ms, backdrop-filter 300ms',
        display: 'flex', alignItems: 'center',
        padding: '0 32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: '#6366f1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.06em', color: '#f5f5f7' }}>PODIUM</span>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {['Features', 'Docs', 'GitHub'].map(item => (
            <a key={item} href="#" style={{
              fontSize: '13px', color: 'rgba(245,245,247,0.6)',
              textDecoration: 'none', transition: 'color 120ms',
              letterSpacing: '-0.01em',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f5f5f7')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(245,245,247,0.6)')}
            >{item}</a>
          ))}
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '7px 16px',
              background: '#fff',
              color: '#000',
              border: 'none',
              borderRadius: 980,
              fontSize: '13px', fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '-0.01em',
              transition: 'background 120ms, transform 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section ref={heroRef} style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '120px 32px 80px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle gradient orb */}
        <div style={{
          position: 'absolute', top: '15%', left: '50%',
          transform: 'translateX(-50%)',
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px',
          border: '1px solid rgba(99,102,241,0.35)',
          borderRadius: 980,
          fontSize: '12px', color: '#818cf8',
          fontWeight: 500,
          marginBottom: 32,
          animation: 'fadeUp 600ms ease-out both',
          letterSpacing: '-0.01em',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
          AIOps + FinOps + Multi-Cloud Orchestration
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 'clamp(40px, 6vw, 76px)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 1.08,
          textAlign: 'center',
          maxWidth: 780,
          marginBottom: 24,
          animation: 'fadeUp 600ms ease-out 80ms both',
          color: '#f5f5f7',
        }}>
          The platform your<br />
          <span style={{
            background: 'linear-gradient(135deg, #818cf8 0%, #a855f7 50%, #ec4899 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            infrastructure deserves
          </span>
        </h1>

        {/* Sub */}
        <p style={{
          fontSize: '18px',
          color: 'rgba(245,245,247,0.5)',
          textAlign: 'center',
          maxWidth: 520,
          lineHeight: 1.6,
          marginBottom: 48,
          animation: 'fadeUp 600ms ease-out 160ms both',
          letterSpacing: '-0.01em',
          fontWeight: 400,
        }}>
          Deploy to any cloud, monitor with AI, and control costs — all from one interface.
        </p>

        {/* CTAs */}
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
          animation: 'fadeUp 600ms ease-out 240ms both',
        }}>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '13px 28px',
              background: '#6366f1',
              color: '#fff',
              border: 'none', borderRadius: 980,
              fontSize: '15px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              letterSpacing: '-0.01em',
              transition: 'background 150ms, transform 150ms, box-shadow 150ms',
              boxShadow: '0 0 0 0 rgba(99,102,241,0)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#5457e8';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(99,102,241,0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#6366f1';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 0 0 0 rgba(99,102,241,0)';
            }}
          >
            Try Demo
          </button>
          <button
            style={{
              padding: '13px 28px',
              background: 'transparent',
              color: 'rgba(245,245,247,0.7)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 980,
              fontSize: '15px', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
              letterSpacing: '-0.01em',
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)';
              e.currentTarget.style.color = '#f5f5f7';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.color = 'rgba(245,245,247,0.7)';
            }}
          >
            View docs
          </button>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          opacity: 0.3, animation: 'fadeUp 600ms ease-out 600ms both',
        }}>
          <div style={{ width: 1, height: 40, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.4))' }} />
        </div>
      </section>

      {/* ── Metrics strip ── */}
      <section style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '48px 32px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 1,
        background: 'rgba(255,255,255,0.03)',
      }}>
        {METRICS.map((m, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0 24px',
            borderRight: i < METRICS.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
          }}>
            <div style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#f5f5f7' }}>
              {m.value}
            </div>
            <div style={{ fontSize: '13px', color: '#818cf8', fontWeight: 500, marginTop: 6, letterSpacing: '-0.01em' }}>{m.unit}</div>
            <div style={{ fontSize: '12px', color: 'rgba(245,245,247,0.35)', marginTop: 4, letterSpacing: '-0.01em' }}>{m.desc}</div>
          </div>
        ))}
      </section>

      {/* ── Features ── */}
      <section style={{ padding: '100px 32px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <p style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em', color: '#6366f1', textTransform: 'uppercase', marginBottom: 12 }}>
            Capabilities
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#f5f5f7', lineHeight: 1.1 }}>
            Built for production from day one
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              style={{
                padding: '44px 40px',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: i === 0 ? '16px 0 0 0' : i === 1 ? '0 16px 0 0' : i === 2 ? '0 0 0 16px' : '0 0 16px 0',
                background: 'rgba(255,255,255,0.02)',
                cursor: 'default',
                transition: 'background 200ms',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
            >
              <div style={{
                display: 'inline-block',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#6366f1',
                marginBottom: 16,
              }}>
                {f.label}
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12, lineHeight: 1.25, color: '#f5f5f7' }}>
                {f.title}
              </h3>
              <p style={{ fontSize: '14px', color: 'rgba(245,245,247,0.45)', lineHeight: 1.65, letterSpacing: '-0.01em' }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA section ── */}
      <section style={{
        padding: '100px 32px 120px',
        textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: '50%',
          transform: 'translateX(-50%)',
          width: 500, height: 300,
          background: 'radial-gradient(ellipse at top, rgba(99,102,241,0.10) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: 16, lineHeight: 1.1, color: '#f5f5f7' }}>
          Ready to deploy?
        </h2>
        <p style={{ fontSize: '16px', color: 'rgba(245,245,247,0.4)', marginBottom: 40, letterSpacing: '-0.01em' }}>
          Start orchestrating your infrastructure in minutes.
        </p>
        <button
          onClick={() => navigate('/login')}
          style={{
            padding: '14px 32px',
            background: '#fff',
            color: '#000',
            border: 'none', borderRadius: 980,
            fontSize: '15px', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            letterSpacing: '-0.01em',
            transition: 'background 150ms, transform 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'scale(1)'; }}
        >
          Get started
        </button>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '28px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 18, height: 18, borderRadius: 5, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(245,245,247,0.4)' }}>PODIUM</span>
        </div>
        <span style={{ fontSize: '12px', color: 'rgba(245,245,247,0.2)' }}>v4.0 — Open source AIOps platform</span>
      </footer>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
