import { v4 as uuidv4 } from 'uuid';
import { DetectionResult, DeploymentPlan, Provider, ProviderDeployConfig, Framework, Runtime } from './types';

// Maps our framework to Vercel's framework slug
const VERCEL_FRAMEWORK_MAP: Partial<Record<Framework, string>> = {
  nextjs: 'nextjs',
  react: 'create-react-app',
  vite: 'vite',
  vue: 'vue',
  nuxt: 'nuxtjs',
  svelte: 'svelte',
  sveltekit: 'sveltekit',
  angular: 'angular',
  nestjs: 'nestjs',
  // 'html' is not a valid Vercel framework slug — omit it so Vercel auto-detects
  // (leaving this out of the map means the lookup below falls through to `null`)
};

// Maps our runtime to Render's runtime slug
const RENDER_RUNTIME_MAP: Partial<Record<Runtime, string>> = {
  node: 'node',
  python: 'python',
  go: 'go',
  rust: 'rust',
  php: 'node', // Render doesn't have native PHP — use Docker
  java: 'node', // same
  dotnet: 'node', // same
  docker: 'docker',
  static: 'static',
};

function buildProviderConfig(detection: DetectionResult, provider: Provider): ProviderDeployConfig {
  if (provider === 'vercel') {
    return {
      framework: VERCEL_FRAMEWORK_MAP[detection.framework] || null,
    };
  }
  if (provider === 'render') {
    // For static sites, use Render's static site type
    const runtime = detection.deploymentType === 'static'
      ? 'static'
      : (RENDER_RUNTIME_MAP[detection.runtime] || 'node');
    return {
      runtime,
      plan: 'free',
    };
  }
  if (provider === 'railway') {
    return {};
  }
  return {};
}

function resolvePort(detection: DetectionResult, provider: Provider): number {
  if (detection.exposedPort) return detection.exposedPort;
  // provider-level defaults
  if (provider === 'vercel') return 3000;
  if (provider === 'render') return detection.runtime === 'python' ? 8000 : 3000;
  return 3000; // railway auto-assigns
}

function resolveOutputDir(detection: DetectionResult, provider: Provider): string {
  if (detection.outputDirectory && detection.outputDirectory !== 'dist') return detection.outputDirectory;
  // framework-specific output dirs
  switch (detection.framework) {
    case 'nextjs': return '.next';
    case 'nuxt': return '.output';
    case 'sveltekit': return 'build';
    case 'react': return 'build';
    case 'angular': return `dist/${detection.framework}`;
    case 'vite':
    case 'vue':
    case 'svelte':
      return 'dist';
    default:
      return detection.outputDirectory || 'dist';
  }
}

function resolveStartCommand(detection: DetectionResult, provider: Provider): string {
  if (detection.startCommand) return detection.startCommand;

  // Vercel manages start internally for frameworks it knows
  if (provider === 'vercel' && VERCEL_FRAMEWORK_MAP[detection.framework]) return '';

  switch (detection.framework) {
    case 'nextjs': return 'next start';
    case 'nuxt': return 'node .output/server/index.mjs';
    case 'sveltekit': return 'node build';
    case 'nestjs': return 'node dist/main';
    case 'express':
    case 'fastify':
    case 'node': return 'node index.js';
    case 'fastapi': return 'uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}';
    case 'flask': return 'gunicorn app:app --bind 0.0.0.0:${PORT:-5000}';
    case 'django': return 'gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000}';
    case 'go': return './server';
    case 'rust': return './target/release/server';
    case 'spring-boot': return 'java -jar target/*.jar';
    case 'laravel': return 'php artisan serve --host=0.0.0.0 --port=${PORT:-8000}';
    case 'dotnet': return 'dotnet out/*.dll';
    default: return '';
  }
}

function resolveInstallCommand(detection: DetectionResult): string {
  if (detection.installCommand) return detection.installCommand;
  switch (detection.packageManager) {
    case 'yarn': return 'yarn install --frozen-lockfile';
    case 'pnpm': return 'pnpm install --frozen-lockfile';
    case 'bun': return 'bun install';
    case 'pip': return 'pip install -r requirements.txt';
    case 'poetry': return 'poetry install --no-dev';
    case 'pipenv': return 'pipenv install --deploy';
    case 'cargo': return 'cargo fetch';
    case 'maven': return 'mvn dependency:resolve';
    case 'gradle': return './gradlew dependencies';
    case 'composer': return 'composer install --no-dev --optimize-autoloader';
    case 'dotnet': return 'dotnet restore';
    default: return 'npm install';
  }
}

export class PlanBuilder {
  build(
    repoUrl: string,
    branch: string,
    provider: Provider,
    detection: DetectionResult,
    selectedServicePath?: string,
  ): DeploymentPlan {
    // If monorepo and a service was selected, adjust root directory
    const rootDir = selectedServicePath || detection.rootDirectory || '.';

    const providerConfig = buildProviderConfig(detection, provider);
    const port = resolvePort(detection, provider);
    const outputDir = resolveOutputDir(detection, provider);
    const startCommand = resolveStartCommand(detection, provider);
    const installCommand = resolveInstallCommand(detection);

    // Supplement env vars based on what we know
    const envVarNames = [...detection.envVarNames];
    if (detection.usesDatabase && !envVarNames.includes('DATABASE_URL')) {
      envVarNames.unshift('DATABASE_URL');
    }
    if (detection.usesRedis && !envVarNames.includes('REDIS_URL')) {
      envVarNames.push('REDIS_URL');
    }
    if (detection.runtime === 'node' && !envVarNames.includes('NODE_ENV')) {
      envVarNames.push('NODE_ENV');
    }
    if (provider === 'vercel' && detection.framework === 'nextjs' && !envVarNames.includes('NEXTAUTH_URL')) {
      // common Next.js env
    }

    return {
      id: uuidv4(),
      repoUrl,
      branch,
      provider,
      framework: detection.framework,
      runtime: detection.runtime,
      packageManager: detection.packageManager,
      runtimeVersion: detection.runtimeVersion,
      buildCommand: detection.buildCommand || '',
      installCommand,
      startCommand,
      outputDirectory: outputDir,
      rootDirectory: rootDir,
      envVarNames: [...new Set(envVarNames)].slice(0, 25),
      exposedPort: port,
      deploymentType: detection.deploymentType,
      isMonorepo: detection.isMonorepo,
      monorepoServices: detection.monorepoServices,
      confidence: detection.confidence,
      reasoning: detection.reasoning,
      detectionPath: detection.detectionPath,
      providerConfig,
    };
  }
}
