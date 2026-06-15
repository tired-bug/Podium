import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera, Save, User, MapPin, Globe, Github, Briefcase,
  Building, Clock, Shield, Bell, Monitor, Trash2, LogOut,
  Edit2, Key, Check, X, ChevronRight,
} from 'lucide-react';
import { Card, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../contexts/ProfileContext';
import { useToast } from '../contexts/ToastContext';
import { timeAgo, parseApiError } from '../lib/utils';
import api from '../lib/api';

// ── Tunisia is UTC+1 (no DST) ─────────────────────────────────────────────────
const TIMEZONES = [
  'Africa/Tunis',
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#a855f7)',
  'linear-gradient(135deg,#22d3ee,#6366f1)',
  'linear-gradient(135deg,#10b981,#22d3ee)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#ec4899,#a855f7)',
  'linear-gradient(135deg,#14b8a6,#10b981)',
];

type Tab = 'overview' | 'edit' | 'notifications' | 'security' | 'sessions';

// ── Toggle switch ──────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-slider" />
    </label>
  );
}

// ── Animated tab content ───────────────────────────────────────────────────────
function TabPanel({ children, active }: { children: React.ReactNode; active: boolean }) {
  if (!active) return null;
  return (
    <div style={{ animation: 'tabSlideIn 220ms cubic-bezier(0.25,0.46,0.45,0.94) both' }}>
      {children}
    </div>
  );
}

