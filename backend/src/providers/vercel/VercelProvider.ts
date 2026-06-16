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

  async deploy(creds: Record<string, string>, opts: DeployOptions, deploymentId: string): Promise<DeployResult> {
    try {
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
      const r = await c.post(`/v13/deployments${params}`, payload);
      const dep = r.data;

      return {
        deploymentId: dep.id,
        url: dep.url ? `https://${dep.url}` : undefined,
        status: dep.readyState === 'READY' ? 'live' : 'building',
      };
    } catch (e: any) {
      throw new Error(e?.response?.data?.error?.message || 'Vercel deploy failed');
    }
  }

  async getStatus(creds: Record<string, string>, deploymentId: string): Promise<ProviderStatus> {
    try {
      const teamId = creds.vercel_team_id;
      const params = teamId ? `?teamId=${teamId}` : '';
      const r = await this.client(creds.vercel_token).get(`/v13/deployments/${deploymentId}${params}`);
      const dep = r.data;

      const statusMap: Record<string, ProviderStatus['status']> = {
        READY: 'live', BUILDING: 'building', DEPLOYING: 'deploying',
        ERROR: 'failed', CANCELED: 'failed', QUEUED: 'queued',
      };

      return {
        deploymentId,
        status: statusMap[dep.readyState] || 'queued',
        url: dep.url ? `https://${dep.url}` : undefined,
        updatedAt: dep.updatedAt ? new Date(dep.updatedAt).toISOString() : new Date().toISOString(),
      };
    } catch {
      return { deploymentId, status: 'queued', updatedAt: new Date().toISOString() };
    }
  }

  async getLogs(creds: Record<string, string>, deploymentId: string): Promise<ProviderLog[]> {
    try {
      const teamId = creds.vercel_team_id;
      const params = teamId ? `?teamId=${teamId}` : '';
      const r = await this.client(creds.vercel_token).get(`/v2/deployments/${deploymentId}/events${params}`);
      return (r.data || []).map((e: any) => ({
        time: e.created ? new Date(e.created).toISOString() : new Date().toISOString(),
        message: e.text || e.payload?.text || JSON.stringify(e.payload || ''),
        level: e.type === 'error' ? 'error' as const : 'info' as const,
      }));
    } catch {
      return [{ time: new Date().toISOString(), message: 'Logs unavailable', level: 'warn' }];
    }
  }

  async deleteDeployment(creds: Record<string, string>, deploymentId: string): Promise<void> {
    try {
      const teamId = creds.vercel_team_id;
      const params = teamId ? `?teamId=${teamId}` : '';
      await this.client(creds.vercel_token).delete(`/v13/deployments/${deploymentId}${params}`);
    } catch (e: any) {
      throw new Error(e?.response?.data?.error?.message || 'Delete failed');
    }
  }
}
