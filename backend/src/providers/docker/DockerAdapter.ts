import {
  ProviderAdapter,
  DeploymentRequest,
  DeploymentResult
} from '../../core/contracts/ProviderAdapter';

export class DockerAdapter implements ProviderAdapter {

  async deploy(
    request: DeploymentRequest
  ): Promise<DeploymentResult> {

    return {
      success: true,
      status: 'queued',
      message: 'Docker deploy queued'
    };
  }

  async redeploy(
    request: DeploymentRequest
  ): Promise<DeploymentResult> {

    return this.deploy(request);
  }

  async stop(): Promise<void> {}

  async delete(): Promise<void> {}

  async logs(): Promise<any[]> {
    return [];
  }

  async status(): Promise<string> {
    return 'unknown';
  }

  async health(): Promise<boolean> {
    return true;
  }

  async estimateCost(): Promise<number> {
    return 0;
  }
}