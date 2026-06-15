import { ProviderFactory } from '../../providers/ProviderFactory';
import {
  DeploymentRequest
} from '../contracts/ProviderAdapter';

export class DeploymentOrchestrator {

  async deployApplication(
    provider: string,
    request: DeploymentRequest
  ) {
    const adapter =
      ProviderFactory.get(provider);

    return adapter.deploy(request);
  }
}