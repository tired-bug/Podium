import axios from 'axios';
import { IProvider, DeployOptions, DeployResult, ProviderStatus, ProviderLog } from '../IProvider';

export class RailwayProvider implements IProvider {
  readonly id = 'railway';
  readonly name = 'Railway';
  readonly isDemo = false;

  private async gql(token: string, query: string, variables?: Record<string, any>) {
    const r = await axios.post(
      'https://backboard.railway.app/graphql/v2',
      { query, variables },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    if (r.data.errors?.length) {
      const msg = r.data.errors.map((e: any) => e.message).join('; ');
      throw new Error(`Railway GraphQL error: ${msg}`);
    }
    return r.data.data;
  }

  async connect(creds: Record<string, string>) {
    try {
      const data = await this.gql(creds.railway_token, `query { me { id name email } }`);
      if (data?.me?.id) return { ok: true };
      return { ok: false, error: 'Invalid Railway token' };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Connection failed' };
    }
  }

  async deploy(creds: Record<string, string>, opts: DeployOptions, _localId: string): Promise<DeployResult> {
    console.log(`[railway] Deploying service name=${opts.name}`);

    let projectId = creds.railway_project_id;

    if (!projectId) {
      console.log(`[railway] No project ID provided, creating new project name=${opts.name}`);
      const created = await this.gql(creds.railway_token, `
        mutation($name: String!) {
          projectCreate(input: { name: $name }) { id name }
        }`, { name: opts.name });
      projectId = created.projectCreate.id;
      console.log(`[railway] Project created: projectId=${projectId}`);
    }

    const svcData = await this.gql(creds.railway_token, `
      mutation($projectId: String!, $name: String!) {
        serviceCreate(input: { projectId: $projectId, name: $name }) { id name }
      }`, { projectId, name: opts.name });

    const serviceId = svcData.serviceCreate.id;
    console.log(`[railway] Service created: serviceId=${serviceId}`);

    if (opts.envVars && Object.keys(opts.envVars).length > 0) {
      const vars = Object.entries(opts.envVars).map(([name, value]) => ({ name, value }));
      await this.gql(creds.railway_token, `
        mutation($serviceId: String!, $vars: [VariableUpsertInput!]!) {
          variableCollectionUpsert(input: { serviceId: $serviceId, variables: $vars })
        }`, { serviceId, vars });
      console.log(`[railway] Set ${vars.length} env vars on serviceId=${serviceId}`);
    }

    if (opts.repoUrl) {
      console.log(`[railway] Connecting repo ${opts.repoUrl} branch=${opts.branch || 'main'} to serviceId=${serviceId}`);
      await this.gql(creds.railway_token, `
        mutation($serviceId: String!, $repo: String!, $branch: String!) {
          serviceConnect(id: $serviceId, input: { repo: $repo, branch: $branch })
        }`, { serviceId, repo: opts.repoUrl, branch: opts.branch || 'main' });
    }

    return {
      deploymentId: serviceId,
      url: `https://${opts.name}.up.railway.app`,
      status: 'building',
    };
  }

  async getStatus(creds: Record<string, string>, deploymentId: string): Promise<ProviderStatus> {
    console.log(`[railway] getStatus serviceId=${deploymentId}`);

    const data = await this.gql(creds.railway_token, `
      query($id: String!) {
        service(id: $id) {
          id name
          deployments(first: 1) {
            edges { node { id status createdAt } }
          }
        }
      }`, { id: deploymentId });

    const dep = data.service?.deployments?.edges?.[0]?.node;
    const statusMap: Record<string, ProviderStatus['status']> = {
      SUCCESS: 'live', DEPLOYING: 'deploying', BUILDING: 'building',
      FAILED: 'failed', CRASHED: 'failed', REMOVED: 'suspended',
      WAITING: 'queued', SKIPPED: 'failed',
    };

    const rawStatus = dep?.status || 'BUILDING';
    const mapped = statusMap[rawStatus] || 'building';
    console.log(`[railway] serviceId=${deploymentId} rawStatus=${rawStatus} mapped=${mapped}`);

    return {
      deploymentId,
      status: mapped,
      updatedAt: dep?.createdAt || new Date().toISOString(),
    };
  }

  async getLogs(creds: Record<string, string>, deploymentId: string): Promise<ProviderLog[]> {
    console.log(`[railway] getLogs serviceId=${deploymentId}`);

    const data = await this.gql(creds.railway_token, `
      query($id: String!) {
        service(id: $id) {
          deployments(first: 1) {
            edges { node { id logs } }
          }
        }
      }`, { id: deploymentId });

    const logText = data.service?.deployments?.edges?.[0]?.node?.logs || '';
    if (!logText) {
      return [{ time: new Date().toISOString(), message: 'No logs available yet', level: 'info' }];
    }

    return logText.split('\n').filter(Boolean).map((line: string) => ({
      time: new Date().toISOString(),
      message: line,
      level: 'info' as const,
    }));
  }

  async deleteDeployment(creds: Record<string, string>, deploymentId: string): Promise<void> {
    console.log(`[railway] deleteDeployment serviceId=${deploymentId}`);
    await this.gql(creds.railway_token, `
      mutation($id: String!) { serviceDelete(id: $id) }
    `, { id: deploymentId });
    console.log(`[railway] Service deleted: serviceId=${deploymentId}`);
  }
}
