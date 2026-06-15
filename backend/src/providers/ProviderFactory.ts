import { ProviderAdapter } from '../core/contracts/ProviderAdapter';

import { DockerAdapter } from './docker/DockerAdapter';
import { AwsAdapter } from './aws/AwsAdapter';
import { AzureAdapter } from './azure/AzureAdapter';
import { GcpAdapter } from './gcp/GcpAdapter';
import { VercelAdapter } from './vercel/VercelAdapter';
import { RenderAdapter } from './render/RenderAdapter';
import { RailwayAdapter } from './railway/RailwayAdapter';

export class ProviderFactory {
  static get(provider: string): ProviderAdapter {
    switch (provider.toLowerCase()) {
      case 'docker':
      case 'podium':
        return new DockerAdapter();

      case 'aws':
        return new AwsAdapter();

      case 'azure':
        return new AzureAdapter();

      case 'gcp':
        return new GcpAdapter();

      case 'vercel':
        return new VercelAdapter();

      case 'render':
        return new RenderAdapter();

      case 'railway':
        return new RailwayAdapter();

      default:
        throw new Error(`Provider "${provider}" not supported`);
    }
  }
}