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
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
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

  /**
   * List Railway projects for the authenticated user.
   */
  async listProjects(token: string): Promise<Array<{ id: string; name: string }>> {
    const data = await this.gql(token, `
      query {
        projects {
          edges { node { id name } }
        }
      }
    `);
    return (data?.projects?.edges || []).map((e: any) => ({
      id: e.node.id,
      name: e.node.name,
    }));
  }

  async deploy(creds: Record<string, string>, opts: DeployOptions, _localId: string): Promise<DeployResult> {
    console.log(`[railway] Deploying service name=${opts.name}`);

    let projectId = creds.railway_project_id;

    if (!projectId) {
      console.log(`[railway] No project ID — creating new project name=${opts.name}`);
      const created = await this.gql(creds.railway_token, `
        mutation($name: String!) {
          projectCreate(input: { name: $name }) { id name }
        }`, { name: opts.name });
      projectId = created.projectCreate.id;
      console.log(`[railway] Project created: projectId=${projectId}`);
    }

    // Create service in project
    const svcData = await this.gql(creds.railway_token, `
      mutation($projectId: String!, $name: String!) {
        serviceCreate(input: { projectId: $projectId, name: $name }) { id name }
      }`, { projectId, name: opts.name });

    const serviceId = svcData.serviceCreate.id;
    console.log(`[railway] Service created: serviceId=${serviceId}`);

    // Set environment variables if provided
    if (opts.envVars && Object.keys(opts.envVars).length > 0) {
      const vars = Object.entries(opts.envVars).map(([name, value]) => ({ name, value }));
      await this.gql(creds.railway_token, `
        mutation($serviceId: String!, $vars: [VariableUpsertInput!]!) {
          variableCollectionUpsert(input: { serviceId: $serviceId, variables: $vars })
        }`, { serviceId, vars });
      console.log(`[railway] Set ${vars.length} env vars on serviceId=${serviceId}`);
    }

    // Connect GitHub repository if provided
    if (opts.repoUrl) {
      const repoPath = opts.repoUrl
        .replace(/\.git$/, '')
        .replace(/^https?:\/\/github\.com\//, '');
      console.log(`[railway] Connecting repo ${repoPath} branch=${opts.branch || 'main'} to serviceId=${serviceId}`);
      try {
        await this.gql(creds.railway_token, `
          mutation($serviceId: String!, $repo: String!, $branch: String!) {
            serviceConnect(id: $serviceId, input: { repo: $repo, branch: $branch })
          }`, { serviceId, repo: repoPath, branch: opts.branch || 'main' });
      } catch (e: any) {
        // Repo connection may fail if not authorized — non-fatal, service still created
        console.warn(`[railway] Repo connect warning: ${e.message}`);
      }
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
      WAITING: 'queued', SKIPPED: 'failed', INITIALIZING: 'building',
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

    try {
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
    } catch (e: any) {
      console.error(`[railway] getLogs error: ${e.message}`);
      return [{ time: new Date().toISOString(), message: `Could not fetch logs: ${e.message}`, level: 'error' }];
    }
  }

  async deleteDeployment(creds: Record<string, string>, deploymentId: string): Promise<void> {
    console.log(`[railway] deleteDeployment serviceId=${deploymentId}`);
    await this.gql(creds.railway_token, `
      mutation($id: String!) { serviceDelete(id: $id) }
    `, { id: deploymentId });
    console.log(`[railway] Service deleted: serviceId=${deploymentId}`);
  }

  /**
   * List all services across all projects.
   */
  async listDeployments(creds: Record<string, string>): Promise<Array<{ id: string; name: string; status: string; url?: string; createdAt?: string }>> {
    const data = await this.gql(creds.railway_token, `
      query {
        projects {
          edges {
            node {
              id name
              services {
                edges {
                  node {
                    id name
                    deployments(first: 1) {
                      edges {
                        node {
                          id status
                          staticUrl
                          createdAt
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);

    const results: any[] = [];
    const statusMap: Record<string, string> = {
      SUCCESS: 'live', DEPLOYING: 'building', BUILDING: 'building',
      FAILED: 'failed', CRASHED: 'failed', REMOVED: 'deleted', WAITING: 'queued',
    };

    for (const project of (data?.projects?.edges || [])) {
      for (const svc of (project.node?.services?.edges || [])) {
        const dep = svc.node?.deployments?.edges?.[0]?.node;
        results.push({
          id: dep?.id || svc.node.id,
          name: `${project.node.name}/${svc.node.name}`,
          status: dep ? (statusMap[dep.status] || 'building') : 'queued',
          url: dep?.staticUrl || undefined,
          createdAt: dep?.createdAt,
        });
      }
    }

    return results;
  }

  /**
   * List Railway workspaces/teams.
   */
  async listWorkspaces(token: string): Promise<Array<{ id: string; name: string }>> {
    const data = await this.gql(token, `query { teams { edges { node { id name } } } }`).catch(() => ({ teams: { edges: [] } }));
    return (data?.teams?.edges || []).map((e: any) => ({ id: e.node.id, name: e.node.name }));
  }
}
