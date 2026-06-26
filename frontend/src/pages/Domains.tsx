import React, { useState, useEffect } from 'react';
import {
  Globe, Plus, Trash2, ExternalLink, RefreshCw, Copy, CheckCircle,
  Clock, Rocket, Wifi, WifiOff, ChevronRight,
  Server, Cloud,
} from 'lucide-react';
import { Card, Badge, EmptyState, SectionHeader, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Modal, ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useRole } from '../hooks/useRole';
import { ViewerBanner } from '../components/ui/ViewerBanner';
import { timeAgo } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

/* ── Provider logos as inline SVGs ─────────────────────────────────────── */
const LOGOS: Record<string, React.ReactNode> = {
  aws: (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <path d="M6.76 10.55c0 .22.02.4.07.53.05.13.12.27.22.42.04.05.05.1.05.15 0 .07-.04.14-.13.21l-.42.28c-.06.04-.12.06-.17.06-.07 0-.14-.03-.2-.1a2.1 2.1 0 01-.25-.33 5.4 5.4 0 01-.21-.42c-.53.63-1.2.94-2 .94-.57 0-1.03-.16-1.36-.49-.33-.33-.5-.76-.5-1.3 0-.57.2-1.03.6-1.38.4-.35.94-.53 1.61-.53.22 0 .45.02.69.06.24.04.49.1.75.18V8.9c0-.5-.1-.85-.32-1.07-.21-.21-.57-.31-1.08-.31-.23 0-.47.03-.72.09a5.3 5.3 0 00-.72.24 1.9 1.9 0 01-.23.09.4.4 0 01-.1.01c-.09 0-.13-.06-.13-.19v-.3c0-.1.01-.18.04-.22.03-.04.09-.09.18-.13.23-.12.5-.22.83-.3.33-.09.68-.13 1.05-.13.8 0 1.38.18 1.75.54.36.36.55.91.55 1.65v2.18zm-2.76.82c.21 0 .43-.04.66-.12.23-.08.43-.23.6-.43.1-.12.18-.25.22-.4.04-.15.06-.33.06-.54v-.26a5.4 5.4 0 00-.6-.11 4.8 4.8 0 00-.61-.04c-.44 0-.76.09-.97.27-.21.18-.32.43-.32.77 0 .32.08.55.25.71.16.16.39.24.7.24l.01-.09zm5.2.69c-.1 0-.17-.02-.22-.06-.05-.04-.09-.12-.13-.24L7.03 7.34a1.1 1.1 0 01-.05-.25c0-.1.05-.15.15-.15h.6c.11 0 .18.02.22.06.05.04.08.12.12.24l1.3 5.1 1.2-5.1c.03-.12.07-.2.12-.24.05-.04.13-.06.23-.06h.49c.11 0 .18.02.23.06.05.04.09.12.12.24l1.22 5.17 1.34-5.17c.04-.12.08-.2.12-.24.05-.04.12-.06.22-.06h.57c.1 0 .15.05.15.15 0 .03-.01.06-.01.1-.01.03-.02.08-.05.15l-1.87 5.42c-.04.12-.08.2-.13.24-.05.04-.12.06-.22.06h-.52c-.11 0-.18-.02-.23-.07-.05-.04-.09-.12-.12-.25l-1.2-5-1.2 5c-.03.13-.07.21-.12.25-.05.05-.13.07-.23.07h-.52zm9.97.14c-.31 0-.63-.04-.93-.11a2.78 2.78 0 01-.7-.27c-.1-.06-.17-.12-.2-.19a.48.48 0 01-.04-.18v-.31c0-.13.05-.19.14-.19.04 0 .07 0 .11.02.04.01.09.03.15.06.2.09.42.16.65.21.24.05.47.07.71.07.38 0 .67-.07.87-.2.2-.13.31-.32.31-.57 0-.17-.05-.31-.16-.43-.11-.12-.32-.22-.62-.32l-.88-.27c-.45-.14-.78-.35-.99-.62a1.5 1.5 0 01-.31-.93c0-.27.06-.51.17-.72.12-.21.27-.39.47-.54.2-.15.43-.26.69-.33.26-.07.54-.11.83-.11.15 0 .3.01.45.03.16.02.3.05.44.08.14.04.27.08.39.12.12.05.21.09.28.14.09.06.16.12.19.19.04.07.05.15.05.26v.29c0 .13-.05.2-.14.2a.62.62 0 01-.22-.07 2.68 2.68 0 00-1.14-.24c-.34 0-.6.06-.78.17-.18.12-.27.29-.27.53 0 .17.06.32.18.43.12.12.34.23.67.33l.86.27c.44.14.76.34.96.6.2.26.3.56.3.9 0 .28-.06.53-.17.75-.12.22-.27.41-.48.57-.21.16-.45.28-.74.36-.3.09-.62.13-.96.13z" fill="#FF9900"/>
      <path d="M20.16 17.48c-2.36 1.75-5.79 2.68-8.74 2.68-4.14 0-7.86-1.53-10.68-4.07-.22-.2-.02-.47.24-.31 3.04 1.77 6.8 2.83 10.68 2.83 2.62 0 5.5-.54 8.15-1.67.4-.17.74.26.35.54zm1-1.14c-.3-.39-2-.18-2.76-.09-.23.03-.27-.17-.06-.32 1.35-.95 3.57-.68 3.83-.36.26.33-.07 2.55-1.34 3.62-.19.16-.38.08-.29-.14.29-.71.93-2.32.62-2.71z" fill="#FF9900"/>
    </svg>
  ),
  azure: (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <path d="M13.05 4.24L6.56 18.05l5.03.64-5.98 1.07H18.7L13.05 4.24z" fill="#0072C6"/>
      <path d="M12.33 5.13l-5.9 8.4 4.76 5.38-8.22 1.15h17.03l-7.67-14.93z" fill="#0072C6" opacity=".7"/>
    </svg>
  ),
  vercel: (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <path d="M12 2L2 19.5h20L12 2z" fill="#fff"/>
    </svg>
  ),
  render: (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <circle cx="12" cy="12" r="10" fill="#46E3B7"/>
      <path d="M8 8h5a3 3 0 010 6H8V8zm0 6h3l3 4H11l-3-4z" fill="#fff"/>
    </svg>
  ),
  railway: (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <rect width="24" height="24" rx="5" fill="#0B0D0E"/>
      <path d="M6 17.5c0-4.8 3.4-8.5 8-8.5m-8 8.5h13M6 17.5l3-7M19 17.5l-3-7m-7 7l3.5-7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  gcp: (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <path d="M14.6 7.2H9.4L6.8 12l2.6 4.8h5.2l2.6-4.8-2.6-4.8z" fill="#4285F4"/>
      <path d="M6.8 12L4 7.2 6.8 2.4h10.4L20 7.2 17.2 12" fill="#EA4335" opacity=".5"/>
      <path d="M6.8 12l2.6 4.8h5.2l2.6-4.8" fill="#34A853" opacity=".5"/>
    </svg>
  ),
};

