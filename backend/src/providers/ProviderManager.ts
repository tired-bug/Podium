import { IProvider, DeployOptions, DeployResult, ProviderStatus, ProviderLog } from './IProvider';
import { RenderProvider } from './render/RenderProvider';
import { RailwayProvider } from './railway/RailwayProvider';
import { VercelProvider } from './vercel/VercelProvider';

export interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  credentialKeys: Array<{ key: string; label: string; placeholder: string; required: boolean; masked?: boolean; hint?: string }>;
  regions?: string[];
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  render: {
    id: 'render', name: 'Render',
    description: 'Deploy web services, static sites, and databases with zero DevOps on Render\'s global infrastructure.',
    capabilities: ['Web Services', 'Static Sites', 'Databases', 'Cron Jobs', 'Private Services'],
    credentialKeys: [
      { key: 'render_api_key', label: 'API Key', placeholder: 'rnd_xxxxxxxxxxxx', required: true, masked: true, hint: 'Found in Render Dashboard → Account → API Keys' },
      // render_owner_id is optional — Podium auto-fetches available owners if not provided
      { key: 'render_owner_id', label: 'Owner / Workspace ID (optional)', placeholder: 'Auto-detected from API key', required: false, hint: 'Leave blank to auto-select your default workspace. Set to a specific team ID to deploy into that workspace.' },
    ],
    regions: ['oregon', 'ohio', 'virginia', 'frankfurt', 'singapore'],
  },
  railway: {
    id: 'railway', name: 'Railway',
    description: 'Ship code instantly. Railway handles your infrastructure so you can focus on your product.',
    capabilities: ['Auto-deploy from Git', 'Databases', 'Private Networking', 'Cron Jobs', 'Volume Storage'],
    credentialKeys: [
      { key: 'railway_token', label: 'API Token', placeholder: 'Your Railway API token', required: true, masked: true, hint: 'Account token (Account Settings → Tokens, "No workspace") works best — it can see everything. If you\'re using a Workspace token instead, also fill in Workspace ID below; workspace tokens cannot auto-detect their own workspace.' },
      { key: 'railway_workspace_id', label: 'Workspace ID (required for Workspace tokens)', placeholder: 'e.g. 3b2e1a90-...', required: false, hint: 'Only needed if API Token above is a Workspace token. Find it in the Railway dashboard URL while viewing that workspace, or via Cmd/Ctrl+K → copy workspace ID. Leave blank for Account tokens.' },
      { key: 'railway_project_id', label: 'Project ID (optional)', placeholder: 'Leave empty to create new project', required: false, hint: 'Deploy into an existing Railway project. Leave blank to create a new project automatically.' },
    ],
    regions: ['us-west1', 'us-east4', 'europe-west4', 'asia-southeast1'],
  },
  vercel: {
    id: 'vercel', name: 'Vercel',
    description: 'Deploy frontends and serverless functions instantly with the best DX and global edge network.',
    capabilities: ['Edge Network', 'Serverless Functions', 'Preview Deployments', 'Analytics', 'DX Platform'],
    credentialKeys: [
      { key: 'vercel_token', label: 'API Token', placeholder: 'Your Vercel API token', required: true, masked: true, hint: 'Found in Vercel Dashboard → Settings → Tokens' },
      { key: 'vercel_team_id', label: 'Team ID (optional)', placeholder: 'team_xxxxxxxxxxxx', required: false, hint: 'Required for team deployments. Leave empty for personal account. Found in Team Settings → General.' },
    ],
    regions: ['iad1', 'sfo1', 'fra1', 'sin1', 'hnd1'],
  },
};

class ProviderManager {
  private providers = new Map<string, IProvider>();

  constructor() {
    this.register(new RenderProvider());
    this.register(new RailwayProvider());
    this.register(new VercelProvider());
  }

  register(provider: IProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): IProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`Unknown provider: ${id}`);
    return p;
  }

  list(): IProvider[] {
    return Array.from(this.providers.values());
  }

  getMeta(id: string): ProviderMeta {
    const m = PROVIDER_META[id];
    if (!m) throw new Error(`No metadata for provider: ${id}`);
    return m;
  }

  listMeta(): ProviderMeta[] {
    return Object.values(PROVIDER_META);
  }

  async connect(id: string, credentials: Record<string, string>) {
    return this.get(id).connect(credentials);
  }

  async deploy(id: string, credentials: Record<string, string>, opts: DeployOptions, deploymentId: string): Promise<DeployResult> {
    return this.get(id).deploy(credentials, opts, deploymentId);
  }

  async getStatus(id: string, credentials: Record<string, string>, deploymentId: string): Promise<ProviderStatus> {
    return this.get(id).getStatus(credentials, deploymentId);
  }

  async getLogs(id: string, credentials: Record<string, string>, deploymentId: string): Promise<ProviderLog[]> {
    return this.get(id).getLogs(credentials, deploymentId);
  }

  async deleteDeployment(id: string, credentials: Record<string, string>, deploymentId: string): Promise<void> {
    return this.get(id).deleteDeployment(credentials, deploymentId);
  }

  // Provider-specific extras
  async listRenderOwners(apiKey: string): Promise<Array<{ id: string; name: string; type: string; email?: string }>> {
    const provider = this.get('render') as RenderProvider;
    return provider.listOwners(apiKey);
  }
}

// Singleton
export const providerManager = new ProviderManager();
//export { PROVIDER_META };

// Add orchestration methods to ProviderManager class
// (These extend the singleton instance since TypeScript class is already exported)
const _pm = providerManager as any;

_pm.listGithubRepos = async function(apiKey: string, teamId?: string) {
  const provider = this.get('vercel') as any;
  return provider.listGithubRepos({ vercel_token: apiKey, vercel_team_id: teamId });
};

_pm.listRailwayWorkspaces = async function(token: string) {
  const provider = this.get('railway') as any;
  return provider.listWorkspaces(token);
};

_pm.listRailwayProjects = async function(token: string) {
  const provider = this.get('railway') as any;
  return provider.listProjects(token);
};

_pm.listProviderDeployments = async function(providerId: string, creds: Record<string, string>) {
  const provider = this.get(providerId) as any;
  if (typeof provider.listDeployments === 'function') {
    return provider.listDeployments(creds);
  }
  return [];
};
