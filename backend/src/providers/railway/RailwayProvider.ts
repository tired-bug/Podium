import axios from 'axios';
import { IProvider, DeployOptions, DeployResult, ProviderStatus, ProviderLog } from '../IProvider';

export class RailwayProvider implements IProvider {
  readonly id = 'railway';
  readonly name = 'Railway';

  private async gql(token: string, query: string, variables?: Record<string, any>) {
    const r = await axios.post(
      'https://backboard.railway.com/graphql/v2',
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
  console.error(
    '[railway] GRAPHQL ERRORS:',
    JSON.stringify(r.data.errors, null, 2)
  );

  console.error(
    '[railway] QUERY:',
    query
  );

  console.error(
    '[railway] VARIABLES:',
    JSON.stringify(variables, null, 2)
  );

  const msg = r.data.errors.map((e: any) => e.message).join('; ');

  throw new Error(`Railway GraphQL error: ${msg}`);
}
    return r.data.data;
  }

  /**
   * Resolve a single workspace by ID — used to validate a manually-configured
   * Workspace ID (e.g. for Workspace tokens, which can't enumerate workspaces
   * via `me`) without going through the full me-based auto-detect path.
   */
  async getWorkspace(token: string, workspaceId: string): Promise<{ id: string; name: string } | null> {
    const data = await this.gql(token, `
      query($workspaceId: String!) { workspace(workspaceId: $workspaceId) { id name } }
    `, { workspaceId });
    return data?.workspace?.id ? { id: data.workspace.id, name: data.workspace.name } : null;
  }

  async connect(creds: Record<string, string>) {
    try {
      // Workspace tokens cannot resolve `me` at all — Railway scopes that query
      // to personal-account data only (see docs.railway.com/integrations/api).
      // If a workspace ID has been configured, validate against the
      // workspace-scoped query instead, since that's what such a token can
      // actually answer.
      if (creds.railway_workspace_id) {
        const ws = await this.getWorkspace(creds.railway_token, creds.railway_workspace_id);
        if (!ws) return { ok: false, error: 'Token could not access the configured Workspace ID' };
        return { ok: true };
      }

      // No workspace ID configured — assume an account token and validate
      // identity directly. We deliberately do NOT probe `me { teams }` here as
      // a "scope check": Railway returns the exact same "Not Authorized" error
      // both for tokens that lack permission AND for valid personal-account
      // tokens with no teams. There's no reliable way to distinguish the two
      // from the error message alone, so we don't try. Any real workspace/scope
      // problems will surface in listWorkspaces(), which falls back gracefully
      // instead of guessing at a diagnosis.
      const data = await this.gql(creds.railway_token, `query { me { id name email } }`);
      if (!data?.me?.id) {
        return {
          ok: false,
          error: 'Invalid Railway token, or this is a Workspace/Project token — if so, also set Workspace ID in the field below.',
        };
      }

      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Connection failed' };
    }
  }

  /**
   * List Railway projects for the authenticated user.
   */
  async listProjects(token: string, workspaceId?: string): Promise<Array<{ id: string; name: string }>> {
    const data = workspaceId
      ? await this.gql(token, `
          query($workspaceId: String!) {
            workspace(workspaceId: $workspaceId) {
              projects { edges { node { id name } } }
            }
          }
        `, { workspaceId })
      : await this.gql(token, `
          query {
            projects {
              edges { node { id name } }
            }
          }
        `);
    const projectsConnection = workspaceId ? data?.workspace?.projects : data?.projects;
    console.log(
  '[railway] workspace query result:',
  JSON.stringify(data, null, 2)
);
    return (projectsConnection?.edges || []).map((e: any) => ({
      id: e.node.id,
      name: e.node.name,
    }));
  }

