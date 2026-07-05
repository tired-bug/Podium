import axios from 'axios';
import { RepoContext, RepoFile } from './types';

/** Files to fetch full content for (ordered by priority) */
const CONFIG_FILES = [
  // Provider-native
  'vercel.json', '.vercel/project.json',
  'render.yaml', 'render.yml',
  'railway.json', 'railway.toml',
  'nixpacks.toml',
  'Procfile',
  // Docker
  'Dockerfile', 'dockerfile',
  'docker-compose.yml', 'docker-compose.yaml',
  // Manifests
  'package.json',
  'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile',
  'Cargo.toml',
  'go.mod',
  'pom.xml', 'build.gradle', 'build.gradle.kts',
  'composer.json',
  '*.csproj', 'global.json',
  // Lock files (content not needed — existence signals pkg manager)
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  // Framework configs
  'next.config.js', 'next.config.ts', 'next.config.mjs',
  'vite.config.js', 'vite.config.ts',
  'angular.json',
  'nuxt.config.js', 'nuxt.config.ts',
  'svelte.config.js',
  'astro.config.mjs',
  // GitHub Actions (existence only)
  '.github/workflows',
  // Node version hints
  '.node-version', '.nvmrc',
  '.python-version',
  // Turborepo / nx
  'turbo.json', 'nx.json', 'lerna.json', 'pnpm-workspace.yaml',
];

const CONTENT_FILES = new Set([
  'package.json', 'vercel.json', 'render.yaml', 'render.yml',
  'railway.json', 'railway.toml', 'nixpacks.toml', 'Procfile',
  'Dockerfile', 'dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  'next.config.js', 'next.config.ts', 'next.config.mjs',
  'vite.config.js', 'vite.config.ts',
  'angular.json', 'nuxt.config.js', 'nuxt.config.ts', 'svelte.config.js',
  'pyproject.toml', 'setup.py', 'requirements.txt',
  'go.mod', 'Cargo.toml', 'composer.json',
  '.node-version', '.nvmrc', '.python-version',
  'turbo.json', 'nx.json', 'pnpm-workspace.yaml',
]);

interface GHTree {
  path: string;
  type: string;
  size?: number;
}

export class RepoInspector {
  private headers: Record<string, string>;

  constructor(private githubToken?: string) {
    this.headers = {
      'User-Agent': 'Podium-AI-Deploy/1.0',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(githubToken ? { Authorization: `token ${githubToken}` } : {}),
    };
  }

  private gh(path: string) {
    return axios.get(`https://api.github.com${path}`, {
      headers: this.headers,
      timeout: 20000,
    });
  }

  /** Fetch the flat repo tree (one API call) and selected file contents */
  async inspect(repoUrl: string, branch: string): Promise<RepoContext> {
    const match = repoUrl.replace(/\.git$/, '').match(/github\.com[/:]([^/]+)\/([^/]+)/);
    if (!match) throw new Error(`Cannot parse GitHub URL: ${repoUrl}`);
    const owner = match[1];
    const repo = match[2];

    // Fetch tree (recursive)
    let tree: GHTree[] = [];
    try {
      const res = await this.gh(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
      tree = (res.data.tree || []) as GHTree[];
    } catch (e: any) {
      if (e?.response?.status === 409) {
        // Empty repo
        return { files: [], owner, repo, branch, configFiles: {} };
      }
      throw new Error(`Failed to fetch repo tree: ${e?.response?.data?.message || e.message}`);
    }

    const files: RepoFile[] = tree
      .filter(t => t.type === 'blob')
      .map(t => ({ path: t.path }));

    // Determine which config files exist in this repo
    const filePaths = new Set(files.map(f => f.path));
    const filePathsLower = new Set(files.map(f => f.path.toLowerCase()));

    const toFetch: string[] = [];
    for (const cf of CONFIG_FILES) {
      // exact match
      if (filePaths.has(cf) && CONTENT_FILES.has(cf)) {
        toFetch.push(cf);
        continue;
      }
      // case-insensitive match
      const lower = cf.toLowerCase();
      if (filePathsLower.has(lower) && CONTENT_FILES.has(lower)) {
        const actual = files.find(f => f.path.toLowerCase() === lower)?.path;
        if (actual) toFetch.push(actual);
      }
    }

    // Also look for Dockerfiles in subdirs, package.json in subdirs, etc.
    for (const f of files) {
      const base = f.path.split('/').pop() || '';
      if (
        CONTENT_FILES.has(base) &&
        !toFetch.includes(f.path) &&
        toFetch.length < 40
      ) {
        toFetch.push(f.path);
      }
    }

    // Fetch contents in parallel (max 30 concurrent)
    const configFiles: Record<string, string> = {};
    const chunks: string[][] = [];
    for (let i = 0; i < toFetch.length; i += 10) chunks.push(toFetch.slice(i, i + 10));

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async path => {
          try {
            const r = await this.gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`);
            if (r.data.encoding === 'base64' && r.data.content) {
              configFiles[path] = Buffer.from(r.data.content, 'base64').toString('utf-8');
            }
          } catch { /* skip missing */ }
        })
      );
    }

    return { files, owner, repo, branch, configFiles };
  }
}
