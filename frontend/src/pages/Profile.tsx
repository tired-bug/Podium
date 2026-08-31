import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera, Save, User, MapPin, Globe, Github, Briefcase,
  Building, Clock, Shield, Bell, Monitor, Trash2, LogOut,
  Edit2, Key, Check, X, ChevronRight, Flag, Terminal, LayoutGrid,
  Lock, Plus, Copy, Cloud, ShieldCheck, Smartphone, Bot, Server,
  RefreshCw, Database, Cpu, Activity, BarChart2, Zap, Users, Eye, EyeOff,
} from 'lucide-react';
import { Card, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../contexts/ProfileContext';
import { useToast } from '../contexts/ToastContext';
import { timeAgo, parseApiError } from '../lib/utils';
import { useSearchParams } from 'react-router-dom';
import Team from './Team';
import api from '../lib/api';

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

type Tab = 'account' | 'notifications' | 'feature-flags' | 'tokens' | 'ssh-keys' | 'apps' | 'security' | 'platform' | 'ai' | 'system' | 'team';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-slider" />
    </label>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border-muted)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{description}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function PlatformSection({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
        {description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{description}</div>}
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </Card>
  );
}

function MaskedInput({ settingKey, label, placeholder, hint, local, update }: {
  settingKey: string; label: string; placeholder: string;
  hint?: string; local: Record<string, string>; update: (k: string, v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const isMasked = local[settingKey] === '***masked***';
  return (
    <Input
      label={label}
      type={show ? 'text' : 'password'}
      value={isMasked ? '' : (local[settingKey] || '')}
      onChange={e => update(settingKey, e.target.value)}
      placeholder={isMasked ? '••••• (leave empty to keep current)' : placeholder}
      hint={hint}
      iconRight={
        <button type="button" onClick={() => setShow(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      }
    />
  );
}

function TabPanel({ children, active }: { children: React.ReactNode; active: boolean }) {
  if (!active) return null;
  return (
    <div style={{ animation: 'tabSlideIn 220ms cubic-bezier(0.25,0.46,0.45,0.94) both' }}>
      {children}
    </div>
  );
}

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

    
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    const scale = Math.max(SIZE / img.width, SIZE / img.height) * z;
    const w = img.width * scale, h = img.height * scale;
    const x = (SIZE - w) / 2 + ox, y = (SIZE - h) / 2 + oy;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();

    
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

        {}
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

        {}
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

        {}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon={<Check size={14} />} onClick={handleConfirm}>Apply Photo</Button>
        </div>
      </div>
    </div>
  );
}

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
        {}
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
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Profile Photo</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.5 }}>
            Click the avatar to upload a new photo. JPG, PNG or GIF, up to 5MB.
          </div>
          {shown && (
            <Button
              size="sm" variant="ghost" icon={<Trash2 size={13} />}
              loading={removing} onClick={handleRemove}
              style={{ alignSelf: 'flex-start', color: 'var(--accent-red)' }}
            >
              Remove Photo
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, delay = 0 }: { label: string; value: string; delay?: number }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 'var(--r-md)',
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      animation: `float-up 300ms ease-out ${delay}ms both`,
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{value}</div>
    </div>
  );
}

// ── Feature Flags tab ────────────────────────────────────────────────────

function FeatureFlagsPanel() {
  const { error: showError } = useToast();
  const { user } = useAuth();
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/api/account/feature-flags'); setFlags(data); }
    catch (err) { showError(parseApiError(err)); }
    finally { setLoading(false); }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key: string, enabled: boolean) => {
    setFlags(f => f.map(fl => fl.key === key ? { ...fl, enabled: enabled ? 1 : 0 } : fl));
    try { await api.put(`/api/account/feature-flags/${key}`, { enabled }); }
    catch (err) { showError(parseApiError(err)); load(); }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <Card style={{ animation: 'float-up 250ms ease-out' }}>
      <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: 4 }}>Feature Flags</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 20 }}>
        {isAdmin ? 'Toggle experimental and in-progress features on this platform.' : 'Current state of experimental features. Only admins can change these.'}
      </p>
      {loading ? <Skeleton height={160} /> : flags.map((f, i) => (
        <div key={f.key} className="settings-item" style={{ animation: `float-up 250ms ease-out ${i * 50}ms both` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{f.label}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>{f.description}</div>
          </div>
          <Toggle checked={!!f.enabled} onChange={v => isAdmin && toggle(f.key, v)} />
        </div>
      ))}
    </Card>
  );
}

