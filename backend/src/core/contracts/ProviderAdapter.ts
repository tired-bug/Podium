export interface DeploymentRequest {
  deploymentId: string;
  name: string;
  image?: string;
  repoUrl?: string;
  branch?: string;
  region?: string;
  env?: Record<string, string>;
  ports?: number[];
  config?: Record<string, any>;
}

export interface DeploymentResult {
  success: boolean;
  providerId?: string;
  url?: string;
  status: string;
  message?: string;
}

export interface ProviderAdapter {
  deploy(
    request: DeploymentRequest
  ): Promise<DeploymentResult>;

  redeploy(
    request: DeploymentRequest
  ): Promise<DeploymentResult>;

  stop(
    deploymentId: string
  ): Promise<void>;

  delete(
    deploymentId: string
  ): Promise<void>;

  logs(
    deploymentId: string
  ): Promise<any[]>;

  status(
    deploymentId: string
  ): Promise<string>;

  health(): Promise<boolean>;

  estimateCost(
    request: DeploymentRequest
  ): Promise<number>;
}