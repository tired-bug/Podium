import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Github, Plus, RefreshCw, Trash2, GitBranch, Clock, Link, Hammer,
  Key, User, Search, Star, Lock, Unlock, ExternalLink, ChevronDown,
  ChevronUp, AlertCircle, CheckCircle, X,
} from 'lucide-react';
import { Card, Badge, EmptyState, SectionHeader, Skeleton, Spinner } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal, Input } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useRole } from '../hooks/useRole';
import { ViewerBanner } from '../components/ui/ViewerBanner';
import { timeAgo, parseApiError } from '../lib/utils';
import api from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GhAccount {
  connected: boolean;
  github_login?: string;
  github_name?: string;
  avatar_url?: string;
  scopes?: string;
  token_hint?: string;
  created_at?: string;
}

interface GhRepo {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  description: string;
  default_branch: string;
  language: string;
  stargazers_count: number;
  updated_at: string;
  html_url: string;
  clone_url: string;
}

interface LegacyRepo {
  id: string; repo_url: string; branch: string; token?: string;
  auto_deploy: number; last_commit_sha?: string; last_commit_message?: string;
  last_synced?: string; status: string; created_at: string;
}

// ─── Connect Account Modal ────────────────────────────────────────────────────

function ConnectAccountModal({ open, onClose, onConnected }: {
  open: boolean; onClose: () => void; onConnected: (account: GhAccount) => void;
}) {
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');

  const handleSubmit = async () => {
    if (!token.trim()) { showError('Token is required'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/api/github/account', { token: token.trim() });
      success(`Connected as @${data.github_login}`);
      onConnected(data);
      onClose();
      setToken('');
    } catch (err) { showError(parseApiError(err)); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect GitHub Account" width={500}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={loading} onClick={handleSubmit} icon={<Key size={14} />}>Connect</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ padding: '12px 14px', background: 'var(--accent-blue-dim)', border: '1px solid var(--accent-blue)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--accent-blue)' }}>Create a Personal Access Token</strong> at{' '}
          <a href="https://github.com/settings/tokens/new?scopes=repo,read:org" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>
            github.com/settings/tokens
          </a>
          {' '}with <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>repo</code> and{' '}
          <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>read:org</code> scopes.
          Your token is stored encrypted and never exposed.
        </div>
        <Input
          label="Personal Access Token"
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          hint="Classic tokens start with ghp_, fine-grained with github_pat_"
          required
        />
      </div>
    </Modal>
  );
}

// ─── Legacy Connect Repo Modal ────────────────────────────────────────────────

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
    <Modal open={open} onClose={onClose} title="Connect Repository (Manual)" width={480}
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

// ─── GitHub Repo Card (from API) ──────────────────────────────────────────────

function RepoCard({ repo }: { repo: GhRepo }) {
  const langColors: Record<string, string> = {
    TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
    Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
    Ruby: '#701516', PHP: '#4F5D95', CSS: '#563d7c', HTML: '#e34c26',
  };
  const langColor = repo.language ? langColors[repo.language] || 'var(--text-muted)' : 'var(--text-muted)';

  return (
    <div style={{
      padding: '14px 16px',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      display: 'flex', flexDirection: 'column', gap: 8,
      transition: 'border-color 150ms',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            {repo.private
              ? <Lock size={12} color="var(--accent-orange)" />
              : <Unlock size={12} color="var(--text-muted)" />
            }
            <a href={repo.html_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {repo.full_name}
            </a>
            {repo.private && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: 'var(--r-pill)', background: 'var(--accent-orange-dim)', color: 'var(--accent-orange)', whiteSpace: 'nowrap' }}>
                Private
              </span>
            )}
          </div>
          {repo.description && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {repo.description}
            </p>
          )}
        </div>
        <a href={repo.html_url} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'flex' }}>
          <ExternalLink size={13} />
        </a>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {repo.language && (
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: langColor, display: 'inline-block', flexShrink: 0 }} />
            {repo.language}
          </span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Star size={10} />{repo.stargazers_count}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <GitBranch size={10} />{repo.default_branch}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <Clock size={10} />Updated {timeAgo(repo.updated_at)}
        </span>
      </div>
    </div>
  );
}

