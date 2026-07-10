import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { getDb } from '../db/index';
import { requireAuth, requireRole, AuthRequest } from '../auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB cap

function getUserGithubToken(userId: string): string | undefined {
  const account = getDb().prepare('SELECT token FROM github_accounts WHERE user_id = ?').get(userId) as any;
  return account?.token;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function ghFetch(path: string, token: string, options: Record<string, any> = {}) {
  const axios = require('axios');
  return axios.get(`https://api.github.com${path}`, {
    headers: {
      Authorization: `token ${token}`,
      'User-Agent': 'Podium/4.0',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...options,
  });
}

function maskToken(token: string) {
  return token.slice(0, 4) + '…' + token.slice(-4);
}

// ─── GitHub Account (PAT) ────────────────────────────────────────────────────

/** GET /api/github/account — return connected account info for current user (token masked) */
router.get('/account', requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.sub;
  const account = getDb()
    .prepare('SELECT * FROM github_accounts WHERE user_id = ? LIMIT 1')
    .get(userId) as any;
  if (!account) return res.json({ connected: false });
  return res.json({
    connected: true,
    github_login: account.github_login,
    github_name: account.github_name,
    avatar_url: account.avatar_url,
    scopes: account.scopes,
    token_hint: maskToken(account.token),
    created_at: account.created_at,
  });
});

/** POST /api/github/account — save/update PAT for current user */
router.post('/account', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.sub;
  const { token } = req.body;
  if (!token || typeof token !== 'string' || !token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
    return res.status(400).json({ error: 'A valid GitHub Personal Access Token is required (starts with ghp_ or github_pat_)' });
  }

  // Validate token against GitHub API and fetch user info
  let login = '', name = '', avatarUrl = '', scopes = '';
  try {
    const axios = require('axios');
    const resp = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        'User-Agent': 'Podium/4.0',
      },
    });
    login = resp.data.login;
    name = resp.data.name || login;
    avatarUrl = resp.data.avatar_url || '';
    scopes = resp.headers['x-oauth-scopes'] || '';
  } catch (err: any) {
    const status = err.response?.status;
    if (status === 401) return res.status(400).json({ error: 'Token is invalid or expired' });
    return res.status(400).json({ error: `GitHub API error: ${err.message}` });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM github_accounts WHERE user_id = ?').get(userId) as any;
  if (existing) {
    db.prepare(`
      UPDATE github_accounts
      SET token = ?, github_login = ?, github_name = ?, avatar_url = ?, scopes = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(token, login, name, avatarUrl, scopes, userId);
  } else {
    db.prepare(`
      INSERT INTO github_accounts (id, user_id, token, github_login, github_name, avatar_url, scopes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, token, login, name, avatarUrl, scopes);
  }

  return res.json({
    connected: true,
    github_login: login,
    github_name: name,
    avatar_url: avatarUrl,
    scopes,
    token_hint: maskToken(token),
  });
});

/** DELETE /api/github/account — disconnect GitHub account for current user */
router.delete('/account', requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.sub;
  getDb().prepare('DELETE FROM github_accounts WHERE user_id = ?').run(userId);
  return res.json({ ok: true });
});

// ─── GitHub Repositories (from API) ─────────────────────────────────────────

/** GET /api/github/user-repos — fetch all repos from GitHub for authenticated user */
router.get('/user-repos', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.sub;
  const account = getDb()
    .prepare('SELECT token FROM github_accounts WHERE user_id = ?')
    .get(userId) as any;
  if (!account) return res.status(400).json({ error: 'No GitHub account connected. Add a Personal Access Token first.' });

  try {
    const axios = require('axios');
    const perPage = 100;
    let page = 1;
    const allRepos: any[] = [];

    // Paginate through all repos
    while (true) {
      const resp = await axios.get('https://api.github.com/user/repos', {
        headers: {
          Authorization: `token ${account.token}`,
          'User-Agent': 'Podium/4.0',
          Accept: 'application/vnd.github+json',
        },
        params: { per_page: perPage, page, sort: 'updated', affiliation: 'owner,collaborator,organization_member' },
      });
      const batch = resp.data || [];
      allRepos.push(...batch);
      if (batch.length < perPage) break;
      page++;
      if (page > 10) break; // safety cap at 1000 repos
    }

    const repos = allRepos.map((r: any) => ({
      id: r.id,
      full_name: r.full_name,
      name: r.name,
      owner: r.owner?.login,
      private: r.private,
      description: r.description || '',
      default_branch: r.default_branch || 'main',
      language: r.language || '',
      stargazers_count: r.stargazers_count || 0,
      updated_at: r.updated_at,
      html_url: r.html_url,
      clone_url: r.clone_url,
    }));

    return res.json(repos);
  } catch (err: any) {
    const status = err.response?.status;
    if (status === 401) return res.status(401).json({ error: 'GitHub token is invalid or expired. Please reconnect.' });
    return res.status(500).json({ error: `Failed to fetch repositories: ${err.message}` });
  }
});