// ── API Tokens tab ───────────────────────────────────────────────────────

function TokensPanel() {
  const { success, error: showError } = useToast();
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState('read');
  const [reveal, setReveal] = useState<any>(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/api/account/tokens'); setTokens(data); }
    catch (err) { showError(parseApiError(err)); }
    finally { setLoading(false); }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!name.trim()) { showError('Give the token a name'); return; }
    setCreating(true);
    try {
      const { data } = await api.post('/api/account/tokens', { name: name.trim(), scopes });
      setReveal(data); setName(''); load();
    } catch (err) { showError(parseApiError(err)); }
    finally { setCreating(false); }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this token? Anything using it will stop working immediately.')) return;
    try { await api.delete(`/api/account/tokens/${id}`); success('Token revoked'); load(); }
    catch (err) { showError(parseApiError(err)); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ animation: 'float-up 250ms ease-out' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: 4 }}>New Personal Access Token</div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 16 }}>Use tokens to authenticate API requests as yourself.</p>
        {reveal ? (
          <div style={{ padding: '12px 14px', background: 'var(--accent-green-dim)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 'var(--r-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 600 }}>Copy this token now — it won't be shown again.</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', overflowX: 'auto' }}>{reveal.token}</code>
              <Button size="sm" icon={<Copy size={12} />} onClick={() => { navigator.clipboard.writeText(reveal.token); success('Copied'); }}>Copy</Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setReveal(null)} style={{ alignSelf: 'flex-start' }}>Done</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Input label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CI pipeline" wrapStyle={{ flex: 1, minWidth: 180 }} />
            <Select label="Scope" value={scopes} onChange={e => setScopes(e.target.value)}
              options={[{ value: 'read', label: 'Read only' }, { value: 'read_write', label: 'Read & write' }]} wrapStyle={{ minWidth: 160 }} />
            <Button variant="primary" icon={<Plus size={13} />} loading={creating} onClick={handleCreate}>Generate token</Button>
          </div>
        )}
      </Card>

      <Card style={{ padding: 0, animation: 'float-up 250ms ease-out 60ms both' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>Active Tokens</div>
        {loading ? <div style={{ padding: 16 }}><Skeleton height={48} /></div> : tokens.length === 0 ? (
          <div style={{ padding: '28px 18px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No tokens yet</div>
        ) : tokens.map((t, i) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: i < tokens.length - 1 ? '1px solid var(--border-muted)' : 'none' }}>
            <Key size={15} color="var(--text-muted)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.token_prefix}… · {t.scopes} · {t.last_used_at ? `used ${timeAgo(t.last_used_at)}` : 'never used'}</div>
            </div>
            <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => handleRevoke(t.id)} style={{ color: 'var(--accent-red)' }}>Revoke</Button>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ── SSH Keys tab ─────────────────────────────────────────────────────────

function SSHKeysPanel() {
  const { success, error: showError } = useToast();
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [pubKey, setPubKey] = useState('');

  const load = useCallback(async () => {
    try { const { data } = await api.get('/api/account/ssh-keys'); setKeys(data); }
    catch (err) { showError(parseApiError(err)); }
    finally { setLoading(false); }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!title.trim() || !pubKey.trim()) { showError('Title and public key are required'); return; }
    setAdding(true);
    try {
      await api.post('/api/account/ssh-keys', { title: title.trim(), public_key: pubKey.trim() });
      success('SSH key added'); setTitle(''); setPubKey(''); load();
    } catch (err) { showError(parseApiError(err)); }
    finally { setAdding(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this SSH key?')) return;
    try { await api.delete(`/api/account/ssh-keys/${id}`); success('Key removed'); load(); }
    catch (err) { showError(parseApiError(err)); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ animation: 'float-up 250ms ease-out' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: 4 }}>New SSH Key</div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 16 }}>Paste a public key (ssh-ed25519, ssh-rsa…) to use for git access.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Work laptop" />
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Public key</label>
            <textarea value={pubKey} onChange={e => setPubKey(e.target.value)} placeholder="ssh-ed25519 AAAA..." rows={3}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: 12.5, fontFamily: 'var(--font-mono)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <Button variant="primary" icon={<Plus size={13} />} loading={adding} onClick={handleAdd} style={{ alignSelf: 'flex-start' }}>Add key</Button>
        </div>
      </Card>

      <Card style={{ padding: 0, animation: 'float-up 250ms ease-out 60ms both' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>Your Keys</div>
        {loading ? <div style={{ padding: 16 }}><Skeleton height={48} /></div> : keys.length === 0 ? (
          <div style={{ padding: '28px 18px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No SSH keys yet</div>
        ) : keys.map((k, i) => (
          <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: i < keys.length - 1 ? '1px solid var(--border-muted)' : 'none' }}>
            <Terminal size={15} color="var(--text-muted)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{k.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{k.key_type} · {k.fingerprint} · added {timeAgo(k.created_at)}</div>
            </div>
            <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => handleDelete(k.id)} style={{ color: 'var(--accent-red)' }}>Remove</Button>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ── Apps (connected integrations) tab ───────────────────────────────────

function AppsPanel() {
  const { success, error: showError } = useToast();
  const [github, setGithub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/api/github/account'); setGithub(data); }
    catch { setGithub(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const disconnect = async () => {
    if (!confirm('Disconnect your GitHub account?')) return;
    setDisconnecting(true);
    try { await api.delete('/api/github/account'); success('GitHub disconnected'); load(); }
    catch (err) { showError(parseApiError(err)); }
    finally { setDisconnecting(false); }
  };

  return (
    <Card style={{ padding: 0, animation: 'float-up 250ms ease-out' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>Connected Apps</div>
      {loading ? <div style={{ padding: 16 }}><Skeleton height={48} /></div> : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Github size={18} color="var(--text-primary)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>GitHub</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {github?.github_login ? <>Connected as @{github.github_login}</> : 'Not connected — link an account from the Deployments page to enable repo access'}
            </div>
          </div>
          {github?.github_login ? (
            <Button size="sm" variant="ghost" icon={<X size={13} />} loading={disconnecting} onClick={disconnect} style={{ color: 'var(--accent-red)' }}>Disconnect</Button>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Not connected</span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderTop: '1px solid var(--border-muted)' }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Cloud size={18} color="var(--text-primary)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Cloud Providers</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Manage AWS, GCP, and other provider connections from the Providers page</div>
        </div>
      </div>
    </Card>
  );
}

export default function Profile() {
  const { success, error: showError } = useToast();
  const { isAdmin } = useAuth();
  const { refresh: refreshProfile } = useProfile();
  const [data, setData]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'account';
  const [tab, setTabState] = useState<Tab>(initialTab);
  // Sidebar links point at /profile?tab=X — since that's the same route, React
  // Router won't remount this component when jumping between tabs, so keep
  // local state in sync with the URL whenever it changes underneath us.
  useEffect(() => {
    const urlTab = (searchParams.get('tab') as Tab) || 'account';
    setTabState(prev => (prev === urlTab ? prev : urlTab));
  }, [searchParams]);
  const setTab = (t: Tab) => {
    setTabState(t);
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('tab', t); return next; }, { replace: true });
  };
  const [saving, setSaving] = useState(false);
  const [form, setForm]   = useState<Record<string, any>>({});
  const [sessions, setSessions] = useState<any[]>([]);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaSetup, setTwoFaSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [disablePw, setDisablePw] = useState('');
  const [disablingTwoFa, setDisablingTwoFa] = useState(false);
  const [platformSettings, setPlatformSettings] = useState<Record<string, string>>({});
  const [platformLocal, setPlatformLocal] = useState<Record<string, string>>({});
  const [platformSaving, setPlatformSaving] = useState(false);
  const [health, setHealth] = useState<any>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/api/profile');
      setData(data);
      const prof = data.profile || {};
      setForm({
        display_name: prof.display_name || '',
        username: data.username || '',
        email: data.email || '',
        job_title: prof.job_title || '',
        company: prof.company || '',
        location: prof.location || '',
        bio: prof.bio || '',
        website: prof.website || '',
        github_username: prof.github_username || '',
        timezone: prof.timezone || 'Africa/Tunis',
        notification_email: prof.notification_email !== 0,
        notification_deployments: prof.notification_deployments !== 0,
        notification_anomalies: prof.notification_anomalies !== 0,
        notification_team: prof.notification_team !== 0,
      });
    } catch (err) { showError(parseApiError(err)); }
    finally { setLoading(false); }
  }, [showError]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  useEffect(() => {
    api.get('/api/profile/sessions').then(r => setSessions(r.data)).catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    api.get('/api/auth/2fa').then(r => setTwoFaEnabled(!!r.data.enabled)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/api/settings').then(r => { setPlatformSettings(r.data); setPlatformLocal(r.data); }).catch(() => {});
    api.get('/api/health').then(r => setHealth(r.data)).catch(() => {});
  }, [isAdmin]);

  const updatePlatform = (k: string, v: string) => setPlatformLocal(p => ({ ...p, [k]: v }));

  const savePlatformSettings = async (subset?: Record<string, string>) => {
    setPlatformSaving(true);
    try {
      await api.put('/api/settings', subset || platformLocal);
      success('Settings saved');
      const { data } = await api.get('/api/settings');
      setPlatformSettings(data); setPlatformLocal(data);
    } catch (err) { showError(parseApiError(err)); }
    finally { setPlatformSaving(false); }
  };

  const startTwoFaSetup = async () => {
    setTwoFaLoading(true);
    try {
      const { data } = await api.post('/api/auth/2fa/setup');
      setTwoFaSetup(data);
    } catch (err) { showError(parseApiError(err)); }
    finally { setTwoFaLoading(false); }
  };

  const confirmTwoFaSetup = async () => {
    if (!twoFaCode) return;
    setTwoFaLoading(true);
    try {
      await api.post('/api/auth/2fa/verify', { code: twoFaCode });
      setTwoFaEnabled(true);
      setTwoFaSetup(null);
      setTwoFaCode('');
      success('Two-factor authentication enabled');
    } catch (err) { showError(parseApiError(err)); }
    finally { setTwoFaLoading(false); }
  };

  const cancelTwoFaSetup = () => { setTwoFaSetup(null); setTwoFaCode(''); };

  const disableTwoFa = async () => {
    if (!disablePw) return;
    setDisablingTwoFa(true);
    try {
      await api.post('/api/auth/2fa/disable', { password: disablePw });
      setTwoFaEnabled(false);
      setDisablePw('');
      success('Two-factor authentication disabled');
    } catch (err) { showError(parseApiError(err)); }
    finally { setDisablingTwoFa(false); }
  };

  const up = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/api/profile', form);
      success('Profile updated');
      await fetchProfile();
      await refreshProfile();
    } catch (err) { showError(parseApiError(err)); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (pwForm.newPw !== pwForm.confirm) { showError('Passwords do not match'); return; }
    setPwLoading(true); setPwSuccess(false);
    try {
      await api.put('/api/auth/password', { currentPassword: pwForm.current, newPassword: pwForm.newPw });
      setPwSuccess(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err) { showError(parseApiError(err)); }
    finally { setPwLoading(false); }
  };

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Skeleton height={180} />
        <Skeleton height={48} />
        <Skeleton height={240} />
      </div>
    );
  }

  const p = data.profile || {};
  const displayName = p.display_name;
  const gradIdx  = (data.username?.charCodeAt(0) || 0) % GRADIENTS.length;
  const initials = ((displayName || data.username || '?').slice(0, 2)).toUpperCase();

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'account',       label: 'Settings',      icon: <User size={15} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
    { id: 'feature-flags', label: 'Feature Flags', icon: <Flag size={15} /> },
    { id: 'tokens',        label: 'Tokens',        icon: <Key size={15} /> },
    { id: 'ssh-keys',      label: 'SSH Keys',      icon: <Terminal size={15} /> },
    { id: 'apps',          label: 'Apps',          icon: <LayoutGrid size={15} /> },
    { id: 'security',      label: 'Security',      icon: <Lock size={15} /> },
    ...(isAdmin ? [
      { id: 'team'     as Tab, label: 'Team',     icon: <Users size={15} /> },
      { id: 'platform' as Tab, label: 'Platform', icon: <Globe size={15} /> },
      { id: 'ai'       as Tab, label: 'AI',       icon: <Bot size={15} /> },
      { id: 'system'   as Tab, label: 'System',   icon: <Server size={15} /> },
    ] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        borderRadius: 'var(--r-xl)', overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-lg)',
        animation: 'float-up 350ms ease-out',
      }}>
        {}
        <div style={{
          height: 110, position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
          backgroundSize: '200% 200%',
          animation: 'gradient-shift 6s ease infinite',
        }}>
          {}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.15,
            backgroundImage: 'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />
          {}
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
          {}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -48 }}>
            {}
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
              onClick={() => setTab('account')}
              style={{ animation: 'float-up 300ms ease-out 200ms both' }}>
              Edit Profile
            </Button>
          </div>

          {}
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

            {}
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
                  <Globe size={11} />{p.website.replace(/^https?:\/\//, '')}
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

          {}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 20 }}>
            <StatCard label="Member since" value={timeAgo(data.created_at)} delay={200} />
            <StatCard label="Last login"   value={data.last_login ? timeAgo(data.last_login) : 'Just now'} delay={260} />
            <StatCard label="Role"         value={data.role || ''} delay={320} />
          </div>
        </div>
      </div>

      {}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', animation: 'float-up 300ms ease-out 250ms both' }}>
        <div style={{ width: 200, flexShrink: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-secondary)', margin: '0 0 18px 4px', letterSpacing: '-.02em' }}>
            {TABS.find(t => t.id === tab)?.label}
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 'var(--r-lg)',
                    background: active ? 'var(--bg-elevated)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: 'none', textAlign: 'left', cursor: 'pointer',
                    fontSize: 14, fontWeight: active ? 700 : 500,
                    fontFamily: 'var(--font-sans)', transition: 'all 150ms', width: '100%',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-glass-light)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ display: 'flex', color: active ? 'var(--accent-blue-2)' : 'var(--text-muted)' }}>{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

      <TabPanel active={tab === 'account'}>
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

      <TabPanel active={tab === 'account'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {}
          <Card style={{ animation: 'float-up 250ms ease-out' }}>
            <AvatarEditor profile={p} username={data.username} onSaved={fetchProfile} />
          </Card>

          {}
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

          {}
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

      <TabPanel active={tab === 'notifications'}>
        <Card style={{ animation: 'float-up 250ms ease-out' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: 4 }}>Notification Preferences</div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 20 }}>
            Choose which events create notifications in your inbox.
          </p>
          {[
            { key: 'notification_deployments', label: 'Deployment events',  desc: 'Start, success, and failure alerts' },
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

      <TabPanel active={tab === 'feature-flags'}>
        <FeatureFlagsPanel />
      </TabPanel>

      <TabPanel active={tab === 'tokens'}>
        <TokensPanel />
      </TabPanel>

      <TabPanel active={tab === 'ssh-keys'}>
        <SSHKeysPanel />
      </TabPanel>

      <TabPanel active={tab === 'apps'}>
        <AppsPanel />
      </TabPanel>

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

          <Card style={{ animation: 'float-up 250ms ease-out 40ms both' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={16} color={twoFaEnabled ? 'var(--accent-green)' : 'var(--text-muted)'} />
                Two-Factor Authentication
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 'var(--r-pill)',
                background: twoFaEnabled ? 'var(--accent-green-dim)' : 'var(--bg-elevated)',
                color: twoFaEnabled ? 'var(--accent-green)' : 'var(--text-muted)',
                border: `1px solid ${twoFaEnabled ? 'rgba(16,185,129,.3)' : 'var(--border)'}`,
              }}>
                {twoFaEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
              Require a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password…) in addition to your password when signing in.
            </p>

            {twoFaEnabled && !twoFaSetup && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Smartphone size={13} color="var(--text-muted)" /> Enter your password to disable 2FA
                </div>
                <Input type="password" placeholder="Current password" value={disablePw} onChange={e => setDisablePw(e.target.value)} />
                <Button size="sm" variant="danger" loading={disablingTwoFa} disabled={!disablePw} onClick={disableTwoFa} style={{ alignSelf: 'flex-start' }}>
                  Disable 2FA
                </Button>
              </div>
            )}

            {!twoFaEnabled && !twoFaSetup && (
              <Button variant="primary" size="sm" icon={<ShieldCheck size={13} />} loading={twoFaLoading} onClick={startTwoFaSetup}>
                Set Up Two-Factor Authentication
              </Button>
            )}

            {twoFaSetup && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 400 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  1. Add a new account in your authenticator app and enter this key manually:
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{
                    flex: 1, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)',
                    fontSize: 14, fontFamily: 'var(--font-mono)', letterSpacing: '.08em', color: 'var(--text-primary)',
                    border: '1px solid var(--border-glow)', textAlign: 'center', wordBreak: 'break-all',
                  }}>
                    {twoFaSetup.secret}
                  </code>
                  <Button size="sm" icon={<Copy size={12} />} onClick={() => { navigator.clipboard.writeText(twoFaSetup.secret); success('Copied!'); }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>2. Enter the 6-digit code it generates:</div>
                <Input placeholder="123456" value={twoFaCode} onChange={e => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" size="sm" icon={<Check size={13} />} loading={twoFaLoading} disabled={twoFaCode.length !== 6} onClick={confirmTwoFaSetup}>
                    Verify & Enable
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelTwoFaSetup}>Cancel</Button>
                </div>
              </div>
            )}
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

          <Card style={{ animation: 'float-up 250ms ease-out 140ms both' }}>
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
        </div>
      </TabPanel>

      {isAdmin && (
        <TabPanel active={tab === 'team'}>
          <Team />
        </TabPanel>
      )}

      {isAdmin && (
        <TabPanel active={tab === 'platform'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <PlatformSection title="Platform" description="Basic configuration shown in UI and emails">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Input label="Platform Name" value={platformLocal.platform_name || ''} onChange={e => updatePlatform('platform_name', e.target.value)} hint="Shown in the browser tab and emails" />
                <Input label="CORS Origins" value={platformLocal.cors_origins || ''} onChange={e => updatePlatform('cors_origins', e.target.value)} hint="Comma-separated list of allowed origins for API access" />
              </div>
            </PlatformSection>

            <PlatformSection title="JWT Configuration" description="Authentication token signing and session duration">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <MaskedInput settingKey="jwt_secret" label="JWT Secret" placeholder="long-random-string…" local={platformLocal} update={updatePlatform}
                  hint="Must be at least 32 characters. Changing this will log all users out." />
                <Input label="Session Expiry" value={platformLocal.jwt_expiry || '7d'} onChange={e => updatePlatform('jwt_expiry', e.target.value)}
                  hint="Format: 7d, 24h, 30m. Default: 7d" />
              </div>
            </PlatformSection>

            <PlatformSection title="Access Control" description="Security headers and request logging">
              <div>
                <ToggleRow
                  label="Helmet security headers"
                  description="Add security headers to all API responses (strongly recommended for production)"
                  checked={platformLocal.helmet_enabled !== 'false'}
                  onChange={v => updatePlatform('helmet_enabled', v ? 'true' : 'false')}
                />
                <ToggleRow
                  label="Request logging"
                  description="Log all incoming HTTP requests to console for debugging"
                  checked={platformLocal.request_logging !== 'false'}
                  onChange={v => updatePlatform('request_logging', v ? 'true' : 'false')}
                />
              </div>
            </PlatformSection>

            <Button variant="primary" icon={<Save size={13} />} loading={platformSaving} onClick={() => savePlatformSettings()} style={{ alignSelf: 'flex-start' }}>
              Save Platform Settings
            </Button>
          </div>
        </TabPanel>
      )}

      {isAdmin && (
        <TabPanel active={tab === 'ai'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', background: 'rgba(99,102,241,0.08)', border: '1px solid var(--border-glow)', borderRadius: 'var(--r-lg)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 'var(--r-md)', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bot size={15} color="var(--accent-blue-2)" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>AI features are active</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  AI features are powered by an API key configured as a server environment variable (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 3 }}>GROQ_API_KEY</code>). It is not visible or editable here for security reasons.
                </div>
              </div>
            </div>

            <PlatformSection title="Model" description="Which AI provider and model Podium's AI tools call">
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Root cause analysis, incident reports, and the AI assistant chat run on <strong style={{ color: 'var(--text-primary)' }}>Groq</strong>'s free tier
                (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 3 }}>openai/gpt-oss-120b</code>).
                Change the model via the <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 3 }}>AI_MODEL</code> env var on the server.
              </div>
            </PlatformSection>
          </div>
        </TabPanel>
      )}

      {isAdmin && health && (
        <TabPanel active={tab === 'system'}>
          {(() => {
            const runtimeRows: { icon: React.ReactNode; label: string; value: any }[] = [
              { icon: <Server size={13} />, label: 'Node.js', value: health.nodeVersion },
              { icon: <Database size={13} />, label: 'Database', value: `${(health.dbSize / 1024).toFixed(1)} KB (SQLite)` },
              { icon: <Clock size={13} />, label: 'Uptime', value: health.uptimeHuman },
              { icon: <Cpu size={13} />, label: 'Memory', value: `${health.memory?.free} MB free / ${health.memory?.total} MB total` },
              { icon: <Users size={13} />, label: 'Users', value: health.userCount },
              { icon: <Globe size={13} />, label: 'Platform', value: health.platform },
            ];
            const serviceRows: { name: string; status: string; icon: React.ReactNode }[] = [
              { name: 'API Server', status: 'operational', icon: <Activity size={13} /> },
              { name: 'Database', status: 'operational', icon: <Database size={13} /> },
              { name: 'Metrics Collection', status: 'operational', icon: <BarChart2 size={13} /> },
              { name: 'AI (Groq)', status: 'operational', icon: <Bot size={13} /> },
            ];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#6366f1,#a855f7,#22d3ee)' }} />
                  <div style={{ width: 44, height: 44, borderRadius: 'var(--r-lg)', background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glow-blue)' }}>
                    <Zap size={20} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Podium v4.0.0</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>AIOps Platform for DevOps teams</div>
                  </div>
                  <div style={{ marginLeft: 'auto', padding: '4px 12px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                    All systems operational
                  </div>
                </div>

                <PlatformSection title="Runtime Information" description="Server environment details">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {runtimeRows.map((row, i, arr) => (
                      <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-muted)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '13px' }}>
                          {row.icon}{row.label}
                        </div>
                        <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </PlatformSection>

                <PlatformSection title="Service Status" description="All subsystems and their current state">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {serviceRows.map((s, i, arr) => (
                      <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-muted)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                          {s.icon}{s.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 'var(--r-pill)', background: s.status === 'operational' ? 'rgba(16,185,129,0.1)' : 'var(--bg-elevated)', border: `1px solid ${s.status === 'operational' ? 'rgba(16,185,129,0.25)' : 'var(--border)'}` }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.status === 'operational' ? '#10b981' : 'var(--text-muted)', display: 'inline-block' }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: s.status === 'operational' ? '#10b981' : 'var(--text-muted)', textTransform: 'capitalize' }}>{s.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </PlatformSection>
              </div>
            );
          })()}
        </TabPanel>
      )}

        </div>
      </div>
    </div>
  );
}