/* ── Cloud providers list ───────────────────────────────────────────────── */
const PROVIDERS = [
  {
    id: 'aws',       label: 'Amazon Web Services', color: '#FF9900', statusKey: 'aws',
    description: 'Deploy to AWS App Runner via ECS',
    docsUrl: 'https://aws.amazon.com/apprunner/',
    hint: 'Needs Access Key ID + Secret in Settings → Cloud',
  },
  {
    id: 'azure',     label: 'Microsoft Azure', color: '#0072C6', statusKey: 'azure',
    description: 'Deploy containers via Azure Container Instances',
    docsUrl: 'https://azure.microsoft.com/en-us/products/container-instances',
    hint: 'Needs Subscription ID + Client credentials in Settings → Cloud',
  },
  {
    id: 'vercel',    label: 'Vercel', color: '#fff', statusKey: 'vercel',
    description: 'Deploy serverless apps and static sites',
    docsUrl: 'https://vercel.com/docs',
    hint: 'Needs API Token in Settings → Cloud',
  },
  {
    id: 'render',    label: 'Render', color: '#46E3B7', statusKey: 'render',
    description: 'Deploy web services — free tier available',
    docsUrl: 'https://render.com/docs',
    hint: 'Needs API Key + Owner ID in Settings → Cloud',
  },
  {
    id: 'railway',   label: 'Railway', color: '#B39DDB', statusKey: 'railway',
    description: 'Deploy from GitHub in seconds',
    docsUrl: 'https://docs.railway.com',
    hint: 'Connect in Settings → Cloud',
  },
  {
    id: 'gcp',       label: 'Google Cloud', color: '#4285F4', statusKey: 'gcp',
    description: 'Deploy via Cloud Run or GKE',
    docsUrl: 'https://cloud.google.com/run',
    hint: 'Needs service account credentials in Settings → Cloud',
  },
];