  async deploy(creds: Record<string, string>, opts: DeployOptions, _localId: string): Promise<DeployResult> {
    console.log(`[railway] Deploying service name=${opts.name}`);

    let projectId = creds.railway_project_id;

    if (!projectId) {
      const projectName = opts.projectName || opts.name;
      let workspaceId = opts.workspaceId || creds.railway_workspace_id;

if (!workspaceId) {
  try {
    const workspaces = await this.listWorkspaces(
  creds.railway_token
);

console.log(
  '[railway] autodetect workspaces:',
  JSON.stringify(workspaces, null, 2)
);

    const teamWorkspaces =
      workspaces.filter(w => w.id);

    if (teamWorkspaces.length === 1) {
      workspaceId = teamWorkspaces[0].id;

      console.log(
        `[railway] Auto-selected workspace ${workspaceId}`
      );
    }
  } catch (err) {
    console.warn(
      '[railway] Workspace auto-detect failed (expected for Workspace tokens — set railway_workspace_id instead):',
      err
    );
  }
}
      console.log(`[railway] No project ID — creating new project name=${projectName} workspaceId=${workspaceId}`);

      if (workspaceId) {
        // Team workspace: workspaceId is required by Railway API
        const created = await this.gql(creds.railway_token, `
          mutation($name: String!, $workspaceId: String!) {
            projectCreate(input: { name: $name, workspaceId: $workspaceId }) { id name }
          }`, { name: projectName, workspaceId });
        projectId = created.projectCreate.id;
      } else {
        // Personal account: no workspaceId needed
        const created = await this.gql(creds.railway_token, `
          mutation($name: String!) {
            projectCreate(input: { name: $name }) { id name }
          }`, { name: projectName });
        projectId = created.projectCreate.id;
      }
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
    const statusMap: Record<string, string> = {
      SUCCESS: 'live', DEPLOYING: 'building', BUILDING: 'building',
      FAILED: 'failed', CRASHED: 'failed', REMOVED: 'deleted', WAITING: 'queued',
    };

    const PROJECTS_FRAGMENT = `
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
    `;

    const collect = (projectsConnection: any, results: any[]) => {
      for (const project of (projectsConnection?.edges || [])) {
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
    };

    const results: any[] = [];

    // Workspace tokens can never resolve `me` (Railway returns "Not Authorized"
    // for that query by design — see docs.railway.com/integrations/api), so they
    // can't be auto-discovered via listWorkspaces(). If a workspace ID has been
    // configured manually, use it directly and skip auto-detection entirely.
    if (creds.railway_workspace_id) {
      try {
        const data = await this.gql(creds.railway_token, `
          query($workspaceId: String!) {
            workspace(workspaceId: $workspaceId) {
              projects { ${PROJECTS_FRAGMENT} }
            }
          }
        `, { workspaceId: creds.railway_workspace_id });
        collect(data?.workspace?.projects, results);
      } catch (e: any) {
        console.error(`[railway] listDeployments: failed for configured workspace "${creds.railway_workspace_id}":`, e.message);
      }
      return results;
    }

    // No workspace ID configured — assume an account token and auto-detect via
    // `me`. A token's `projects` access depends on its scope (account vs
    // workspace), and the unscoped top-level `projects` field only works
    // reliably for account/personal-scoped tokens. So we enumerate workspaces
    // first (which already degrades gracefully for any token type) and query
    // projects per-workspace where we have a real workspace id, falling back to
    // the unscoped query only for the personal-workspace case.
    let workspaces: Array<{ id: string; name: string }> = [];
    try {
      workspaces = await this.listWorkspaces(creds.railway_token);
    } catch (e: any) {
      console.error('[railway] listDeployments: could not list workspaces:', e.message);
      console.error('[railway] If this token is a Workspace token, set Workspace ID in the Railway integration settings — workspace tokens cannot auto-detect their own workspace.');
      workspaces = [{ id: '', name: 'Personal Workspace' }];
    }

    for (const ws of workspaces) {
      try {
        if (ws.id) {
          const data = await this.gql(creds.railway_token, `
            query($workspaceId: String!) {
              workspace(workspaceId: $workspaceId) {
                projects { ${PROJECTS_FRAGMENT} }
              }
            }
          `, { workspaceId: ws.id });
          collect(data?.workspace?.projects, results);
        } else {
          const data = await this.gql(creds.railway_token, `
            query { projects { ${PROJECTS_FRAGMENT} } }
          `);
          collect(data?.projects, results);
        }
      } catch (e: any) {
        // Don't let one inaccessible workspace kill the whole sync — log and continue.
        console.error(`[railway] listDeployments: failed for workspace "${ws.name}":`, e.message);
      }
    }

    return results;
  }

  /**
   * List all workspaces accessible to the authenticated user — the personal
   * account workspace plus any team workspaces. Used to drive automatic
   * workspace selection so the user never has to type a workspace ID.
   *
   * NOTE: Railway GraphQL v2 removed the top-level `teams` field.
   * Teams are now accessed via `me { teams { edges { node { id name } } } }`.
   */
  async listWorkspaces(token: string): Promise<Array<{ id: string; name: string }>> {
  let data: any;
  try {
    data = await this.gql(token, `
    query {
      me {
        id
        name
        teams {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `);
  } catch (e: any) {
    // Railway returns the identical "Not Authorized" error both for tokens that
    // genuinely lack permission AND for valid personal-account tokens that simply
    // have no teams. There's no reliable way to tell those apart from the error
    // message, so we don't try to diagnose it. Instead, fall back to a minimal
    // identity-only query. If THAT also fails, the token itself is the problem.
    console.error('[railway] me.teams query failed, falling back to identity-only query:', e.message);

    try {
      data = await this.gql(token, `query { me { id name } }`);
    } catch (e2: any) {
      throw new Error(
        'Could not connect to your Railway account. Double-check that your token is valid ' +
        '(Railway → Account Settings → Tokens). ' +
        `Original error: ${e2.message || e.message}`
      );
    }
  }

  console.log(
    '[railway] RAW WORKSPACES RESPONSE:',
    JSON.stringify(data, null, 2)
  );

  const workspaces: Array<{ id: string; name: string }> = [];

  if (data?.me?.id) {
    workspaces.push({
      id: '',
      name: 'Personal Workspace'
    });
  }

  for (const e of (data?.me?.teams?.edges || [])) {
    workspaces.push({
      id: e.node.id,
      name: e.node.name
    });
  }

  console.log(
    '[railway] PARSED WORKSPACES:',
    JSON.stringify(workspaces, null, 2)
  );

  return workspaces;
}
}
