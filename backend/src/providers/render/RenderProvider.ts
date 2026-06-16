import axios, { AxiosInstance } from 'axios';
import { IProvider, DeployOptions, DeployResult, ProviderStatus, ProviderLog } from '../IProvider';

export class RenderProvider implements IProvider {
  readonly id = 'render';
  readonly name = 'Render';
  readonly isDemo = false;

  private client(apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: 'https://api.render.com/v1',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  }

  async connect(creds: Record<string, string>) {
    try {
      const r = await this.client(creds.render_api_key).get('/owners?limit=1');
      if (r.status === 200) return { ok: true };
      return { ok: false, error: 'Unexpected response from Render API' };
    } catch (e: any) {
      return { ok: false, error: e?.response?.data?.message || e.message || 'Connection failed' };
    }
  }

  async deploy(creds: Record<string, string>, opts: DeployOptions, deploymentId: string): Promise<DeployResult> {
    const c = this.client(creds.render_api_key);
    const ownerId = creds.render_owner_id;

    try {
      // Create a web service
      const envVars = opts.envVars
        ? Object.entries(opts.envVars).map(([key, value]) => ({ key, value }))
        : [];

      const payload: any = {
        type: 'web_service',
        name: opts.name,
        ownerId,
        region: opts.region || 'oregon',
        plan: 'free',
        envVars,
      };

      if (opts.repoUrl) {
        payload.repo = opts.repoUrl;
        payload.branch = opts.branch || 'main';
        payload.autoDeploy = 'yes';
        if (opts.buildCommand) payload.buildCommand = opts.buildCommand;
        if (opts.startCommand) payload.startCommand = opts.startCommand;
      } else if (opts.image) {
        payload.image = { ownerId, imagePath: opts.image };
      }

      const r = await c.post('/services', payload);
      const serviceId = r.data?.service?.id || deploymentId;
      const url = `https://${opts.name}.onrender.com`;
      return { deploymentId: serviceId, url, status: 'building' };
    } catch (e: any) {
      throw new Error(e?.response?.data?.message || 'Render deploy failed');
    }
  }

  async getStatus(creds: Record<string, string>, deploymentId: string): Promise<ProviderStatus> {
    try {
      const r = await this.client(creds.render_api_key).get(`/services/${deploymentId}`);
      const svc = r.data?.service || r.data;
      const statusMap: Record<string, ProviderStatus['status']> = {
        live: 'live', building: 'building', deploying: 'deploying',
        failed: 'failed', suspended: 'suspended',
      };
      return {
        deploymentId,
        status: statusMap[svc.suspended === 'suspended' ? 'suspended' : svc.deploy?.status] || 'queued',
        url: svc.serviceDetails?.url,
        updatedAt: svc.updatedAt || new Date().toISOString(),
      };
    } catch {
      return { deploymentId, status: 'queued', updatedAt: new Date().toISOString() };
    }
  }

  async getLogs(creds: Record<string, string>, deploymentId: string): Promise<ProviderLog[]> {
    try {
      const r = await this.client(creds.render_api_key).get(`/services/${deploymentId}/deploys?limit=1`);
      const deploy = r.data?.[0]?.deploy;
      if (!deploy) return [];
      const lr = await this.client(creds.render_api_key).get(`/services/${deploymentId}/deploys/${deploy.id}/logs`);
      return (lr.data || []).map((l: any) => ({
        time: l.timestamp || new Date().toISOString(),
        message: l.text || '',
        level: 'info' as const,
      }));
    } catch {
      return [{ time: new Date().toISOString(), message: 'Logs unavailable', level: 'warn' }];
    }
  }

  async deleteDeployment(creds: Record<string, string>, deploymentId: string): Promise<void> {
    try {
      await this.client(creds.render_api_key).delete(`/services/${deploymentId}`);
    } catch (e: any) {
      throw new Error(e?.response?.data?.message || 'Delete failed');
    }
  }
}
