import { IProvider, DeployOptions, DeployResult, ProviderStatus, ProviderLog } from './IProvider';
import { RenderProvider } from './render/RenderProvider';
import { RailwayProvider } from './railway/RailwayProvider';
import { VercelProvider } from './vercel/VercelProvider';
import { AwsProvider, AzureProvider, GcpProvider } from './demo/DemoProviders';

export interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  isDemo: boolean;
  tier: 'free' | 'enterprise_demo';
  capabilities: string[];
  credentialKeys: Array<{ key: string; label: string; placeholder: string; required: boolean; masked?: boolean; hint?: string }>;
  regions?: string[];
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  render: {
    id: 'render', name: 'Render', tier: 'free', isDemo: false,
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
    id: 'railway', name: 'Railway', tier: 'free', isDemo: false,
    description: 'Ship code instantly. Railway handles your infrastructure so you can focus on your product.',
    capabilities: ['Auto-deploy from Git', 'Databases', 'Private Networking', 'Cron Jobs', 'Volume Storage'],
    credentialKeys: [
      { key: 'railway_token', label: 'API Token', placeholder: 'Your Railway API token', required: true, masked: true, hint: 'Found in Railway Dashboard → Account Settings → API Tokens' },
      { key: 'railway_project_id', label: 'Project ID (optional)', placeholder: 'Leave empty to create new project', required: false, hint: 'Deploy into an existing Railway project. Leave blank to create a new project automatically.' },
    ],
    regions: ['us-west1', 'us-east4', 'europe-west4', 'asia-southeast1'],
  },
  vercel: {
    id: 'vercel', name: 'Vercel', tier: 'free', isDemo: false,
    description: 'Deploy frontends and serverless functions instantly with the best DX and global edge network.',
    capabilities: ['Edge Network', 'Serverless Functions', 'Preview Deployments', 'Analytics', 'DX Platform'],
    credentialKeys: [
      { key: 'vercel_token', label: 'API Token', placeholder: 'Your Vercel API token', required: true, masked: true, hint: 'Found in Vercel Dashboard → Settings → Tokens' },
      { key: 'vercel_team_id', label: 'Team ID (optional)', placeholder: 'team_xxxxxxxxxxxx', required: false, hint: 'Required for team deployments. Leave empty for personal account. Found in Team Settings → General.' },
    ],
    regions: ['iad1', 'sfo1', 'fra1', 'sin1', 'hnd1'],
  },
  aws: {
    id: 'aws', name: 'AWS', tier: 'enterprise_demo', isDemo: true,
    description: 'Amazon Web Services — full-featured enterprise cloud with 200+ services. Demo mode shows architecture planning and cost estimation.',
    capabilities: ['Architecture Planning', 'Cost Estimation', 'EC2', 'ECS/Fargate', 'Lambda', 'RDS', 'S3'],
    credentialKeys: [
      { key: 'aws_access_key_id', label: 'Access Key ID', placeholder: 'AKIAIOSFODNN7EXAMPLE', required: true, masked: false },
      { key: 'aws_secret_access_key', label: 'Secret Access Key', placeholder: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', required: true, masked: true },
      { key: 'aws_region', label: 'Region', placeholder: 'us-east-1', required: false },
    ],
  },
  azure: {
    id: 'azure', name: 'Azure', tier: 'enterprise_demo', isDemo: true,
    description: 'Microsoft Azure — enterprise cloud platform. Demo mode shows architecture planning and cost estimation.',
    capabilities: ['Architecture Planning', 'Cost Estimation', 'Container Instances', 'AKS', 'App Service', 'Functions'],
    credentialKeys: [
      { key: 'azure_subscription_id', label: 'Subscription ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', required: true },
      { key: 'azure_client_id', label: 'Client ID', placeholder: 'App registration client ID', required: true },
      { key: 'azure_client_secret', label: 'Client Secret', placeholder: 'App registration secret', required: true, masked: true },
      { key: 'azure_tenant_id', label: 'Tenant ID', placeholder: 'Azure AD tenant ID', required: true },
    ],
  },
  gcp: {
    id: 'gcp', name: 'Google Cloud', tier: 'enterprise_demo', isDemo: true,
    description: 'Google Cloud Platform — data and AI-first enterprise cloud. Demo mode shows architecture planning and cost estimation.',
    capabilities: ['Architecture Planning', 'Cost Estimation', 'Cloud Run', 'GKE', 'Cloud Functions', 'BigQuery'],
    credentialKeys: [
      { key: 'gcp_project_id', label: 'Project ID', placeholder: 'my-gcp-project', required: true },
      { key: 'gcp_service_account_key', label: 'Service Account Key (JSON)', placeholder: '{"type": "service_account", ...}', required: true, masked: true },
    ],
  },
};

class ProviderManager {
  private providers = new Map<string, IProvider>();

  constructor() {
    this.register(new RenderProvider());
    this.register(new RailwayProvider());
    this.register(new VercelProvider());
    this.register(new AwsProvider());
    this.register(new AzureProvider());
    this.register(new GcpProvider());
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