// ─── Legacy Repo Card ─────────────────────────────────────────────────────────

function LegacyRepoCard({ repo, onAction }: { repo: LegacyRepo; onAction: () => void }) {
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GitHub() {
  const { can } = useRole();

  // Account state
  const [account, setAccount] = useState<GhAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [connectAccountOpen, setConnectAccountOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // User repos (from GitHub API)
  const [userRepos, setUserRepos] = useState<GhRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterPrivate, setFilterPrivate] = useState<'all' | 'public' | 'private'>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'stars' | 'name'>('updated');
  const [showLegacy, setShowLegacy] = useState(false);

  // Legacy repos
  const [legacyRepos, setLegacyRepos] = useState<LegacyRepo[]>([]);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [connectRepoOpen, setConnectRepoOpen] = useState(false);

  const { error: showError } = useToast();

  const fetchAccount = useCallback(async () => {
    try {
      const { data } = await api.get('/api/github/account');
      setAccount(data);
    } catch {
      setAccount({ connected: false });
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const fetchUserRepos = useCallback(async () => {
    setReposLoading(true);
    setReposError(null);
    try {
      const { data } = await api.get('/api/github/user-repos');
      setUserRepos(data);
    } catch (err: any) {
      setReposError(parseApiError(err));
    } finally {
      setReposLoading(false);
    }
  }, []);

  const fetchLegacyRepos = useCallback(async () => {
    setLegacyLoading(true);
    try {
      const { data } = await api.get('/api/github/repos');
      setLegacyRepos(data);
    } finally {
      setLegacyLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccount(); fetchLegacyRepos(); }, [fetchAccount, fetchLegacyRepos]);

  useEffect(() => {
    if (account?.connected) fetchUserRepos();
    else setUserRepos([]);
  }, [account?.connected, fetchUserRepos]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.delete('/api/github/account');
      setAccount({ connected: false });
      setUserRepos([]);
    } catch (err) { showError(parseApiError(err)); }
    finally { setDisconnecting(false); }
  };

  const filteredRepos = useMemo(() => {
    let repos = [...userRepos];
    if (search.trim()) {
      const q = search.toLowerCase();
      repos = repos.filter(r =>
        r.full_name.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.language?.toLowerCase().includes(q)
      );
    }
    if (filterPrivate === 'public') repos = repos.filter(r => !r.private);
    if (filterPrivate === 'private') repos = repos.filter(r => r.private);
    if (sortBy === 'stars') repos.sort((a, b) => b.stargazers_count - a.stargazers_count);
    else if (sortBy === 'name') repos.sort((a, b) => a.full_name.localeCompare(b.full_name));
    else repos.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return repos;
  }, [userRepos, search, filterPrivate, sortBy]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ViewerBanner page="GitHub" />
      <SectionHeader
        title="GitHub"
        subtitle="Repository integrations and CI/CD"
      />

      {/* ── Account Connection Panel ── */}
      {accountLoading ? (
        <Card><Skeleton height={60} /></Card>
      ) : account?.connected ? (
        <Card style={{ borderColor: 'var(--accent-green)', background: 'var(--accent-green-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {account.avatar_url
              ? <img src={account.avatar_url} alt="avatar" style={{ width: 38, height: 38, borderRadius: '50%', border: '2px solid var(--accent-green)' }} />
              : <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={18} color="var(--text-muted)" /></div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={14} color="var(--accent-green)" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Connected as @{account.github_login}
                </span>
                {account.github_name && account.github_name !== account.github_login && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({account.github_name})</span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 2 }}>
                Token: <code style={{ fontFamily: 'var(--font-mono)' }}>{account.token_hint}</code>
                {account.scopes && <span style={{ marginLeft: 8 }}>· Scopes: {account.scopes}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="secondary" icon={<RefreshCw size={11} />} onClick={fetchUserRepos} loading={reposLoading}>Sync</Button>
              <Button size="sm" variant="secondary" icon={<Key size={11} />} onClick={() => setConnectAccountOpen(true)}>Update Token</Button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={11} />} loading={disconnecting} onClick={handleDisconnect} />
            </div>
          </div>
        </Card>
      ) : (
        <Card style={{ borderColor: 'var(--accent-orange)', background: 'var(--accent-orange-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <AlertCircle size={32} color="var(--accent-orange)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Connect your GitHub account</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Add a Personal Access Token to browse all your repositories and use them in deployments.
              </div>
            </div>
            {can.connectGitHub && (
              <Button variant="primary" icon={<Key size={14} />} onClick={() => setConnectAccountOpen(true)}>
                Add Token
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ── Repository Browser ── */}
      {account?.connected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search repositories…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '8px 12px 8px 32px',
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)', fontSize: '13px',
                  color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', outline: 'none',
                }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <select value={filterPrivate} onChange={e => setFilterPrivate(e.target.value as any)}
              style={{ padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
              <option value="all">All repos</option>
              <option value="public">Public only</option>
              <option value="private">Private only</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              style={{ padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
              <option value="updated">Recently updated</option>
              <option value="stars">Most stars</option>
              <option value="name">Name A–Z</option>
            </select>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {reposLoading ? 'Loading…' : `${filteredRepos.length} of ${userRepos.length} repos`}
            </span>
          </div>

          {reposLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3, 4, 5].map(i => <Card key={i}><Skeleton height={60} /></Card>)}
            </div>
          ) : reposError ? (
            <Card style={{ borderColor: 'var(--accent-red)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertCircle size={18} color="var(--accent-red)" />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{reposError}</span>
                <Button size="sm" variant="secondary" onClick={fetchUserRepos} style={{ marginLeft: 'auto' }}>Retry</Button>
              </div>
            </Card>
          ) : filteredRepos.length === 0 ? (
            <EmptyState icon={<Github size={36} />} title="No repositories found"
              description={search ? `No repos match "${search}"` : 'No repositories in your GitHub account.'} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredRepos.map(r => <RepoCard key={r.id} repo={r} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Legacy Connected Repos ── */}
      <div>
        <button
          onClick={() => setShowLegacy(s => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, padding: '4px 0', fontFamily: 'var(--font-sans)' }}
        >
          {showLegacy ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          CI/CD Connections ({legacyRepos.length})
        </button>

        {showLegacy && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {can.connectGitHub && (
                <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => setConnectRepoOpen(true)}>
                  Add CI/CD Repo
                </Button>
              )}
            </div>
            {legacyLoading ? (
              [1, 2].map(i => <Card key={i}><Skeleton height={72} /></Card>)
            ) : legacyRepos.length === 0 ? (
              <EmptyState icon={<Github size={32} />} title="No CI/CD repos connected"
                description="Manually connect a repo to enable webhooks and auto-deployments."
                action={can.connectGitHub ? <Button size="sm" variant="primary" icon={<Plus size={12} />} onClick={() => setConnectRepoOpen(true)}>Add Repo</Button> : undefined} />
            ) : (
              legacyRepos.map(r => <LegacyRepoCard key={r.id} repo={r} onAction={fetchLegacyRepos} />)
            )}
          </div>
        )}
      </div>

      {/* ── Webhook Info ── */}
      <Card style={{ borderColor: 'var(--accent-blue)', background: 'var(--accent-blue-dim)' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-blue)', marginBottom: 6 }}>Webhook Endpoint</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 8 }}>
          Add this URL to your GitHub repo settings → Webhooks to enable automatic deployments on push.
        </div>
        <code style={{ display: 'block', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
          {window.location.origin.replace(/:\d+$/, ':4000')}/api/github/webhook
        </code>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 6 }}>
          Content type: application/json · Events: push
        </div>
      </Card>

      {/* ── Modals ── */}
      <ConnectAccountModal open={connectAccountOpen} onClose={() => setConnectAccountOpen(false)} onConnected={a => setAccount(a)} />
      <ConnectRepoModal open={connectRepoOpen} onClose={() => setConnectRepoOpen(false)} onConnected={fetchLegacyRepos} />
    </div>
  );
}
