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

  async deploy(creds: Record<string, string>, opts: DeployOptions, _localId: string): Promise<DeployResult> {
    console.log(`[vercel] Deploying name=${opts.name} repoUrl=${opts.repoUrl}`);

    const c = this.client(creds.vercel_token);
    const teamId = creds.vercel_team_id;

    const payload: any = {
      name: opts.name,
      gitSource: opts.repoUrl ? {
        type: 'github',
        repoUrl: opts.repoUrl,
        ref: opts.branch || 'main',
      } : undefined,
      env: opts.envVars
        ? Object.entries(opts.envVars).map(([key, value]) => ({ key, value, target: ['production'] }))
        : [],
    };

    const params = teamId ? `?teamId=${teamId}` : '';
    const r = await c.post(`/v13/deployments${params}`, payload).catch((e: any) => {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.message || e.message || 'Vercel API error';
      console.error(`[vercel] Deploy failed: ${msg}`, e?.response?.data);
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
