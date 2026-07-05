import axios from 'axios';
import { DetectionResult, Framework, Runtime, PackageManager, DeploymentType, RepoContext } from './types';

const VALID_FRAMEWORKS: Framework[] = [
  'nextjs', 'react', 'vite', 'angular', 'vue', 'nuxt', 'svelte', 'sveltekit',
  'node', 'express', 'fastify', 'nestjs',
  'python', 'flask', 'django', 'fastapi',
  'go', 'rust', 'java', 'spring-boot',
  'php', 'laravel', 'dotnet',
  'static', 'docker', 'docker-compose',
  'unknown',
];
const VALID_RUNTIMES: Runtime[] = ['node', 'python', 'go', 'rust', 'java', 'php', 'dotnet', 'docker', 'static', 'unknown'];
const VALID_PMS: PackageManager[] = ['npm', 'yarn', 'pnpm', 'bun', 'pip', 'poetry', 'pipenv', 'cargo', 'gradle', 'maven', 'composer', 'dotnet', 'unknown'];
const VALID_DEPLOY_TYPES: DeploymentType[] = ['static', 'ssr', 'api', 'fullstack', 'worker', 'docker'];

/**
 * Priority 6: AI inference.
 * Invoked only when the deterministic detectors (config files, Dockerfile, manifests,
 * lockfiles, package scripts) could not produce a confident result. Uses an LLM to reason
 * over the repo's file tree and any partially-recovered signals to infer the missing pieces.
 * Never overrides fields the deterministic pipeline already resolved with confidence.
 */
export class AIInference {
  private apiKey: string | undefined;
  private model: string;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    this.model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  }

  get available(): boolean {
    return !!this.apiKey;
  }

  /**
   * Attempt to infer missing/uncertain fields on a low-confidence DetectionResult.
   * Returns the same result, merged with inferred fields, if inference succeeds;
   * otherwise returns the original result unchanged.
   */
  async infer(ctx: RepoContext, partial: DetectionResult): Promise<DetectionResult> {
    if (!this.apiKey) return partial;

    const fileList = ctx.files.map(f => f.path).slice(0, 400).join('\n');
    const configSnippets = Object.entries(ctx.configFiles)
      .slice(0, 15)
      .map(([path, content]) => `--- ${path} ---\n${content.slice(0, 1500)}`)
      .join('\n\n');

    const prompt = `You are a deployment configuration inference engine. A repository could not be confidently classified by static analysis (config files, Dockerfile, manifests, lockfiles, package scripts). Infer the deployment configuration strictly from the file tree and any config snippets below.

Repository file tree:
${fileList}

Config file contents (may be partial or absent):
${configSnippets || '(no readable config files)'}

Partial static analysis found so far:
${JSON.stringify(partial, null, 2)}

Respond with ONLY valid JSON matching this exact shape (no markdown fences, no commentary):
{
  "framework": one of ${JSON.stringify(VALID_FRAMEWORKS)},
  "runtime": one of ${JSON.stringify(VALID_RUNTIMES)},
  "packageManager": one of ${JSON.stringify(VALID_PMS)},
  "deploymentType": one of ${JSON.stringify(VALID_DEPLOY_TYPES)},
  "buildCommand": "string or null",
  "installCommand": "string or null",
  "startCommand": "string or null",
  "outputDirectory": "string or null",
  "exposedPort": number,
  "confidence": number between 0 and 1,
  "reasoning": "one sentence explaining the inference"
}
Only fill fields you can justify from the given evidence. If genuinely undeterminable, keep the static analysis default rather than guessing wildly.`;

    try {
      const resp = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: this.model,
          messages: [
            { role: 'system', content: 'You are a precise deployment configuration inference engine. Respond only with valid JSON.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 700,
          temperature: 0.1,
        },
        { headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, timeout: 25000 }
      );

      const raw = resp.data.choices[0].message.content as string;
      const clean = raw.replace(/```json|```/g, '').trim();
      const inferred = JSON.parse(clean);

      const framework: Framework = VALID_FRAMEWORKS.includes(inferred.framework) ? inferred.framework : partial.framework;
      const runtime: Runtime = VALID_RUNTIMES.includes(inferred.runtime) ? inferred.runtime : partial.runtime;
      const packageManager: PackageManager = VALID_PMS.includes(inferred.packageManager) ? inferred.packageManager : partial.packageManager;
      const deploymentType: DeploymentType = VALID_DEPLOY_TYPES.includes(inferred.deploymentType) ? inferred.deploymentType : partial.deploymentType;
      const confidence = typeof inferred.confidence === 'number' ? Math.max(0, Math.min(1, inferred.confidence)) : Math.max(partial.confidence, 0.55);

      return {
        ...partial,
        framework,
        runtime,
        packageManager,
        deploymentType,
        buildCommand: partial.buildCommand || inferred.buildCommand || undefined,
        installCommand: partial.installCommand || inferred.installCommand || '',
        startCommand: partial.startCommand || inferred.startCommand || undefined,
        outputDirectory: (partial.outputDirectory && partial.outputDirectory !== 'dist') ? partial.outputDirectory : (inferred.outputDirectory || partial.outputDirectory),
        exposedPort: partial.exposedPort && partial.exposedPort !== 3000 ? partial.exposedPort : (inferred.exposedPort || partial.exposedPort),
        confidence: Math.min(confidence, 0.75), // AI inference is capped below deterministic-detection confidence
        reasoning: `AI inference: ${inferred.reasoning || 'inferred from repository structure'}`,
        detectionPath: 'ai-inference',
        aiInferred: true,
      };
    } catch {
      return partial;
    }
  }
}