// ── Avatar crop/preview modal ──────────────────────────────────────────────────
function CropModal({ src, onConfirm, onCancel }: {
  src: string; onConfirm: (dataUrl: string) => void; onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const SIZE = 256;

  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; drawCanvas(img, zoom, offsetX, offsetY); };
    img.src = src;
  }, [src]);

  const drawCanvas = (img: HTMLImageElement, z: number, ox: number, oy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    const scale = Math.max(SIZE / img.width, SIZE / img.height) * z;
    const w = img.width * scale, h = img.height * scale;
    const x = (SIZE - w) / 2 + ox, y = (SIZE - h) / 2 + oy;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();

    // Circle border
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(99,102,241,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const handleZoom = (v: number) => {
    setZoom(v);
    if (imgRef.current) drawCanvas(imgRef.current, v, offsetX, offsetY);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const ox = e.clientX - dragStart.x;
    const oy = e.clientY - dragStart.y;
    setOffsetX(ox); setOffsetY(oy);
    if (imgRef.current) drawCanvas(imgRef.current, zoom, ox, oy);
  };
  const onMouseUp = () => setDragging(false);

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onConfirm(canvas.toDataURL('image/jpeg', 0.9));
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)', padding: '28px',
        width: 360, boxShadow: 'var(--shadow-modal)',
        animation: 'scale-in 180ms ease-out',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: 4 }}>Crop Photo</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Drag to reposition · scroll or use slider to zoom</div>
        </div>

        {/* Canvas crop area */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            width={SIZE} height={SIZE}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove}
            onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            style={{
              cursor: dragging ? 'grabbing' : 'grab',
              borderRadius: '50%',
              boxShadow: '0 0 0 4px var(--border-glow), var(--glow-blue)',
            }}
          />
        </div>

        {/* Zoom slider */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>Zoom</span><span>{Math.round(zoom * 100)}%</span>
          </div>
          <input
            type="range" min="0.5" max="3" step="0.05"
            value={zoom}
            onChange={e => handleZoom(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon={<Check size={14} />} onClick={handleConfirm}>Apply Photo</Button>
        </div>
      </div>
    </div>
  );
}

// ── Avatar editor ──────────────────────────────────────────────────────────────
function AvatarEditor({ profile, username, onSaved }: {
  profile: any; username: string; onSaved: () => void;
}) {
  const { success, error: showError } = useToast();
  const { refresh: refreshProfile }   = useProfile();
  const [uploading, setUploading]     = useState(false);
  const [removing,  setRemoving]      = useState(false);
  const [cropSrc,   setCropSrc]       = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const gradIdx  = (username?.charCodeAt(0) || 0) % GRADIENTS.length;
  const initials = ((profile?.display_name || username || '?').slice(0, 2)).toUpperCase();
  const shown    = profile?.avatar || null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) { showError('Image must be under 5 MB'); return; }
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = ev => setCropSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = async (dataUrl: string) => {
    setCropSrc(null);
    setUploading(true);
    try {
      await api.put('/api/profile/avatar', { avatar: dataUrl });
      success('Profile photo updated!');
      await onSaved();
      await refreshProfile();
    } catch (err) { showError(parseApiError(err)); }
    finally { setUploading(false); }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await api.delete('/api/profile/avatar');
      success('Photo removed');
      await onSaved();
      await refreshProfile();
    } catch (err) { showError(parseApiError(err)); }
    finally { setRemoving(false); }
  };

  return (
    <>
      {cropSrc && <CropModal src={cropSrc} onConfirm={handleCropConfirm} onCancel={() => setCropSrc(null)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {/* Live preview */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              width: 96, height: 96, borderRadius: '50%', cursor: 'pointer',
              background: shown ? 'transparent' : GRADIENTS[gradIdx],
              overflow: 'hidden', position: 'relative',
              boxShadow: '0 0 0 3px var(--border-glow), var(--glow-blue)',
            }}
            onMouseEnter={e => { const ov = e.currentTarget.querySelector('.avatar-overlay') as HTMLElement; if (ov) ov.style.opacity = '1'; }}
            onMouseLeave={e => { const ov = e.currentTarget.querySelector('.avatar-overlay') as HTMLElement; if (ov) ov.style.opacity = '0'; }}
          >
            {shown
              ? <img src={shown} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '28px', fontWeight: 800, color: '#fff' }}>{initials}</span>
            }
            <div className="avatar-overlay" style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity 180ms', gap: 4,
            }}>
              {uploading
                ? <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
                : <><Camera size={20} color="#fff" /><span style={{ fontSize: '10px', color: '#fff', fontWeight: 700 }}>Change</span></>
              }
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Profile Photo</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Click the avatar or the button below to upload.<br />
            A crop &amp; zoom tool will appear before saving.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="secondary" icon={<Camera size={12} />}
              onClick={() => fileRef.current?.click()} loading={uploading}>
              Upload &amp; Crop
            </Button>
            {shown && (
              <Button size="sm" variant="ghost" icon={<Trash2 size={12} />}
                loading={removing} onClick={handleRemove}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Animated stat card ─────────────────────────────────────────────────────────
function StatCard({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <div style={{
      padding: '14px 16px', background: 'var(--bg-glass-light)',
      borderRadius: 'var(--r-md)', border: '1px solid var(--border)',
      textAlign: 'center',
      animation: `float-up 400ms ease-out ${delay}ms both`,
    }}>
      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Profile() {
  const { user, refreshUser } = useAuth();
  const { refresh: refreshProfile } = useProfile();
  const { success, error: showError } = useToast();
  const [tab, setTab]           = useState<Tab>('overview');
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [data,    setData]      = useState<any>({});
  const [form,    setForm]      = useState<any>({});
  const [sessions, setSessions] = useState<any[]>([]);
  const [pwForm,  setPwForm]    = useState({ current: '', newPw: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const { data: d } = await api.get('/api/profile');
      setData(d);
      const p = d.profile || {};
      setForm({
        username:                d.username || '',
        email:                   d.email || '',
        display_name:            p.display_name || '',
        bio:                     p.bio || '',
        job_title:               p.job_title || '',
        company:                 p.company || '',
        location:                p.location || '',
        website:                 p.website || '',
        github_username:         p.github_username || '',
        timezone:                p.timezone || 'Africa/Tunis',
        notification_deployments: p.notification_deployments !== 0,
        notification_anomalies:   p.notification_anomalies   !== 0,
        notification_team:        p.notification_team        !== 0,
        notification_email:       p.notification_email       !== 0,
      });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => {
    if (tab === 'sessions') {
      api.get('/api/profile/sessions').then(r => setSessions(r.data)).catch(() => {});
    }
  }, [tab]);

  const up = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/api/profile', form);
      success('Profile saved!');
      await fetchProfile();
      await refreshUser();
      await refreshProfile();   // update topbar display name + avatar
    } catch (err) { showError(parseApiError(err)); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (pwForm.newPw !== pwForm.confirm) { showError('Passwords do not match'); return; }
    if (pwForm.newPw.length < 8)         { showError('Password must be at least 8 characters'); return; }
    setPwLoading(true);
    try {
      await api.put('/api/auth/password', { currentPassword: pwForm.current, newPassword: pwForm.newPw });
      setPwSuccess(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
      success('Password changed!');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err) { showError(parseApiError(err)); }
    finally { setPwLoading(false); }
  };

  const p = data.profile || {};
  const displayName = p.display_name || data.username || '';
  const initials    = displayName.slice(0, 2).toUpperCase();
  const gradIdx     = (data.username?.charCodeAt(0) || 0) % GRADIENTS.length;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',      label: 'Overview',      icon: <User size={13} /> },
    { id: 'edit',          label: 'Edit Profile',  icon: <Edit2 size={13} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={13} /> },
    { id: 'security',      label: 'Security',      icon: <Shield size={13} /> },
    { id: 'sessions',      label: 'Sessions',      icon: <Monitor size={13} /> },
  ];

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 780, margin: '0 auto' }}>
      <div className="skeleton" style={{ height: 280, borderRadius: 'var(--r-xl)' }} />
      <div className="skeleton" style={{ height: 48 }} />
      <div className="skeleton" style={{ height: 200 }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Hero card ─────────────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 'var(--r-xl)', overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-lg)',
        animation: 'float-up 350ms ease-out',
      }}>
        {/* Animated banner */}
        <div style={{
          height: 110, position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
          backgroundSize: '200% 200%',
          animation: 'gradient-shift 6s ease infinite',
        }}>
          {/* Grid pattern over banner */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.15,
            backgroundImage: 'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />
          {/* Floating orbs in banner */}
          {[
            { w: 120, h: 120, t: -30, l: '10%', opacity: 0.2 },
            { w: 80,  h: 80,  t: 20,  l: '60%', opacity: 0.15 },
            { w: 60,  h: 60,  t: -10, l: '80%', opacity: 0.18 },
          ].map((o, i) => (
            <div key={i} style={{
              position: 'absolute', top: o.t, left: o.l,
              width: o.w, height: o.h, borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(10px)',
              opacity: o.opacity,
              animation: `orbit ${8 + i * 3}s linear infinite`,
            }} />
          ))}
        </div>

        <div style={{ padding: '0 28px 24px' }}>
          {/* Avatar row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -48 }}>
            {/* Avatar */}
            <div style={{
              width: 90, height: 90, borderRadius: '50%',
              background: p.avatar ? 'transparent' : GRADIENTS[gradIdx],
              border: '4px solid var(--bg-card)',
              overflow: 'hidden', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 2px var(--border-glow), var(--glow-blue)',
              animation: 'scale-in 400ms cubic-bezier(0.34,1.56,0.64,1) 100ms both',
            }}>
              {p.avatar
                ? <img src={p.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '26px', fontWeight: 800, color: '#fff' }}>{initials}</span>
              }
            </div>

            <Button variant="secondary" size="sm" icon={<Edit2 size={13} />}
              onClick={() => setTab('edit')}
              style={{ animation: 'float-up 300ms ease-out 200ms both' }}>
              Edit Profile
            </Button>
          </div>

          {/* User info */}
          <div style={{ marginTop: 16, animation: 'float-up 300ms ease-out 150ms both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                {displayName || data.username}
              </h2>
              <span style={{
                fontSize: '11px', fontWeight: 700, padding: '2px 10px',
                borderRadius: 'var(--r-pill)', textTransform: 'capitalize',
                background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(168,85,247,0.2))',
                color: 'var(--accent-blue-2)',
                border: '1px solid rgba(99,102,241,0.3)',
              }}>
                {data.role}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: 10 }}>@{data.username}</div>

            {p.bio && (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 12, maxWidth: 500 }}>
                {p.bio}
              </p>
            )}

            {/* Meta pills */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {p.job_title && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <Briefcase size={11} color="var(--text-muted)" />{p.job_title}{p.company && ` @ ${p.company}`}
                </span>
              )}
              {p.location && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <MapPin size={11} color="var(--text-muted)" />{p.location}
                </span>
              )}
              {p.timezone && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <Clock size={11} color="var(--text-muted)" />{p.timezone}
                </span>
              )}
              {p.website && (
                <a href={p.website} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', color: 'var(--accent-blue-2)' }}>
                  <Globe size={11} />{p.website.replace(/https?:\/\//, '')}
                </a>
              )}
              {p.github_username && (
                <a href={`https://github.com/${p.github_username}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', color: 'var(--accent-blue-2)' }}>
                  <Github size={11} />@{p.github_username}
                </a>
              )}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 20 }}>
            <StatCard label="Member since" value={timeAgo(data.created_at)} delay={200} />
            <StatCard label="Last login"   value={data.last_login ? timeAgo(data.last_login) : 'Just now'} delay={260} />
            <StatCard label="Role"         value={data.role || ''} delay={320} />
          </div>
        </div>
      </div>

      {/* ── Tab selector ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap',
        animation: 'float-up 300ms ease-out 250ms both',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 'var(--r-pill)',
              background: tab === t.id
                ? 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))'
                : 'var(--bg-card)',
              color: tab === t.id ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${tab === t.id ? 'transparent' : 'var(--border)'}`,
              fontSize: '12px', fontWeight: tab === t.id ? 700 : 500,
              cursor: 'pointer', transition: 'all 200ms cubic-bezier(0.25,0.46,0.45,0.94)',
              fontFamily: 'var(--font-sans)',
              boxShadow: tab === t.id ? 'var(--glow-blue)' : 'none',
              transform: tab === t.id ? 'scale(1.03)' : 'scale(1)',
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
      <TabPanel active={tab === 'overview'}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            {
              title: 'Account Info',
              rows: [
                ['Username', data.username],
                ['Email', data.email],
                ['Role', data.role],
                ['Timezone', p.timezone || 'Africa/Tunis'],
              ],
            },
            {
              title: 'Notification Preferences',
              rows: [
                ['Deployment events', p.notification_deployments !== 0 ? 'On' : 'Off'],
                ['Anomaly alerts',    p.notification_anomalies   !== 0 ? 'On' : 'Off'],
                ['Team activity',     p.notification_team        !== 0 ? 'On' : 'Off'],
                ['Email digest',      p.notification_email       !== 0 ? 'On' : 'Off'],
              ],
              isNotif: true,
            },
          ].map((card, ci) => (
            <Card key={ci} style={{ animation: `float-up 300ms ease-out ${ci * 80}ms both` }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 14, color: 'var(--text-primary)' }}>{card.title}</div>
              {card.rows.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-muted)', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{
                    color: (card as any).isNotif
                      ? (v === 'On' ? 'var(--accent-green)' : 'var(--text-muted)')
                      : 'var(--text-primary)',
                    fontWeight: 500, textTransform: 'capitalize',
                    fontSize: (card as any).isNotif ? '11px' : '13px',
                    padding: (card as any).isNotif ? '2px 8px' : '0',
                    borderRadius: (card as any).isNotif ? 'var(--r-pill)' : '0',
                    background: (card as any).isNotif
                      ? (v === 'On' ? 'var(--accent-green-dim)' : 'var(--bg-elevated)')
                      : 'transparent',
                  }}>
                    {v}
                  </span>
                </div>
              ))}
            </Card>
          ))}
        </div>
      </TabPanel>

      {/* ── EDIT PROFILE ──────────────────────────────────────────────────── */}
      <TabPanel active={tab === 'edit'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Avatar editor */}
          <Card style={{ animation: 'float-up 250ms ease-out' }}>
            <AvatarEditor profile={p} username={data.username} onSaved={fetchProfile} />
          </Card>

          {/* Basic info */}
          <Card style={{ animation: 'float-up 250ms ease-out 60ms both' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Basic Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Input label="Display Name"  value={form.display_name}    onChange={e => up('display_name', e.target.value)}    placeholder="Your full name" />
              <Input label="Username"      value={form.username}        onChange={e => up('username', e.target.value)}         placeholder="username" />
              <Input label="Email"         value={form.email}           onChange={e => up('email', e.target.value)}            placeholder="you@company.com" type="email" />
              <Input label="Job Title"     value={form.job_title}       onChange={e => up('job_title', e.target.value)}        placeholder="Senior DevOps Engineer" />
              <Input label="Company"       value={form.company}         onChange={e => up('company', e.target.value)}          placeholder="Acme Corp" icon={<Building size={13} />} />
              <Input label="Location"      value={form.location}        onChange={e => up('location', e.target.value)}         placeholder="Tunis, Tunisia"  icon={<MapPin size={13} />} />
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Bio</label>
              <textarea
                value={form.bio}
                onChange={e => up('bio', e.target.value)}
                placeholder="Tell your team about yourself..."
                rows={3}
                style={{
                  width: '100%', padding: '8px 12px',
                  background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                  fontSize: '13px', fontFamily: 'var(--font-sans)',
                  outline: 'none', resize: 'vertical', lineHeight: 1.6,
                  transition: 'border-color 150ms',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--accent-blue)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
          </Card>

          {/* Links & timezone */}
          <Card style={{ animation: 'float-up 250ms ease-out 120ms both' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Links & Timezone</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Input label="Website"         value={form.website}         onChange={e => up('website', e.target.value)}         placeholder="https://yoursite.com" icon={<Globe size={13} />} />
              <Input label="GitHub Username" value={form.github_username} onChange={e => up('github_username', e.target.value)} placeholder="github-handle"         icon={<Github size={13} />} />
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Timezone</label>
                <select value={form.timezone} onChange={e => up('timezone', e.target.value)}
                  style={{
                    width: '100%', padding: '7px 10px',
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                    border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                    fontSize: '13px', outline: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  }}>
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>
                      {tz === 'Africa/Tunis' ? '🇹🇳 Africa/Tunis (UTC+1)' : tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Button variant="primary" icon={<Save size={14} />} loading={saving} onClick={handleSave}
            style={{ alignSelf: 'flex-start', padding: '9px 28px', animation: 'float-up 250ms ease-out 180ms both' }}>
            Save Changes
          </Button>
        </div>
      </TabPanel>

      {/* ── NOTIFICATIONS ─────────────────────────────────────────────────── */}
      <TabPanel active={tab === 'notifications'}>
        <Card style={{ animation: 'float-up 250ms ease-out' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: 4 }}>Notification Preferences</div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 20 }}>
            Choose which events create notifications in your inbox.
          </p>
          {[
            { key: 'notification_deployments', label: 'Deployment events',  desc: 'Start, success, and failure alerts' },
            { key: 'notification_anomalies',   label: 'Anomaly alerts',     desc: 'CPU and memory threshold breaches' },
            { key: 'notification_team',        label: 'Team activity',      desc: 'New members and role changes' },
            { key: 'notification_email',       label: 'Email notifications', desc: 'Critical alerts sent to your email' },
          ].map((item, i) => (
            <div key={item.key} className="settings-item"
              style={{ animation: `float-up 250ms ease-out ${i * 50}ms both` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{item.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>{item.desc}</div>
              </div>
              <Toggle checked={form[item.key]} onChange={v => up(item.key, v)} />
            </div>
          ))}
          <div style={{ marginTop: 20 }}>
            <Button variant="primary" icon={<Save size={13} />} loading={saving} onClick={handleSave}>
              Save Preferences
            </Button>
          </div>
        </Card>
      </TabPanel>

      {/* ── SECURITY ──────────────────────────────────────────────────────── */}
      <TabPanel active={tab === 'security'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ animation: 'float-up 250ms ease-out' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: 16 }}>Change Password</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 400 }}>
              <Input label="Current Password"  type="password" value={pwForm.current}  onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} />
              <Input label="New Password"      type="password" value={pwForm.newPw}    onChange={e => setPwForm(p => ({ ...p, newPw: e.target.value }))}  hint="Minimum 8 characters" />
              <Input label="Confirm Password"  type="password" value={pwForm.confirm}  onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} />
              {pwForm.newPw && pwForm.confirm && pwForm.newPw !== pwForm.confirm && (
                <p style={{ fontSize: '12px', color: 'var(--accent-red)', margin: 0 }}>Passwords do not match</p>
              )}
              <Button variant="primary" icon={pwSuccess ? <Check size={14} /> : <Key size={14} />}
                loading={pwLoading} onClick={handleChangePassword}
                style={{ alignSelf: 'flex-start', background: pwSuccess ? 'var(--accent-green)' : undefined }}>
                {pwSuccess ? 'Password Changed!' : 'Update Password'}
              </Button>
            </div>
          </Card>

          <Card style={{ borderColor: 'rgba(239,68,68,0.3)', animation: 'float-up 250ms ease-out 80ms both' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-red)', marginBottom: 6 }}>Danger Zone</div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
              Sign out of all sessions across all devices.
            </p>
            <Button size="sm" variant="danger" icon={<LogOut size={13} />}
              onClick={() => { if (confirm('Sign out of all sessions?')) api.post('/api/auth/signout-all').catch(() => {}); }}>
              Sign Out All Devices
            </Button>
          </Card>
        </div>
      </TabPanel>

      {/* ── SESSIONS ──────────────────────────────────────────────────────── */}
      <TabPanel active={tab === 'sessions'}>
        <Card style={{ animation: 'float-up 250ms ease-out' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: 16 }}>Active Sessions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Loading sessions...
              </div>
            ) : sessions.map((s, i) => (
              <div key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', background: 'var(--bg-elevated)',
                  borderRadius: 'var(--r-md)', border: '1px solid var(--border)',
                  animation: `float-up 250ms ease-out ${i * 60}ms both`,
                }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <Monitor size={20} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {s.device}
                      {s.current && (
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--r-pill)', background: 'var(--accent-green-dim)', color: 'var(--accent-green)' }}>
                          Current
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                      {s.ip} · Last active {timeAgo(s.lastActive)}
                    </div>
                  </div>
                </div>
                {!s.current && <Button size="sm" variant="danger">Revoke</Button>}
              </div>
            ))}
          </div>
        </Card>
      </TabPanel>
    </div>
  );
}
