import { RepoInspector } from './RepoInspector';
import { FrameworkDetector } from './FrameworkDetector';
import { PlanBuilder } from './PlanBuilder';
import { DeploymentExecutor, UpdateCallback } from './DeploymentExecutor';
import { DeploymentPlan, Provider, DetectionResult } from './types';

export class AIDeploymentEngine {
  private inspector: RepoInspector;
  private detector: FrameworkDetector;
  private planner: PlanBuilder;
  private executor: DeploymentExecutor;

  constructor(githubToken?: string) {
    this.inspector = new RepoInspector(githubToken);
    this.detector = new FrameworkDetector();
    this.planner = new PlanBuilder();
    this.executor = new DeploymentExecutor();
  }

  /**
   * Step 1: Inspect the repository and return a Deployment Plan for user confirmation.
   * If the repo is a monorepo with multiple services, returns detected services so the user
   * can choose which one to deploy (the plan will use the first by default).
   */
  async buildPlan(
    repoUrl: string,
    branch: string,
    provider: Provider,
    selectedServicePath?: string,
  ): Promise<{ plan: DeploymentPlan; detection: DetectionResult }> {
    const ctx = await this.inspector.inspect(repoUrl, branch);
    const detection = await this.detector.detect(ctx);

    // If monorepo and no service selected, use first service's detection
    let effectiveDetection = detection;
    if (detection.isMonorepo && detection.monorepoServices?.length && selectedServicePath) {
      const svc = detection.monorepoServices.find(s => s.path === selectedServicePath);
      if (svc) {
        // Re-inspect just that subdirectory context
        const subCtx = {
          ...ctx,
          files: ctx.files
            .filter(f => f.path.startsWith(selectedServicePath + '/'))
            .map(f => ({ ...f, path: f.path.slice(selectedServicePath.length + 1) })),
          configFiles: Object.fromEntries(
            Object.entries(ctx.configFiles)
              .filter(([k]) => k.startsWith(selectedServicePath + '/'))
              .map(([k, v]) => [k.slice(selectedServicePath.length + 1), v])
          ),
        };
        effectiveDetection = await this.detector.detect(subCtx);
      }
    }

    const plan = this.planner.build(repoUrl, branch, provider, effectiveDetection, selectedServicePath);
    return { plan, detection: effectiveDetection };
  }

  /**
   * Step 2: Execute an approved Deployment Plan.
   * Streams updates via onUpdate callback.
   * Returns the cloud_deployment record id and (eventually) the live URL.
   */
  async executePlan(
    plan: DeploymentPlan,
    userId: string,
    onUpdate: UpdateCallback,
  ): Promise<{ cloudDeploymentId: string; url?: string }> {
    return this.executor.execute(plan, userId, onUpdate);
  }

  /**
   * Analyze a failed deployment and return AI-generated fixes.
   */
  async analyzeFailure(cloudDeploymentId: string) {
    return this.executor.analyzeFailure(cloudDeploymentId);
  }

  /**
   * Trigger a redeploy for an existing cloud deployment record.
   */
  async redeploy(cloudDeploymentId: string, userId: string, onUpdate: UpdateCallback) {
    return this.executor.redeploy(cloudDeploymentId, userId, onUpdate);
  }
}

export type { DeploymentPlan, DetectionResult, Provider } from './types';