/* ── Domain binding types ───────────────────────────────────────────────── */
interface DomainBinding {
  id: string;
  subdomain: string;
  deployment_id: string;
  deployment_name: string;
  deployment_status: string;
  port: string;
  created_at: string;
  full_url: string;
}

interface ProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  regions?: string[];
  hint?: string;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      title="Copy" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--accent-green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 2, transition: 'color 150ms' }}>
      {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? 'var(--accent-green)' : status === 'building' ? 'var(--accent-yellow)' : status === 'failed' ? 'var(--accent-red)' : 'var(--text-muted)';
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: status === 'running' ? `0 0 6px ${color}` : 'none' }} />;
}

/* ── ProviderGrid ───────────────────────────────────────────────────────── */
function ProviderGrid({ statuses }: { statuses: ProviderStatus[] }) {
  const navigate = useNavigate();

  const getStatus = (pid: string): boolean => {
    const s = statuses.find(s => s.id === pid);
    return s?.configured ?? false;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {PROVIDERS.map(p => {
        const connected = getStatus(p.id);
        return (
          <div key={p.id} style={{
            background: 'var(--bg-card)', border: `1px solid ${connected ? p.color + '44' : 'var(--border)'}`,
            borderRadius: 'var(--r-xl)', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 12,
            transition: 'all 200ms', position: 'relative', overflow: 'hidden',
          }}>
            {connected && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${p.color}cc, ${p.color}44)` }} />
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--r-lg)',
                background: p.id === 'vercel' ? '#111' : `${p.color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {LOGOS[p.id]}
              </div>
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--r-pill)',
                background: connected ? 'rgba(16,185,129,0.15)' : 'var(--bg-elevated)',
                color: connected ? 'var(--accent-green)' : 'var(--text-muted)',
                border: `1px solid ${connected ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {connected ? <Wifi size={9} /> : <WifiOff size={9} />}
                {connected ? 'Connected' : 'Not set up'}
              </span>
            </div>

            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{p.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{p.description}</div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: 6 }}>
              <button
                onClick={() => navigate('/settings?tab=cloud')}
                style={{
                  flex: 1, padding: '6px 0', background: connected ? `${p.color}15` : 'var(--bg-elevated)',
                  border: `1px solid ${connected ? p.color + '44' : 'var(--border)'}`,
                  borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                  color: connected ? p.color : 'var(--text-secondary)', transition: 'all 150ms',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                {connected ? <><CheckCircle size={10} /> Configured</> : <><Plus size={10} /> Set up</>}
              </button>
              <a href={p.docsUrl} target="_blank" rel="noreferrer" style={{
                width: 28, height: 28, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', textDecoration: 'none', transition: 'all 150ms',
              }}>
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── AddDomainModal ─────────────────────────────────────────────────────── */
function AddDomainModal({ open, onClose, onCreated, deployments }: {
  open: boolean; onClose: () => void; onCreated: () => void;
  deployments: Array<{ id: string; name: string; ports: any[] }>;
}) {
  const [subdomain, setSubdomain] = useState('');
  const [deploymentId, setDeploymentId] = useState('');
  const [port, setPort] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { success, error: showError } = useToast();

  const selectedDep = deployments.find(d => d.id === deploymentId);
  const availablePorts = selectedDep?.ports || [];

  useEffect(() => {
    if (availablePorts.length > 0) setPort(availablePorts[0].host);
    else setPort('');
  }, [deploymentId]);

  const handleSubmit = async () => {
    if (!subdomain.trim()) { setError('Subdomain is required'); return; }
    if (!deploymentId) { setError('Select a deployment'); return; }
    if (!port) { setError('Port is required'); return; }
    const slug = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    setLoading(true);
    try {
      await api.post('/api/domains', { subdomain: slug, deployment_id: deploymentId, port });
      success(`Domain ${slug}.podium.local bound!`);
      onCreated(); onClose();
      setSubdomain(''); setDeploymentId(''); setPort(''); setError('');
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to create domain binding');
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Domain Binding" width={500}
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <div style={{ flex: 1 }} />
          <Button variant="primary" loading={loading} onClick={handleSubmit}>Bind Domain</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Map a subdomain to a running app. The domain will be accessible at <span style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>[subdomain].podium.local</span>.
        </div>
        <Input label="Subdomain" value={subdomain} onChange={e => { setSubdomain(e.target.value); setError(''); }}
          placeholder="myapp, api, frontend-v2"
          hint="Lowercase letters, numbers, and hyphens. Will become: subdomain.podium.local"
          error={error && !subdomain ? error : undefined} required />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Deployment <span style={{ color: 'var(--accent-red)', marginLeft: 3 }}>*</span>
          </label>
          <select className="podium-input" value={deploymentId} onChange={e => { setDeploymentId(e.target.value); setError(''); }}
            style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-elevated)', color: deploymentId ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '13px', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
            <option value="" disabled>Select a deployment...</option>
            {deployments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {error && !deploymentId && <span style={{ fontSize: '11px', color: 'var(--accent-red)' }}>{error}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Port <span style={{ color: 'var(--accent-red)', marginLeft: 3 }}>*</span>
          </label>
          {availablePorts.length > 0 ? (
            <select className="podium-input" value={port} onChange={e => setPort(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '13px', fontFamily: 'var(--font-mono)', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
              {availablePorts.map((p: any) => <option key={p.host} value={p.host}>{p.host} → container:{p.container}</option>)}
            </select>
          ) : (
            <Input value={port} onChange={e => setPort(e.target.value)} placeholder="8080"
              hint={deploymentId ? 'No configured ports — enter one manually' : 'Select a deployment first'} disabled={!deploymentId} />
          )}
        </div>
        {subdomain && deploymentId && port && (
          <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={14} color="var(--accent-green)" />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Will bind <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>{subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.podium.local</span>
              {' → port '}<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>{port}</span>
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── DomainCard ─────────────────────────────────────────────────────────── */
function DomainCard({ binding, onDelete }: { binding: DomainBinding; onDelete: () => void }) {
  const { can } = useRole();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { success, error: showError } = useToast();

  const handleDelete = async () => {
    try {
      await api.delete(`/api/domains/${binding.id}`);
      success('Domain binding removed'); onDelete();
    } catch (err: any) { showError(err?.response?.data?.error || 'Failed to remove binding'); }
  };

  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: binding.deployment_status === 'running' ? 'rgba(16,185,129,0.12)' : 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Globe size={16} color={binding.deployment_status === 'running' ? 'var(--accent-green)' : 'var(--text-muted)'} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{binding.subdomain}.podium.local</span>
          <CopyButton text={binding.full_url} />
          <StatusDot status={binding.deployment_status} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{binding.deployment_status}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><Rocket size={10} /> {binding.deployment_name}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>:{binding.port}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} /> {timeAgo(binding.created_at)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {binding.deployment_status === 'running' && (
          <Button size="sm" variant="ghost" icon={<ExternalLink size={11} />} onClick={() => window.open(`http://localhost:${binding.port}`, '_blank')}>Open</Button>
        )}
        {can.deleteDeployment && <Button size="sm" variant="danger" icon={<Trash2 size={11} />} onClick={() => setDeleteOpen(true)} />}
      </div>
      <ConfirmDialog open={deleteOpen} title="Remove Domain Binding" message={`Remove "${binding.subdomain}.podium.local"? The deployment will keep running.`} confirmLabel="Remove" onConfirm={handleDelete} onCancel={() => setDeleteOpen(false)} />
    </Card>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
type PageTab = 'bindings' | 'providers';

export default function Domains() {
  const { can } = useRole();
  const [tab, setTab] = useState<PageTab>('providers');
  const [bindings, setBindings] = useState<DomainBinding[]>([]);
  const [deployments, setDeployments] = useState<Array<{ id: string; name: string; ports: any[] }>>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    try {
      const [dRes, depRes, provRes] = await Promise.all([
        api.get('/api/domains').catch(() => ({ data: [] })),
        api.get('/api/deployments'),
        api.get('/api/cloud/providers').catch(() => ({ data: [] })),
      ]);
      setBindings(dRes.data);
      setDeployments(depRes.data.map((d: any) => ({ id: d.id, name: d.name, ports: d.ports || [] })));
      setProviderStatuses(provRes.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const running = bindings.filter(b => b.deployment_status === 'running').length;
  const connectedCount = PROVIDERS.filter(p =>
    providerStatuses.find(s => s.id === p.id)?.configured
  ).length;

  const TAB_ITEMS: { id: PageTab; label: string; icon: React.ReactNode }[] = [
    { id: 'providers', label: 'Providers', icon: <Cloud size={13} /> },
    { id: 'bindings',  label: 'Domain Bindings', icon: <Globe size={13} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ViewerBanner page="Domains" />

      <SectionHeader
        title="Domains & Providers"
        subtitle={`${connectedCount} provider${connectedCount !== 1 ? 's' : ''} connected · ${bindings.length} binding${bindings.length !== 1 ? 's' : ''} · ${running} active`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<RefreshCw size={14} />} onClick={() => load()} size="sm">Refresh</Button>
            {tab === 'bindings' && can.createDeployment && (
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add Binding</Button>
            )}
          </div>
        }
      />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '4px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', alignSelf: 'flex-start' }}>
        {TAB_ITEMS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
            background: tab === t.id ? 'var(--bg-card)' : 'transparent',
            color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
            boxShadow: tab === t.id ? 'var(--shadow-sm)' : 'none',
            transition: 'all 150ms',
          }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'providers' && (
        <>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => <Card key={i}><Skeleton height={160} /></Card>)}
            </div>
          ) : (
            <ProviderGrid statuses={providerStatuses} />
          )}
          <div style={{ padding: '14px 16px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Server size={15} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              Credentials and API keys are configured in <strong style={{ color: 'var(--text-secondary)' }}>Settings → Cloud</strong>.
            </div>
            <Button size="sm" variant="ghost" icon={<ChevronRight size={12} />} onClick={() => (window.location.href = '/settings?tab=cloud')}>Settings</Button>
          </div>
        </>
      )}

      {tab === 'bindings' && (
        <>
          <div style={{ padding: '14px 16px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Globe size={16} color="var(--accent-blue)" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              Map a subdomain to a running deployment. Each binding creates a <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>subdomain.podium.local</span> address. For public DNS, point your domain's A record to this server's IP.
            </div>
          </div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => <Card key={i}><Skeleton height={60} /></Card>)}
            </div>
          ) : bindings.length === 0 ? (
            <EmptyState icon="🌐" title="No domain bindings yet" description="Bind a subdomain to a deployment to give it a clean URL."
              action={can.createDeployment ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add Binding</Button> : undefined} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bindings.map(b => <DomainCard key={b.id} binding={b} onDelete={load} />)}
            </div>
          )}
        </>
      )}

      <AddDomainModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} deployments={deployments} />
    </div>
  );
}
