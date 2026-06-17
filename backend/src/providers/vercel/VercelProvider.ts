import axios, { AxiosInstance } from 'axios';
import { IProvider, DeployOptions, DeployResult, ProviderStatus, ProviderLog } from '../IProvider';

export class VercelProvider implements IProvider {
  readonly id = 'vercel';
  readonly name = 'Vercel';
  readonly isDemo = false;

  private client(token: string): AxiosInstance {
    return axios.create({
      baseURL: 'https://api.vercel.com',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  }

  async connect(creds: Record<string, string>) {
    try {
      const r = await this.client(creds.vercel_token).get('/v2/user');
      if (r.data?.user?.id) return { ok: true };
      return { ok: false, error: 'Invalid Vercel token' };
    } catch (e: any) {
      return { ok: false, error: e?.response?.data?.error?.message || e.message || 'Connection failed' };
    }
  }

  /**
   * Resolve a GitHub repo URL to the numeric Vercel repo ID needed by the API.
   * Vercel's /v13/deployments requires gitSource.repoId (numeric) not just repoUrl.
   */
  private async resolveGithubRepoId(token: string, teamId: string | undefined, repoUrl: string): Promise<{ repoId: number; repoName: string }> {
    // Extract owner/repo from URL
    const match = repoUrl.replace(/\.git$/, '').match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/);
    if (!match) throw new Error(`Cannot parse GitHub URL: ${repoUrl}`);
    const owner = match[1];
    const repo = match[2];
    const repoFullName = `${owner}/${repo}`;

    const params = teamId ? `?teamId=${teamId}` : '';
    const c = this.client(token);

    // Check if a Vercel project linked to this repo already exists
    try {
      const projects = await c.get(`/v9/projects${params}&repoUrl=${encodeURIComponent(repoUrl)}&limit=10`);
      const existing = (projects.data?.projects || []).find((p: any) =>
        p.link?.repoId && (p.link?.repoFullName === repoFullName || p.link?.repoUrl === repoUrl)
      );
      if (existing?.link?.repoId) {
        return { repoId: existing.link.repoId, repoName: existing.link.repoFullName || repoFullName };
      }
    } catch {
      // ignore, will try GitHub API next
    }

    // Try Vercel's GitHub integration to find the repo
    try {
      const ghRepos = await c.get(`/v1/integrations/git-namespaces${params}`);
      for (const ns of ghRepos.data?.namespaces || []) {
        const nsRepos = await c.get(`/v1/integrations/search-repos?namespace=${ns.id}&query=${encodeURIComponent(repo)}${teamId ? `&teamId=${teamId}` : ''}`);
        const found = (nsRepos.data?.repos || []).find((r: any) => r.full_name === repoFullName);
        if (found?.id) {
          return { repoId: found.id, repoName: found.full_name };
        }
      }
    } catch {
      // ignore
    }

    throw new Error(
      `Could not find GitHub repo "${repoFullName}" in your Vercel account. ` +
      `Please connect GitHub to Vercel at vercel.com/account/git, then link the repository.`
    );
  }

  /**
   * Get or create a Vercel project for the given name/repo.
   */
  private async getOrCreateProject(token: string, teamId: string | undefined, name: string, repoId: number, repoName: string, branch: string): Promise<string> {
    const params = teamId ? `?teamId=${teamId}` : '';
    const c = this.client(token);

    // Look for existing project with this name
    try {
      const r = await c.get(`/v9/projects/${encodeURIComponent(name)}${params}`);
      if (r.data?.id) {
        console.log(`[vercel] Found existing project: ${r.data.id}`);
        return r.data.id;
      }
    } catch (e: any) {
      if (e?.response?.status !== 404) throw e;
    }

    // Create a new project linked to the repo
    console.log(`[vercel] Creating new project name=${name} repoId=${repoId} repoName=${repoName}`);
    const createPayload: any = {
      name,
      framework: null,
      gitRepository: {
        type: 'github',
        repo: repoName,
      },
    };

    const created = await c.post(`/v10/projects${params}`, createPayload).catch((e: any) => {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.message || e.message;
      throw new Error(`Failed to create Vercel project: ${msg}`);
    });

    console.log(`[vercel] Project created: id=${created.data.id}`);
    return created.data.id;
  }

  async deploy(creds: Record<string, string>, opts: DeployOptions, _localId: string): Promise<DeployResult> {
    console.log(`[vercel] Deploying name=${opts.name} repoUrl=${opts.repoUrl}`);

    const c = this.client(creds.vercel_token);
    const teamId = creds.vercel_team_id || undefined;
    const params = teamId ? `?teamId=${teamId}` : '';
    const branch = opts.branch || 'main';

    // Build deployment payload
    const envVars = opts.envVars
      ? Object.entries(opts.envVars).map(([key, value]) => ({ key, value, target: ['production'] as string[] }))
      : [];

    let payload: any;

    if (opts.repoUrl) {
      // Resolve GitHub repo → get repoId required by Vercel API
      const { repoId, repoName } = await this.resolveGithubRepoId(creds.vercel_token, teamId, opts.repoUrl);
      console.log(`[vercel] Resolved repoId=${repoId} repoName=${repoName}`);

      // Ensure project exists
      await this.getOrCreateProject(creds.vercel_token, teamId, opts.name, repoId, repoName, branch);

      payload = {
        name: opts.name,
        target: 'production',
        gitSource: {
          type: 'github',
          repoId: repoId,
          ref: branch,
        },
        env: envVars,
      };
    } else {
      // No repo URL: deploy as a static/empty deployment (Vercel still needs a source)
      payload = {
        name: opts.name,
        target: 'production',
        files: [
          { file: 'index.html', data: '<html><body><h1>Deployed via Podium</h1></body></html>' },
        ],
        env: envVars,
      };
    }

    const r = await c.post(`/v13/deployments${params}`, payload).catch((e: any) => {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.message || e.message || 'Vercel API error';
      console.error(`[vercel] Deploy failed: ${msg}`, JSON.stringify(e?.response?.data));
      throw new Error(msg);
    });

    const dep = r.data;
    const vercelDepId = dep.id;

    if (!vercelDepId) {
      console.error('[vercel] No deployment ID in response:', JSON.stringify(dep));
      throw new Error('Vercel returned no deployment ID');
    }

    const url = dep.url ? `https://${dep.url}` : undefined;
    const status = dep.readyState === 'READY' ? 'live' : 'building';
    console.log(`[vercel] Deployment created: vercelDepId=${vercelDepId} url=${url} readyState=${dep.readyState}`);

    return { deploymentId: vercelDepId, url, status };
  }

  async getStatus(creds: Record<string, string>, deploymentId: string): Promise<ProviderStatus> {
    console.log(`[vercel] getStatus deploymentId=${deploymentId}`);

    const teamId = creds.vercel_team_id;
    const params = teamId ? `?teamId=${teamId}` : '';
    const r = await this.client(creds.vercel_token).get(`/v13/deployments/${deploymentId}${params}`).catch((e: any) => {
      const msg = e?.response?.data?.error?.message || e.message;
      console.error(`[vercel] getStatus failed: ${msg}`);
      throw new Error(msg);
    });

    const dep = r.data;
    const statusMap: Record<string, ProviderStatus['status']> = {
      READY: 'live', BUILDING: 'building', DEPLOYING: 'deploying',
      ERROR: 'failed', CANCELED: 'failed', QUEUED: 'queued',
      INITIALIZING: 'building',
    };

    const mapped = statusMap[dep.readyState] || 'building';
    console.log(`[vercel] deploymentId=${deploymentId} readyState=${dep.readyState} mapped=${mapped}`);

    return {
      deploymentId,
      status: mapped,
      url: dep.url ? `https://${dep.url}` : undefined,
      updatedAt: dep.updatedAt ? new Date(dep.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  async getLogs(creds: Record<string, string>, deploymentId: string): Promise<ProviderLog[]> {
    console.log(`[vercel] getLogs deploymentId=${deploymentId}`);

    const teamId = creds.vercel_team_id;
    const params = teamId ? `?teamId=${teamId}` : '';
    const r = await this.client(creds.vercel_token).get(`/v2/deployments/${deploymentId}/events${params}`).catch((e: any) => {
      const msg = e?.response?.data?.error?.message || e.message;
      console.error(`[vercel] getLogs failed: ${msg}`);
      throw new Error(msg);
    });

    return (r.data || []).map((e: any) => ({
      time: e.created ? new Date(e.created).toISOString() : new Date().toISOString(),
      message: e.text || e.payload?.text || JSON.stringify(e.payload || ''),
      level: e.type === 'error' ? 'error' as const : 'info' as const,
    }));
  }

  async deleteDeployment(creds: Record<string, string>, deploymentId: string): Promise<void> {
    console.log(`[vercel] deleteDeployment deploymentId=${deploymentId}`);

    const teamId = creds.vercel_team_id;
    const params = teamId ? `?teamId=${teamId}` : '';
    await this.client(creds.vercel_token).delete(`/v13/deployments/${deploymentId}${params}`).catch((e: any) => {
      const msg = e?.response?.data?.error?.message || e.message || 'Delete failed';
      console.error(`[vercel] Delete failed: ${msg}`);
      throw new Error(msg);
    });

    console.log(`[vercel] Deployment deleted: deploymentId=${deploymentId}`);
  }
}
