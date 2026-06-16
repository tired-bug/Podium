import { IProvider, DeployOptions, DeployResult, ProviderStatus, ProviderLog } from '../IProvider';

function demoLogs(name: string): ProviderLog[] {
  return [
    { time: new Date(Date.now() - 120000).toISOString(), message: `[DEMO] Initializing ${name} deployment pipeline...`, level: 'info' },
    { time: new Date(Date.now() - 90000).toISOString(), message: '[DEMO] Estimating cost: ~$45/month for t3.small instance', level: 'info' },
    { time: new Date(Date.now() - 60000).toISOString(), message: '[DEMO] Architecture: VPC → ALB → EC2 → RDS', level: 'info' },
    { time: new Date(Date.now() - 30000).toISOString(), message: '[DEMO] Connect real credentials in Settings → Cloud Providers to deploy', level: 'warn' },
  ];
}

export class AwsProvider implements IProvider {
  readonly id = 'aws';
  readonly name = 'AWS';
  readonly isDemo = true;

  async connect() { return { ok: false, error: 'AWS is in demo mode. Configure credentials in Settings.' }; }

  async deploy(_c: any, opts: DeployOptions, id: string): Promise<DeployResult> {
    return { deploymentId: id, url: undefined, status: 'failed' };
  }

  async getStatus(_c: any, id: string): Promise<ProviderStatus> {
    return { deploymentId: id, status: 'suspended', updatedAt: new Date().toISOString() };
  }

  async getLogs(_c: any, id: string): Promise<ProviderLog[]> { return demoLogs('AWS'); }
  async deleteDeployment() {}
}

export class AzureProvider implements IProvider {
  readonly id = 'azure';
  readonly name = 'Azure';
  readonly isDemo = true;

  async connect() { return { ok: false, error: 'Azure is in demo mode. Configure credentials in Settings.' }; }

  async deploy(_c: any, opts: DeployOptions, id: string): Promise<DeployResult> {
    return { deploymentId: id, url: undefined, status: 'failed' };
  }

  async getStatus(_c: any, id: string): Promise<ProviderStatus> {
    return { deploymentId: id, status: 'suspended', updatedAt: new Date().toISOString() };
  }

  async getLogs(): Promise<ProviderLog[]> { return demoLogs('Azure'); }
  async deleteDeployment() {}
}

export class GcpProvider implements IProvider {
  readonly id = 'gcp';
  readonly name = 'Google Cloud';
  readonly isDemo = true;

  async connect() { return { ok: false, error: 'GCP is in demo mode. Configure credentials in Settings.' }; }

  async deploy(_c: any, opts: DeployOptions, id: string): Promise<DeployResult> {
    return { deploymentId: id, url: undefined, status: 'failed' };
  }

  async getStatus(_c: any, id: string): Promise<ProviderStatus> {
    return { deploymentId: id, status: 'suspended', updatedAt: new Date().toISOString() };
  }

  async getLogs(): Promise<ProviderLog[]> { return demoLogs('GCP'); }
  async deleteDeployment() {}
}