/** GET /api/github/user-repos/:owner/:repo/branches — list branches for a repo */
router.get('/user-repos/:owner/:repo/branches', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.sub;
  const account = getDb()
    .prepare('SELECT token FROM github_accounts WHERE user_id = ?')
    .get(userId) as any;
  if (!account) return res.status(400).json({ error: 'No GitHub account connected.' });

  const { owner, repo } = req.params;
  try {
    const resp = await ghFetch(`/repos/${owner}/${repo}/branches`, account.token, {
      params: { per_page: 50 },
    });
    return res.json((resp.data || []).map((b: any) => b.name));
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to fetch branches: ${err.message}` });
  }
});

// ─── Legacy connected-repo endpoints (kept for backward compat) ───────────────

router.get('/repos', requireAuth, (_req, res: Response) => {
  const repos = getDb().prepare('SELECT * FROM github_repos ORDER BY created_at DESC').all();
  res.json(repos);
});

router.post('/connect', requireAuth, requireRole('admin', 'developer'), async (req: AuthRequest, res: Response) => {
  const { repo_url, branch = 'main', token, auto_deploy = false } = req.body;
  if (!repo_url) return res.status(400).json({ error: 'repo_url is required' });

  const existing = getDb().prepare('SELECT id FROM github_repos WHERE repo_url = ?').get(repo_url);
  if (existing) return res.status(409).json({ error: 'Repository already connected' });

  const repoPath = repo_url.replace('https://github.com/', '');
  let commitSha = null, commitMessage = null;

  try {
    const axios = require('axios');
    const headers: Record<string, string> = { 'User-Agent': 'Podium/4.0' };

    // Prefer user's stored PAT if no explicit token provided
    if (token) {
      headers['Authorization'] = `token ${token}`;
    } else {
      const userId = (req as AuthRequest).user!.sub;
      const account = getDb().prepare('SELECT token FROM github_accounts WHERE user_id = ?').get(userId) as any;
      if (account?.token) headers['Authorization'] = `token ${account.token}`;
    }
    const resp = await axios.get(`https://api.github.com/repos/${repoPath}/commits/${branch}`, { headers });
    commitSha = resp.data.sha?.slice(0, 7);
    commitMessage = resp.data.commit?.message?.split('\n')[0];
  } catch { }

  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO github_repos (id, repo_url, branch, token, auto_deploy, last_commit_sha, last_commit_message, last_synced, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'connected')
  `).run(id, repo_url, branch, token || null, auto_deploy ? 1 : 0, commitSha, commitMessage);

  const repo = getDb().prepare('SELECT * FROM github_repos WHERE id = ?').get(id);
  return res.status(201).json(repo);
});

router.delete('/repos/:id', requireAuth, requireRole('admin'), (req, res: Response) => {
  getDb().prepare('DELETE FROM github_repos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/repos/:id/pull', requireAuth, async (req, res: Response) => {
  const repo = getDb().prepare('SELECT * FROM github_repos WHERE id = ?').get(req.params.id) as any;
  if (!repo) return res.status(404).json({ error: 'Repo not found' });

  const repoPath = repo.repo_url.replace('https://github.com/', '');
  let commitSha = null, commitMessage = null;

  try {
    const axios = require('axios');
    const headers: Record<string, string> = { 'User-Agent': 'Podium/4.0' };
    if (repo.token) headers['Authorization'] = `token ${repo.token}`;
    const resp = await axios.get(`https://api.github.com/repos/${repoPath}/commits/${repo.branch}`, { headers });
    commitSha = resp.data.sha?.slice(0, 7);
    commitMessage = resp.data.commit?.message?.split('\n')[0];
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to fetch: ${err.message}` });
  }

  getDb().prepare(`
    UPDATE github_repos SET last_commit_sha = ?, last_commit_message = ?, last_synced = datetime('now') WHERE id = ?
  `).run(commitSha, commitMessage, repo.id);

  return res.json({ ok: true, commitSha, commitMessage });
});

router.post('/repos/:id/build', requireAuth, (req, res: Response) => {
  const repo = getDb().prepare('SELECT * FROM github_repos WHERE id = ?').get(req.params.id) as any;
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  res.json({ ok: true, message: 'Build triggered', jobId: uuidv4() });
});

// ─── Upload ZIP → create GitHub repo → return repo URL for AI Deploy ─────────
// Used by the "Upload ZIP" input mode in the AI Deployment Engine. Extracts the
// uploaded archive, creates a new repo on the user's GitHub account, and pushes
// the contents as a single initial commit using the Git Data API (no local git
// binary or filesystem clone required — works in a stateless server).

const SKIP_PATTERNS = /(^|\/)(node_modules|\.git|dist|\.next|build|\.cache|__pycache__|\.venv|venv)(\/|$)/;
const MAX_ZIP_FILES = 1500;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB per file (GitHub blob API limit is ~100MB, keep well under)

router.post('/upload-zip', requireAuth, requireRole('admin', 'developer'), upload.single('file'), async (req: AuthRequest, res: Response) => {
  const axios = require('axios');
  const AdmZip = require('adm-zip');

  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name must be "file")' });

  const rawName = String(req.body?.repoName || '').trim();
  const isPrivate = req.body?.private === 'true' || req.body?.private === true;

  const userId = req.user!.sub;
  const token = getUserGithubToken(userId);
  if (!token) return res.status(400).json({ error: 'Connect your GitHub account first (Settings → GitHub) before uploading a project.' });

  const headers = {
    Authorization: `token ${token}`,
    'User-Agent': 'Podium/4.0',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // 1. Extract zip in memory
  let zip: any;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch (e: any) {
    return res.status(400).json({ error: 'Could not read the uploaded file as a zip archive.' });
  }

  const entries = zip.getEntries().filter((e: any) => !e.isDirectory);
  if (entries.length === 0) return res.status(400).json({ error: 'The zip archive is empty.' });

  // Detect and strip a single common top-level folder (e.g. "my-project-main/")
  const allPaths: string[] = entries.map((e: any) => e.entryName.replace(/\\/g, '/'));
  const firstSegments = new Set(allPaths.map(p => p.split('/')[0]));
  const commonPrefix = firstSegments.size === 1 && !firstSegments.has('') ? `${[...firstSegments][0]}/` : '';

  type FileEntry = { path: string; buf: Buffer };
  const files: FileEntry[] = [];
  for (const entry of entries) {
    let relPath = entry.entryName.replace(/\\/g, '/');
    if (commonPrefix && relPath.startsWith(commonPrefix)) relPath = relPath.slice(commonPrefix.length);
    if (!relPath || SKIP_PATTERNS.test(relPath)) continue;
    const buf: Buffer = entry.getData();
    if (buf.length > MAX_FILE_BYTES) continue; // silently skip oversized assets
    files.push({ path: relPath, buf });
    if (files.length >= MAX_ZIP_FILES) break;
  }
  if (files.length === 0) {
    return res.status(400).json({ error: 'No usable files found after filtering (node_modules, .git, build output, etc. are excluded).' });
  }

  // 2. Resolve authenticated user + repo name
  let ghUser: any;
  try {
    const me = await axios.get('https://api.github.com/user', { headers });
    ghUser = me.data;
  } catch {
    return res.status(401).json({ error: 'GitHub token is invalid or expired. Reconnect it in Settings → GitHub.' });
  }

  const slug = (rawName || `podium-upload-${Date.now()}`)
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || `podium-upload-${Date.now()}`;

  let repoFullName = `${ghUser.login}/${slug}`;
  let createdRepo: any;
  try {
    const createResp = await axios.post('https://api.github.com/user/repos', {
      name: slug,
      private: !!isPrivate,
      auto_init: true, // creates an initial commit + default branch so we have a base tree to build on
      description: 'Uploaded to Podium via AI Deployment Engine',
    }, { headers });
    createdRepo = createResp.data;
  } catch (e: any) {
    if (e.response?.status === 422) {
      return res.status(409).json({ error: `A repository named "${slug}" already exists on your GitHub account. Choose a different name.` });
    }
    return res.status(500).json({ error: `Failed to create GitHub repo: ${e.response?.data?.message || e.message}` });
  }

  const defaultBranch: string = createdRepo.default_branch || 'main';

  try {
    // 3. Get the base commit/tree created by auto_init
    const refResp = await axios.get(`https://api.github.com/repos/${repoFullName}/git/ref/heads/${defaultBranch}`, { headers });
    const baseCommitSha = refResp.data.object.sha;
    const baseCommitResp = await axios.get(`https://api.github.com/repos/${repoFullName}/git/commits/${baseCommitSha}`, { headers });
    const baseTreeSha = baseCommitResp.data.tree.sha;

    // 4. Create a blob for every file (chunked to avoid API rate spikes)
    const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    const chunkSize = 15;
    for (let i = 0; i < files.length; i += chunkSize) {
      const chunk = files.slice(i, i + chunkSize);
      const blobs = await Promise.all(chunk.map(async f => {
        const isBinary = f.buf.some(b => b === 0);
        const blobResp = await axios.post(`https://api.github.com/repos/${repoFullName}/git/blobs`, {
          content: isBinary ? f.buf.toString('base64') : f.buf.toString('utf-8'),
          encoding: isBinary ? 'base64' : 'utf-8',
        }, { headers });
        return { path: f.path, sha: blobResp.data.sha };
      }));
      for (const b of blobs) {
        treeItems.push({ path: b.path, mode: '100644', type: 'blob', sha: b.sha });
      }
    }

    // 5. Create tree, commit, and move the branch ref forward
    const treeResp = await axios.post(`https://api.github.com/repos/${repoFullName}/git/trees`, {
      base_tree: baseTreeSha,
      tree: treeItems,
    }, { headers });

    const commitResp = await axios.post(`https://api.github.com/repos/${repoFullName}/git/commits`, {
      message: `Initial upload via Podium (${files.length} files)`,
      tree: treeResp.data.sha,
      parents: [baseCommitSha],
    }, { headers });

    await axios.patch(`https://api.github.com/repos/${repoFullName}/git/refs/heads/${defaultBranch}`, {
      sha: commitResp.data.sha,
    }, { headers });

    return res.status(201).json({
      repoUrl: createdRepo.html_url,
      fullName: repoFullName,
      branch: defaultBranch,
      fileCount: files.length,
    });
  } catch (e: any) {
    // Best-effort cleanup: delete the repo we just created if the push failed midway
    try { await axios.delete(`https://api.github.com/repos/${repoFullName}`, { headers }); } catch {}
    return res.status(500).json({ error: `Failed to push files to GitHub: ${e.response?.data?.message || e.message}` });
  }
});

router.post('/webhook', (req, res: Response) => {
  const event = req.headers['x-github-event'];
  if (event !== 'push') return res.json({ ok: true });

  const { repository, ref, after, head_commit } = req.body;
  const repoUrl = repository?.html_url;
  const branch = ref?.replace('refs/heads/', '');

  if (!repoUrl || !branch) return res.json({ ok: true });

  const repo = getDb().prepare('SELECT * FROM github_repos WHERE repo_url = ? AND branch = ?').get(repoUrl, branch) as any;
  if (!repo || !repo.auto_deploy) return res.json({ ok: true });

  getDb().prepare(`
    UPDATE github_repos SET last_commit_sha = ?, last_commit_message = ?, last_synced = datetime('now') WHERE id = ?
  `).run(after?.slice(0, 7), head_commit?.message?.split('\n')[0], repo.id);

  console.log(`[webhook] Auto-deploy triggered for ${repoUrl}#${branch}`);
  res.json({ ok: true });
});

export default router;
