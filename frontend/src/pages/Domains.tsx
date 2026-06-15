import React, { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, ExternalLink, RefreshCw, Copy, CheckCircle, AlertCircle, Clock, Rocket } from 'lucide-react';
import { Card, Badge, EmptyState, SectionHeader, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Modal, ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useRole } from '../hooks/useRole';
import { ViewerBanner } from '../components/ui/ViewerBanner';
import { timeAgo } from '../lib/utils';
import api from '../lib/api';

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} title="Copy" style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: copied ? 'var(--accent-green)' : 'var(--text-muted)',
      display: 'flex', alignItems: 'center', padding: 2,
      transition: 'color 150ms',
    }}>
      {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? 'var(--accent-green)' : status === 'building' ? 'var(--accent-yellow)' : status === 'failed' ? 'var(--accent-red)' : 'var(--text-muted)';
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: color, flexShrink: 0,
      boxShadow: status === 'running' ? `0 0 6px ${color}` : 'none',
    }} />
  );
}

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
      onCreated();
      onClose();
      setSubdomain(''); setDeploymentId(''); setPort(''); setError('');
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to create domain binding');
    } finally {
      setLoading(false);
    }
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
          Map a subdomain to a running app on this Podium instance. The domain will be accessible at <span style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>[subdomain].podium.local</span> on your server.
        </div>

        <Input
          label="Subdomain"
          value={subdomain}
          onChange={e => { setSubdomain(e.target.value); setError(''); }}
          placeholder="myapp, api, frontend-v2"
          hint="Lowercase letters, numbers, and hyphens. Will become: subdomain.podium.local"
          error={error && !deploymentId ? undefined : error}
          required
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Deployment <span style={{ color: 'var(--accent-red)', marginLeft: 3 }}>*</span>
          </label>
          <select
            className="podium-input"
            value={deploymentId}
            onChange={e => { setDeploymentId(e.target.value); setError(''); }}
            style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-elevated)', color: deploymentId ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
          >
            <option value="" disabled>Select a deployment...</option>
            {deployments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {error && deploymentId === '' && <span style={{ fontSize: '11px', color: 'var(--accent-red)' }}>{error}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Port <span style={{ color: 'var(--accent-red)', marginLeft: 3 }}>*</span>
          </label>
          {availablePorts.length > 0 ? (
            <select
              className="podium-input"
              value={port}
              onChange={e => setPort(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '13px', fontFamily: 'var(--font-mono)', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
            >
              {availablePorts.map((p: any) => (
                <option key={p.host} value={p.host}>{p.host} → container:{p.container}</option>
              ))}
            </select>
          ) : (
            <Input
              value={port}
              onChange={e => setPort(e.target.value)}
              placeholder="8080"
              hint={deploymentId ? "This deployment has no configured ports — enter one manually" : "Select a deployment first"}
              disabled={!deploymentId}
            />
          )}
        </div>

        {subdomain && deploymentId && port && (
          <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={14} color="var(--accent-green)" />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Will bind <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>
                {subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.podium.local
              </span> → port <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>{port}</span>
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DomainCard({ binding, onDelete }: { binding: DomainBinding; onDelete: () => void }) {
  const { can } = useRole();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { success, error: showError } = useToast();

  const handleDelete = async () => {
    try {
      await api.delete(`/api/domains/${binding.id}`);
      success(`Domain binding removed`);
      onDelete();
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to remove binding');
    }
  };

  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: binding.deployment_status === 'running' ? 'rgba(16,185,129,0.12)' : 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Globe size={16} color={binding.deployment_status === 'running' ? 'var(--accent-green)' : 'var(--text-muted)'} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {binding.subdomain}.podium.local
          </span>
          <CopyButton text={binding.full_url} />
          <StatusDot status={binding.deployment_status} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{binding.deployment_status}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Rocket size={10} /> {binding.deployment_name}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            :{binding.port}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} /> {timeAgo(binding.created_at)}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {binding.deployment_status === 'running' && (
          <Button size="sm" variant="ghost" icon={<ExternalLink size={11} />}
            onClick={() => window.open(`http://localhost:${binding.port}`, '_blank')}>
            Open
          </Button>
        )}
        {can.deleteDeployment && (
          <Button size="sm" variant="danger" icon={<Trash2 size={11} />} onClick={() => setDeleteOpen(true)} />
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Remove Domain Binding"
        message={`Remove the binding for "${binding.subdomain}.podium.local"? The deployment will keep running.`}
        confirmLabel="Remove"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </Card>
  );
}

export default function Domains() {
  const { can } = useRole();
  const [bindings, setBindings] = useState<DomainBinding[]>([]);
  const [deployments, setDeployments] = useState<Array<{ id: string; name: string; ports: any[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    try {
      const [dRes, depRes] = await Promise.all([
        api.get('/api/domains').catch(() => ({ data: [] })),
        api.get('/api/deployments'),
      ]);
      setBindings(dRes.data);
      setDeployments(depRes.data.map((d: any) => ({ id: d.id, name: d.name, ports: d.ports || [] })));
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const running = bindings.filter(b => b.deployment_status === 'running').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ViewerBanner page="Domains" />
      <SectionHeader
        title="Domains"
        subtitle={`${bindings.length} binding${bindings.length !== 1 ? 's' : ''} · ${running} active`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<RefreshCw size={14} />} onClick={load} size="sm">Refresh</Button>
            {can.createDeployment && (
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add Binding</Button>
            )}
          </div>
        }
      />

      <div style={{ padding: '14px 16px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Globe size={16} color="var(--accent-blue)" style={{ marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Domains map a subdomain to a deployment running on this server. Each binding creates a <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>subdomain.podium.local</span> address that routes to your app's port. For public DNS, point your domain's A record to this server's IP and configure your reverse proxy (nginx/Caddy).
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => <Card key={i}><Skeleton height={60} /></Card>)}
        </div>
      ) : bindings.length === 0 ? (
        <EmptyState
          icon="🌐"
          title="No domain bindings yet"
          description="Bind a subdomain to a deployment to give it a clean URL."
          action={can.createDeployment ? (
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add Binding</Button>
          ) : undefined}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bindings.map(b => <DomainCard key={b.id} binding={b} onDelete={load} />)}
        </div>
      )}

      <AddDomainModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={load}
        deployments={deployments}
      />
    </div>
  );
}
