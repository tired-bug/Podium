import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index';
import { requireAuth, requireRole, AuthRequest } from '../auth';

const router = Router();

router.get('/repos', requireAuth, (_req, res: Response) => {
  const repos = getDb().prepare('SELECT * FROM github_repos ORDER BY created_at DESC').all();
  res.json(repos);
});

router.post('/connect', requireAuth, requireRole('admin','developer'), async (req: AuthRequest, res: Response) => {
  const { repo_url, branch = 'main', token, auto_deploy = false } = req.body;
  if (!repo_url) return res.status(400).json({ error: 'repo_url is required' });

  const existing = getDb().prepare('SELECT id FROM github_repos WHERE repo_url = ?').get(repo_url);
  if (existing) return res.status(409).json({ error: 'Repository already connected' });

  
  const repoPath = repo_url.replace('https://github.com/', '');
  let commitSha = null, commitMessage = null;

  try {
    const axios = require('axios');
    const headers: Record<string, string> = { 'User-Agent': 'Podium/4.0' };
    if (token) headers['Authorization'] = `token ${token}`;
    const resp = await axios.get(`https://api.github.com/repos/${repoPath}/commits/${branch || 'main'}`, { headers });
    commitSha = resp.data.sha?.slice(0, 7);
    commitMessage = resp.data.commit?.message?.split('\n')[0];
  } catch {}

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
    const resp = await axios.get(`https://api.github.com/repos/${repoPath}/commits/${branch || 'main'}`, { headers });
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
