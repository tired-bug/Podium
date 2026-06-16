import axios, { AxiosInstance } from 'axios';
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
    if (r.data.errors?.length) throw new Error(r.data.errors[0].message);
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

  async deploy(creds: Record<string, string>, opts: DeployOptions, deploymentId: string): Promise<DeployResult> {
    try {
      let projectId = creds.railway_project_id;

      // Create project if not specified
      if (!projectId) {
        const created = await this.gql(creds.railway_token, `
          mutation($name: String!) {
            projectCreate(input: { name: $name }) { id name }
          }`, { name: opts.name });
        projectId = created.projectCreate.id;
      }

      // Create service
      const svcData = await this.gql(creds.railway_token, `
        mutation($projectId: String!, $name: String!) {
          serviceCreate(input: { projectId: $projectId, name: $name }) { id name }
        }`, { projectId, name: opts.name });

      const serviceId = svcData.serviceCreate.id;

      // Set environment variables
      if (opts.envVars && Object.keys(opts.envVars).length > 0) {
        const vars = Object.entries(opts.envVars).map(([name, value]) => ({ name, value }));
        await this.gql(creds.railway_token, `
          mutation($serviceId: String!, $vars: [VariableUpsertInput!]!) {
            variableCollectionUpsert(input: { serviceId: $serviceId, variables: $vars })
          }`, { serviceId, vars });
      }

      // Deploy from repo if provided
      if (opts.repoUrl) {
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
    } catch (e: any) {
      throw new Error(e.message || 'Railway deploy failed');
    }
  }

  async getStatus(creds: Record<string, string>, deploymentId: string): Promise<ProviderStatus> {
    try {
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
      };

      return {
        deploymentId,
        status: statusMap[dep?.status] || 'queued',
        updatedAt: dep?.createdAt || new Date().toISOString(),
      };
    } catch {
      return { deploymentId, status: 'queued', updatedAt: new Date().toISOString() };
    }
  }

  async getLogs(creds: Record<string, string>, deploymentId: string): Promise<ProviderLog[]> {
    try {
      const data = await this.gql(creds.railway_token, `
        query($id: String!) {
          service(id: $id) {
            deployments(first: 1) {
              edges { node { id logs } }
            }
          }
        }`, { id: deploymentId });

      const logs = data.service?.deployments?.edges?.[0]?.node?.logs || '';
      return logs.split('\n').filter(Boolean).map((line: string) => ({
        time: new Date().toISOString(),
        message: line,
        level: 'info' as const,
      }));
    } catch {
      return [{ time: new Date().toISOString(), message: 'Logs unavailable', level: 'warn' }];
    }
  }

  async deleteDeployment(creds: Record<string, string>, deploymentId: string): Promise<void> {
    try {
      await this.gql(creds.railway_token, `
        mutation($id: String!) { serviceDelete(id: $id) }
      `, { id: deploymentId });
    } catch (e: any) {
      throw new Error(e.message || 'Delete failed');
    }
  }
}
