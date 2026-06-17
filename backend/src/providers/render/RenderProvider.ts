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
      const r = await this.client(creds.render_api_key).get('/owners?limit=20');
      if (r.status === 200) return { ok: true };
      return { ok: false, error: 'Unexpected response from Render API' };
    } catch (e: any) {
      return { ok: false, error: e?.response?.data?.message || e.message || 'Connection failed' };
    }
  }

  /**
   * Fetch all Render owners/workspaces for the given API key.
   * Returns array of { id, name, type, email }.
   */
  async listOwners(apiKey: string): Promise<Array<{ id: string; name: string; type: string; email?: string }>> {
    const r = await this.client(apiKey).get('/owners?limit=20').catch((e: any) => {
      throw new Error(e?.response?.data?.message || e.message || 'Failed to list Render owners');
    });

    return (r.data || []).map((item: any) => {
      const owner = item.owner || item;
      return {
        id: owner.id,
        name: owner.name,
        type: owner.type || 'user',
        email: owner.email,
      };
    });
  }

  async deploy(creds: Record<string, string>, opts: DeployOptions, _localId: string): Promise<DeployResult> {
    const c = this.client(creds.render_api_key);

    // Resolve owner ID: use saved creds, or fetch the first available owner automatically
    let ownerId = creds.render_owner_id;
    if (!ownerId) {
      console.log('[render] No owner ID provided, fetching available owners...');
      const owners = await this.listOwners(creds.render_api_key);
      if (owners.length === 0) {
        throw new Error('No Render owners/workspaces found for this API key');
      }
      ownerId = owners[0].id;
      console.log(`[render] Auto-selected owner: id=${ownerId} name=${owners[0].name}`);
    }

    console.log(`[render] Creating service name=${opts.name} ownerId=${ownerId} region=${opts.region}`);

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
    } else {
      throw new Error('Render requires either a repoUrl or a Docker image');
    }

    const r = await c.post('/services', payload).catch((e: any) => {
      const msg = e?.response?.data?.message || e?.response?.data?.errors?.[0] || e.message || 'Render API error';
      console.error(`[render] Service create failed: ${msg}`, JSON.stringify(e?.response?.data));
      throw new Error(msg);
    });

    const serviceId = r.data?.service?.id;
    if (!serviceId) {
      console.error('[render] No service ID in response:', JSON.stringify(r.data));
      throw new Error('Render returned no service ID');
    }

    const url = r.data?.service?.serviceDetails?.url || `https://${opts.name}.onrender.com`;
    console.log(`[render] Service created: serviceId=${serviceId} url=${url}`);

    return { deploymentId: serviceId, url, status: 'building' };
  }

  async getStatus(creds: Record<string, string>, deploymentId: string): Promise<ProviderStatus> {
    console.log(`[render] getStatus serviceId=${deploymentId}`);

    const r = await this.client(creds.render_api_key).get(`/services/${deploymentId}`).catch((e: any) => {
      const msg = e?.response?.data?.message || e.message;
      console.error(`[render] getStatus failed: ${msg}`);
      throw new Error(msg);
    });

    const svc = r.data?.service || r.data;
    const deployStatus = svc.suspended === 'suspended' ? 'suspended' : (svc.deploy?.status || svc.deployStatus);
    const statusMap: Record<string, ProviderStatus['status']> = {
      live: 'live', building: 'building', deploying: 'deploying',
      failed: 'failed', suspended: 'suspended', update_failed: 'failed',
    };
    const mapped = statusMap[deployStatus] || 'building';

    console.log(`[render] serviceId=${deploymentId} rawStatus=${deployStatus} mapped=${mapped}`);

    return {
      deploymentId,
      status: mapped,
      url: svc.serviceDetails?.url,
      updatedAt: svc.updatedAt || new Date().toISOString(),
    };
  }

  async getLogs(creds: Record<string, string>, deploymentId: string): Promise<ProviderLog[]> {
    console.log(`[render] getLogs serviceId=${deploymentId}`);

    const deploys = await this.client(creds.render_api_key)
      .get(`/services/${deploymentId}/deploys?limit=1`)
      .catch((e: any) => {
        throw new Error(e?.response?.data?.message || e.message || 'Failed to fetch Render deploys');
      });

    const deploy = deploys.data?.[0]?.deploy;
    if (!deploy) {
      return [{ time: new Date().toISOString(), message: 'No deploys found for this service yet', level: 'warn' }];
    }

    console.log(`[render] Latest deploy id=${deploy.id} status=${deploy.status}`);

    const lr = await this.client(creds.render_api_key)
      .get(`/services/${deploymentId}/deploys/${deploy.id}/logs`)
      .catch((e: any) => {
        throw new Error(e?.response?.data?.message || e.message || 'Failed to fetch Render logs');
      });

    return (lr.data || []).map((l: any) => ({
      time: l.timestamp || new Date().toISOString(),
      message: l.text || '',
      level: 'info' as const,
    }));
  }

  async deleteDeployment(creds: Record<string, string>, deploymentId: string): Promise<void> {
    console.log(`[render] deleteDeployment serviceId=${deploymentId}`);
    await this.client(creds.render_api_key).delete(`/services/${deploymentId}`).catch((e: any) => {
      const msg = e?.response?.data?.message || e.message || 'Delete failed';
      console.error(`[render] Delete failed: ${msg}`);
      throw new Error(msg);
    });
    console.log(`[render] Service deleted: serviceId=${deploymentId}`);
  }
}
