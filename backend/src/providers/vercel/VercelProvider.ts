import axios, { AxiosInstance } from 'axios';
import { IProvider, DeployOptions, DeployResult, ProviderStatus, ProviderLog } from '../IProvider';

export class VercelProvider implements IProvider {
  readonly id = 'vercel';
  readonly name = 'Vercel';

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
   * Download a GitHub repo's source as a zip archive and unpack it into an
   * in-memory file list. This lets Vercel deployments work straight from a
   * Vercel API token — no pre-linked GitHub↔Vercel integration required.
   */
  private async fetchRepoSource(repoUrl: string, branch: string, githubToken?: string): Promise<{ files: Array<{ path: string; data: Buffer }>; repoName: string }> {
    const match = repoUrl.replace(/\.git$/, '').match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/);
    if (!match) throw new Error(`Cannot parse GitHub URL: ${repoUrl}`);
    const owner = match[1];
    const repo = match[2];
    const repoFullName = `${owner}/${repo}`;

    const headers: Record<string, string> = { 'User-Agent': 'Podium-Deploy' };
    if (githubToken) headers['Authorization'] = `token ${githubToken}`;

    let res;
    try {
      res = await axios.get(`https://api.github.com/repos/${repoFullName}/zipball/${encodeURIComponent(branch)}`, {
        headers,
        responseType: 'arraybuffer',
        maxRedirects: 5,
        timeout: 60000,
      });
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        throw new Error(`Could not download "${repoFullName}" (branch "${branch}"). Check the repository URL and branch — if it's private, connect it with a token under GitHub in Podium first.`);
      }
      throw new Error(`Failed to download repository archive: ${e?.response?.data?.message || e.message}`);
    }

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(Buffer.from(res.data));
    const entries = zip.getEntries();
    const files: Array<{ path: string; data: Buffer }> = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      // GitHub wraps zipball contents in a top-level "{owner}-{repo}-{sha}/" folder
      const parts = entry.entryName.split('/');
      parts.shift();
      const relPath = parts.join('/');
      if (!relPath) continue;
      if (relPath.startsWith('.git/')) continue;
      if (relPath.startsWith('node_modules/')) continue;
      files.push({ path: relPath, data: entry.getData() });
    }

    if (files.length === 0) {
      throw new Error(`No deployable files found in ${repoFullName}@${branch}`);
    }

    return { files, repoName: repoFullName };
  }

  /**
   * Upload file contents to Vercel's content-addressable file store, returning
   * the {file, sha, size} references the deployments API expects. This is the
   * same mechanism the Vercel CLI uses to deploy a local folder without git.
   */
  private async uploadFiles(token: string, teamId: string | undefined, files: Array<{ path: string; data: Buffer }>): Promise<Array<{ file: string; sha: string; size: number }>> {
    const crypto = require('crypto');
    const params = teamId ? `?teamId=${teamId}` : '';
    const refs: Array<{ file: string; sha: string; size: number }> = [];

    for (const f of files) {
      const sha = crypto.createHash('sha1').update(f.data).digest('hex');
      try {
        await axios.post(`https://api.vercel.com/v2/files${params}`, f.data, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
            'x-vercel-digest': sha,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 30000,
        });
      } catch (e: any) {
        const msg = e?.response?.data?.error?.message || e.message;
        throw new Error(`Failed to upload "${f.path}" to Vercel: ${msg}`);
      }
      refs.push({ file: f.path, sha, size: f.data.length });
    }

    return refs;
  }

  /**
   * Get or create a Vercel project by name. No git repository linkage is
   * required — source is supplied directly via the files array at deploy time.
   */
  private async ensureProject(token: string, teamId: string | undefined, name: string, framework?: string, rootDirectory?: string, buildCommand?: string, outputDirectory?: string): Promise<string> {
    const params = teamId ? `?teamId=${teamId}` : '';
    const c = this.client(token);

    try {
      const r = await c.get(`/v9/projects/${encodeURIComponent(name)}${params}`);
      if (r.data?.id) {
        console.log(`[vercel] Found existing project: ${r.data.id}`);
        return r.data.id;
      }
    } catch (e: any) {
      if (e?.response?.status !== 404) throw e;
    }

    console.log(`[vercel] Creating new project name=${name} framework=${framework || 'none'} (no GitHub link required)`);
    const createPayload: any = { name, framework: framework || null };
    if (rootDirectory) createPayload.rootDirectory = rootDirectory;
    if (buildCommand) createPayload.buildCommand = buildCommand;
    if (outputDirectory) createPayload.outputDirectory = outputDirectory;

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
    const envVars = opts.envVars || {};

    let payload: any;

    if (opts.repoUrl) {
      // Deploy straight from the repo's source — download it and upload the
      // files to Vercel directly. This works for a brand new Vercel account
      // with only a valid API token; no GitHub↔Vercel integration is needed.
      const { files, repoName } = await this.fetchRepoSource(opts.repoUrl, branch, opts.githubToken);
      console.log(`[vercel] Downloaded ${files.length} files from ${repoName}@${branch}`);

      const fileRefs = await this.uploadFiles(creds.vercel_token, teamId, files);
      console.log(`[vercel] Uploaded ${fileRefs.length} files to Vercel`);

      // Ensure project exists (created from Podium, no repo linkage needed)
      await this.ensureProject(creds.vercel_token, teamId, opts.name, opts.framework, opts.rootDirectory, opts.buildCommand, opts.outputDirectory);

      payload = {
        name: opts.name,
        target: 'production',
        files: fileRefs,
        env: envVars,
      };
      if (opts.buildCommand) payload.buildCommand = opts.buildCommand;
      if (opts.outputDirectory) payload.outputDirectory = opts.outputDirectory;
      if (opts.framework) payload.framework = opts.framework;
      // NOTE: rootDirectory is a *project* setting (set via ensureProject above),
      // not a valid field on the deployment payload itself — the Vercel API
      // rejects POST /v13/deployments with "should NOT have additional
      // property `rootDirectory`" if it's included here.
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

  /**
   * List all recent deployments for the account/team.
   */
  async listDeployments(creds: Record<string, string>): Promise<Array<{ id: string; name: string; status: string; url?: string; createdAt?: string }>> {
    const teamId = creds.vercel_team_id || undefined;
    const params = teamId ? `?teamId=${teamId}&limit=50` : '?limit=50';
    const r = await this.client(creds.vercel_token).get(`/v6/deployments${params}`).catch((e: any) => {
      throw new Error(e?.response?.data?.error?.message || e.message);
    });
    const statusMap: Record<string, string> = {
      READY: 'live', BUILDING: 'building', ERROR: 'failed',
      CANCELED: 'failed', QUEUED: 'queued', INITIALIZING: 'building',
    };
    return (r.data?.deployments || []).map((d: any) => ({
      id: d.uid,
      name: d.name,
      status: statusMap[d.state] || 'building',
      url: d.url ? `https://${d.url}` : undefined,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
    }));
  }

  /**
   * List GitHub repos connected to Vercel account.
   */
  async listGithubRepos(creds: Record<string, string>): Promise<Array<{ id: number; fullName: string; private: boolean; defaultBranch: string }>> {
    const teamId = creds.vercel_team_id || undefined;
    const params = teamId ? `?teamId=${teamId}` : '';
    const c = this.client(creds.vercel_token);
    const allRepos: any[] = [];
    try {
      const nsRes = await c.get(`/v1/integrations/git-namespaces${params}`);
      for (const ns of nsRes.data?.namespaces || []) {
        try {
          const reposRes = await c.get(`/v1/integrations/search-repos?namespace=${ns.id}${teamId ? `&teamId=${teamId}` : ''}&limit=100`);
          allRepos.push(...(reposRes.data?.repos || []));
        } catch { /* skip */ }
      }
    } catch {
      // If namespaces fail, try listing projects for linked repos
    }
    return allRepos.map((r: any) => ({
      id: r.id,
      fullName: r.full_name,
      private: r.private || false,
      defaultBranch: r.default_branch || 'main',
    }));
  }
}
