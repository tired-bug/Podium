// ─── AI Deployment Engine – shared types ────────────────────────────────────

export type Framework =
  | 'nextjs' | 'react' | 'vite' | 'angular' | 'vue' | 'nuxt' | 'svelte' | 'sveltekit'
  | 'node' | 'express' | 'fastify' | 'nestjs'
  | 'python' | 'flask' | 'django' | 'fastapi'
  | 'go' | 'rust' | 'java' | 'spring-boot'
  | 'php' | 'laravel' | 'dotnet'
  | 'static' | 'docker' | 'docker-compose'
  | 'unknown';

export type Runtime = 'node' | 'python' | 'go' | 'rust' | 'java' | 'php' | 'dotnet' | 'docker' | 'static' | 'unknown';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'poetry' | 'pipenv' | 'cargo' | 'gradle' | 'maven' | 'composer' | 'dotnet' | 'unknown';

export type DeploymentType = 'static' | 'ssr' | 'api' | 'fullstack' | 'worker' | 'docker';

export type Provider = 'railway' | 'render' | 'vercel';

export interface RepoFile {
  path: string;
  content?: string; // only for key config files
}

export interface RepoContext {
  files: RepoFile[];
  owner: string;
  repo: string;
  branch: string;
  /** Raw content of recognised config files, keyed by relative path */
  configFiles: Record<string, string>;
}

export interface DetectionResult {
  framework: Framework;
  runtime: Runtime;
  packageManager: PackageManager;
  runtimeVersion?: string;
  buildCommand?: string;
  installCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  rootDirectory?: string;
  exposedPort?: number;
  deploymentType: DeploymentType;
  isMonorepo: boolean;
  monorepoServices?: MonorepoService[];
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasProcfile: boolean;
  envVarNames: string[];
  healthCheckPath?: string;
  usesDatabase: boolean;
  usesRedis: boolean;
  hasBackgroundWorkers: boolean;
  hasScheduledJobs: boolean;
  isSSR: boolean;
  confidence: number; // 0–1
  reasoning: string;
  detectionPath: string; // which signal resolved it
}

export interface MonorepoService {
  name: string;
  path: string;
  framework: Framework;
  runtime: Runtime;
}

export interface DeploymentPlan {
  id: string; // ephemeral client-side reference
  repoUrl: string;
  branch: string;
  provider: Provider;
  framework: Framework;
  runtime: Runtime;
  packageManager: PackageManager;
  runtimeVersion?: string;
  buildCommand: string;
  installCommand: string;
  startCommand: string;
  outputDirectory: string;
  rootDirectory: string;
  envVarNames: string[];
  exposedPort: number;
  deploymentType: DeploymentType;
  isMonorepo: boolean;
  monorepoServices?: MonorepoService[];
  confidence: number;
  reasoning: string;
  detectionPath: string;
  // provider-specific fields computed from detection
  providerConfig: ProviderDeployConfig;
}

export interface ProviderDeployConfig {
  // Vercel
  framework?: string;
  // Render
  runtime?: string;
  plan?: string;
  // Railway (no special extra fields beyond standard ones)
  projectName?: string;
}
