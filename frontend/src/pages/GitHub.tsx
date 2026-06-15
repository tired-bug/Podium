import React, { useState, useEffect, useCallback } from 'react';
import { Github, Plus, RefreshCw, Trash2, GitBranch, Clock, Link, Hammer } from 'lucide-react';
import { Card, Badge, EmptyState, SectionHeader, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal, Input } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useRole } from '../hooks/useRole';
import { ViewerBanner } from '../components/ui/ViewerBanner';
import { timeAgo, parseApiError } from '../lib/utils';
import api from '../lib/api';

interface Repo {
  id: string; repo_url: string; branch: string; token?: string;
  auto_deploy: number; last_commit_sha?: string; last_commit_message?: string;
  last_synced?: string; status: string; created_at: string;
}

function ConnectRepoModal({ open, onClose, onConnected }: {
  open: boolean; onClose: () => void; onConnected: () => void;
}) {
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ repo_url: '', branch: 'main', token: '', auto_deploy: false });
  const update = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.repo_url) { showError('Repository URL is required'); return; }
    setLoading(true);
    try {
      await api.post('/api/github/connect', form);
      success('Repository connected successfully');
      onConnected();
      onClose();
      setForm({ repo_url: '', branch: 'main', token: '', auto_deploy: false });
    } catch (err) { showError(parseApiError(err)); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect Repository" width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={loading} onClick={handleSubmit} icon={<Link size={14} />}>Connect</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input label="Repository URL" value={form.repo_url} onChange={e => update('repo_url', e.target.value)}
          placeholder="https://github.com/org/repo" required />
        <Input label="Branch" value={form.branch} onChange={e => update('branch', e.target.value)} placeholder="main" />
        <Input label="GitHub Personal Access Token" type="password" value={form.token} onChange={e => update('token', e.target.value)}
          placeholder="ghp_xxxxxxxxxxxx" hint="Required for private repos. Stored securely." />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
          <input type="checkbox" checked={form.auto_deploy} onChange={e => update('auto_deploy', e.target.checked)} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Auto-deploy on push</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Trigger builds automatically when you push to this branch</div>
          </div>
        </label>
      </div>
    </Modal>
  );
}

function RepoCard({ repo, onAction }: { repo: Repo; onAction: () => void }) {
  const { success, error: showError } = useToast();
  const [pullLoading, setPullLoading] = useState(false);
  const [buildLoading, setBuildLoading] = useState(false);

  const handlePull = async () => {
    setPullLoading(true);
    try {
      const { data } = await api.post(`/api/github/repos/${repo.id}/pull`);
      success(`Pulled: ${data.commitSha || 'latest'}`);
      onAction();
    } catch (err) { showError(parseApiError(err)); }
    finally { setPullLoading(false); }
  };

  const handleBuild = async () => {
    setBuildLoading(true);
    try {
      await api.post(`/api/github/repos/${repo.id}/build`);
      success('Build triggered');
    } catch (err) { showError(parseApiError(err)); }
    finally { setBuildLoading(false); }
  };

  const handleDisconnect = async () => {
    try {
      await api.delete(`/api/github/repos/${repo.id}`);
      success('Repository disconnected');
      onAction();
    } catch (err) { showError(parseApiError(err)); }
  };

  const repoName = repo.repo_url.replace('https://github.com/', '');

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Github size={15} color="var(--text-secondary)" />
            <a href={repo.repo_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {repoName}
            </a>
            {repo.auto_deploy === 1 && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--accent-green-dim)', color: 'var(--accent-green)', whiteSpace: 'nowrap' }}>
                Auto-deploy
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <GitBranch size={11} />{repo.branch}
            </span>
            {repo.last_commit_sha && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {repo.last_commit_sha}
              </span>
            )}
            {repo.last_commit_message && (
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                {repo.last_commit_message}
              </span>
            )}
          </div>

          {repo.last_synced && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={10} />Last synced {timeAgo(repo.last_synced)}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={11} />} loading={pullLoading} onClick={handlePull}>Pull</Button>
          <Button size="sm" variant="primary" icon={<Hammer size={11} />} loading={buildLoading} onClick={handleBuild}>Build</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={11} />} onClick={handleDisconnect} />
        </div>
      </div>
    </Card>
  );
}

export default function GitHub() {
  const { can } = useRole();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/api/github/repos');
      setRepos(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ViewerBanner page="GitHub" />
      <SectionHeader
        title="GitHub"
        subtitle="Repository integrations and CI/CD"
        action={can.connectGitHub ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setConnectOpen(true)}>Connect Repository</Button> : undefined}
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => <Card key={i}><Skeleton height={72} /></Card>)}
        </div>
      ) : repos.length === 0 ? (
        <EmptyState
          icon={<Github size={40} />}
          title="No repositories connected"
          description="Connect your GitHub repositories to enable CI/CD pipelines and auto-deployments."
          action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setConnectOpen(true)}>Connect Repository</Button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {repos.map(r => <RepoCard key={r.id} repo={r} onAction={fetch} />)}
        </div>
      )}

      {/* Webhook info */}
      <Card style={{ borderColor: 'var(--accent-blue)', background: 'var(--accent-blue-dim)' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-blue)', marginBottom: 6 }}>Webhook Endpoint</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 8 }}>
          Add this webhook URL to your GitHub repo settings to enable automatic deployments on push.
        </div>
        <code style={{
          display: 'block', padding: '8px 12px', background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-md)', fontSize: '12px', fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)', wordBreak: 'break-all',
        }}>
          http://localhost:4000/api/github/webhook
        </code>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 6 }}>
          Content type: application/json · Events: push
        </div>
      </Card>

      <ConnectRepoModal open={connectOpen} onClose={() => setConnectOpen(false)} onConnected={fetch} />
    </div>
  );
}
