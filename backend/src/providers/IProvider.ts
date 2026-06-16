// Provider abstraction layer – every cloud provider must implement this interface

export interface DeployOptions {
  name: string;
  repoUrl?: string;
  branch?: string;
  image?: string;
  region?: string;
  envVars?: Record<string, string>;
  buildCommand?: string;
  startCommand?: string;
  ports?: number[];
}

export interface DeployResult {
  deploymentId: string;
  url?: string;
  status: string;
}

export interface ProviderStatus {
  deploymentId: string;
  status: 'queued' | 'building' | 'deploying' | 'live' | 'failed' | 'suspended';
  url?: string;
  updatedAt: string;
}

export interface ProviderLog {
  time: string;
  message: string;
  level?: 'info' | 'warn' | 'error';
}

export interface IProvider {
  readonly id: string;        // e.g. 'render'
  readonly name: string;      // e.g. 'Render'
  readonly isDemo: boolean;

  /** Validate credentials and establish connectivity */
  connect(credentials: Record<string, string>): Promise<{ ok: boolean; error?: string }>;

  /** Trigger a deployment */
  deploy(credentials: Record<string, string>, options: DeployOptions, deploymentId: string): Promise<DeployResult>;

  /** Get current deployment status */
  getStatus(credentials: Record<string, string>, deploymentId: string): Promise<ProviderStatus>;

  /** Stream / fetch deployment logs */
  getLogs(credentials: Record<string, string>, deploymentId: string): Promise<ProviderLog[]>;

  /** Remove / suspend a deployment */
  deleteDeployment(credentials: Record<string, string>, deploymentId: string): Promise<void>;
}
