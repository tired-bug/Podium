import { DeploymentPlan, Provider } from './types';
import { providerManager } from '../../providers/ProviderManager';
import { DeployOptions } from '../../providers/IProvider';
import { getDb } from '../../db/index';

export interface ExecutionUpdate {
  type: 'log' | 'status' | 'url' | 'error' | 'done';
  message?: string;
  status?: string;
  url?: string;
  level?: 'info' | 'warn' | 'error';
  providerDeploymentId?: string;
}

export type UpdateCallback = (update: ExecutionUpdate) => void;

function getProviderCreds(provider: Provider): Record<string, string> {
  const db = getDb();
  const keys: Record<Provider, string[]> = {
    railway: ['railway_token', 'railway_workspace_id'],
    render: ['render_api_key', 'render_owner_id'],
    vercel: ['vercel_token'],
  };
  const result: Record<string, string> = {};
  for (const key of keys[provider]) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any;
    if (row?.value) result[key] = row.value;
    else if (process.env[key.toUpperCase()]) result[key] = process.env[key.toUpperCase()]!;
  }
  return result;
}

function getGithubToken(userId: string): string | undefined {
  try {
    const row = getDb().prepare('SELECT token FROM github_accounts WHERE user_id = ? LIMIT 1').get(userId) as any;
    return row?.token;
  } catch { return undefined; }
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

function repoName(repoUrl: string): string {
  return repoUrl.replace(/\.git$/, '').split('/').pop() || 'app';
}

function appendCloudLog(id: string, message: string) {
  try {
    const dep = getDb().prepare('SELECT logs FROM cloud_deployments WHERE id=?').get(id) as any;
    if (!dep) return;
    const logs = JSON.parse(dep.logs || '[]');
    logs.push({ time: new Date().toISOString(), message });
    getDb().prepare("UPDATE cloud_deployments SET logs=?, updated_at=datetime('now') WHERE id=?")
      .run(JSON.stringify(logs), id);
  } catch {}
}

function setCloudStatus(id: string, status: string, url?: string, error?: string) {
  try {
    getDb().prepare(
      "UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), provider_error=COALESCE(?,provider_error), updated_at=datetime('now') WHERE id=?"
    ).run(status, url || null, error || null, id);
  } catch {}
}

export class DeploymentExecutor {
  async execute(
    plan: DeploymentPlan,
    userId: string,
    onUpdate: UpdateCallback,
  ): Promise<{ cloudDeploymentId: string; url?: string }> {
    const creds = getProviderCreds(plan.provider);
    let provider: any;
    try { provider = providerManager.get(plan.provider); }
    catch { throw new Error(`Provider "${plan.provider}" not registered`); }

    const githubToken = getGithubToken(userId);

    const name = slugify(repoName(plan.repoUrl));

    // Build env vars map from plan (values empty — user fills them in)
    // We don't set values for security — they come from the UI
    const envVars: Record<string, string> = {};

    const opts: DeployOptions = {
      name,
      repoUrl: plan.repoUrl,
      branch: plan.branch,
      buildCommand: plan.buildCommand || undefined,
      startCommand: plan.startCommand || undefined,
      envVars,
      ports: plan.exposedPort ? [plan.exposedPort] : [],
      githubToken,
      // Render-specific
      runtime: plan.providerConfig.runtime,
      plan: plan.providerConfig.plan || 'free',
      ownerId: (creds as any).render_owner_id,
      // Vercel-specific
      framework: plan.providerConfig.framework || undefined,
      rootDirectory: plan.rootDirectory !== '.' ? plan.rootDirectory : undefined,
      outputDirectory: plan.outputDirectory !== 'dist' ? plan.outputDirectory : undefined,
      // Railway-specific
      workspaceId: (creds as any).railway_workspace_id,
    };

    // Create cloud_deployment record
    const { v4: uuidv4 } = require('uuid');
    const cloudId = uuidv4();
    const config = JSON.stringify({
      framework: plan.framework,
      runtime: plan.runtime,
      buildCommand: plan.buildCommand,
      startCommand: plan.startCommand,
      outputDirectory: plan.outputDirectory,
      rootDirectory: plan.rootDirectory,
      port: plan.exposedPort,
      packageManager: plan.packageManager,
      deploymentType: plan.deploymentType,
      confidence: plan.confidence,
    });

    getDb().prepare(`
      INSERT INTO cloud_deployments
        (id, provider, name, region, status, config, logs, repo_url, branch, user_id, source_type)
      VALUES (?, ?, ?, ?, 'building', ?, '[]', ?, ?, ?, 'ai-deploy')
    `).run(cloudId, plan.provider, name, 'auto', config, plan.repoUrl, plan.branch, userId);

    onUpdate({ type: 'log', message: `[podium] Creating deployment "${name}" on ${plan.provider}...`, level: 'info' });
    appendCloudLog(cloudId, `Creating deployment "${name}" on ${plan.provider}`);

    let deployResult: any;
    try {
      deployResult = await provider.deploy(creds, opts, cloudId);
    } catch (err: any) {
      const msg = err?.message || 'Deployment failed';
      setCloudStatus(cloudId, 'failed', undefined, msg);
      onUpdate({ type: 'error', message: `[podium] Deploy error: ${msg}`, level: 'error' });
      throw err;
    }

    const providerDepId = deployResult.deploymentId;
    onUpdate({ type: 'log', message: `[podium] Deployment created. Provider ID: ${providerDepId}`, level: 'info' });
    onUpdate({ type: 'status', status: 'building' });
    appendCloudLog(cloudId, `Provider deployment ID: ${providerDepId}`);

    // Update record with provider deployment id
    getDb().prepare("UPDATE cloud_deployments SET provider_deployment_id=? WHERE id=?")
      .run(providerDepId, cloudId);

    if (deployResult.url) {
      setCloudStatus(cloudId, 'building', deployResult.url);
      onUpdate({ type: 'url', url: deployResult.url });
    }

    // Poll status
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes at 5s intervals
    let finalUrl = deployResult.url;
    let finalStatus = 'building';

    const poll = async (): Promise<void> => {
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000));
        attempts++;

        try {
          const status = await provider.getStatus(creds, providerDepId);
          finalStatus = status.status;

          if (status.url && status.url !== finalUrl) {
            finalUrl = status.url;
            setCloudStatus(cloudId, status.status, finalUrl);
            onUpdate({ type: 'url', url: finalUrl });
          }

          onUpdate({ type: 'status', status: status.status });
          appendCloudLog(cloudId, `Status: ${status.status}`);

          // Fetch and stream logs
          try {
            const logs = await provider.getLogs(creds, providerDepId);
            for (const log of logs.slice(-5)) { // only last 5 to avoid spam
              const level = log.level || 'info';
              const msg = `[${plan.provider}] ${log.message}`;
              onUpdate({ type: 'log', message: msg, level });
              appendCloudLog(cloudId, log.message);
            }
          } catch { /* logs may not be available */ }

          if (['live', 'failed', 'suspended'].includes(status.status)) {
            break;
          }
        } catch (err: any) {
          onUpdate({ type: 'log', message: `[podium] Status check failed: ${err.message}`, level: 'warn' });
        }
      }
    };

    await poll();

    setCloudStatus(cloudId, finalStatus, finalUrl);

    if (finalStatus === 'live') {
      onUpdate({ type: 'done', status: 'live', url: finalUrl });
      onUpdate({ type: 'log', message: `[podium] ✅ Deployment live${finalUrl ? `: ${finalUrl}` : ''}`, level: 'info' });
    } else if (finalStatus === 'failed') {
      onUpdate({ type: 'error', message: '[podium] ❌ Deployment failed. Check logs for details.', level: 'error' });
    } else {
      onUpdate({ type: 'done', status: finalStatus, url: finalUrl });
    }

    return { cloudDeploymentId: cloudId, url: finalUrl };
  }

  /** Re-trigger an existing deployment (used after fix) */
  async redeploy(
    cloudDeploymentId: string,
    userId: string,
    onUpdate: UpdateCallback,
  ): Promise<void> {
    const dep = getDb().prepare('SELECT * FROM cloud_deployments WHERE id=?').get(cloudDeploymentId) as any;
    if (!dep) throw new Error('Deployment not found');

    let provider: any;
    try { provider = providerManager.get(dep.provider as Provider); }
    catch { throw new Error(`Provider "${dep.provider}" not available`); }

    const creds = getProviderCreds(dep.provider as Provider);
    const githubToken = getGithubToken(userId);
    const config = JSON.parse(dep.config || '{}');

    onUpdate({ type: 'log', message: '[podium] Triggering redeploy...', level: 'info' });
    setCloudStatus(cloudDeploymentId, 'building');

    const opts: DeployOptions = {
      name: dep.name,
      repoUrl: dep.repo_url,
      branch: dep.branch,
      buildCommand: config.buildCommand,
      startCommand: config.startCommand,
      githubToken,
    };

    try {
      const result = await provider.deploy(creds, opts, cloudDeploymentId);
      onUpdate({ type: 'status', status: 'building' });
      appendCloudLog(cloudDeploymentId, `Redeployment triggered: ${result.deploymentId}`);
      onUpdate({ type: 'log', message: `[podium] Redeploy started. ID: ${result.deploymentId}`, level: 'info' });
    } catch (err: any) {
      const msg = err?.message || 'Redeploy failed';
      setCloudStatus(cloudDeploymentId, 'failed', undefined, msg);
      onUpdate({ type: 'error', message: `[podium] ${msg}`, level: 'error' });
      throw err;
    }
  }

  /** Analyze deployment failure logs and suggest fixes using Groq */
  async analyzeFailure(cloudDeploymentId: string): Promise<{ rootCause: string; fixes: string[]; canRedeploy: boolean }> {
    const dep = getDb().prepare('SELECT * FROM cloud_deployments WHERE id=?').get(cloudDeploymentId) as any;
    if (!dep) throw new Error('Deployment not found');

    const logs: any[] = JSON.parse(dep.logs || '[]');
    const errorLogs = logs.filter(l => /error|fail|cannot|not found|exit/i.test(l.message)).slice(-20);
    const logText = errorLogs.map(l => l.message).join('\n') || 'No error logs available';

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return {
        rootCause: 'AI analysis not available (GROQ_API_KEY not configured)',
        fixes: ['Check provider dashboard for detailed error logs', 'Verify build and start commands are correct'],
        canRedeploy: true,
      };
    }

    const axios = require('axios');
    try {
      const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a deployment failure analyst. Respond ONLY with valid JSON.',
          },
          {
            role: 'user',
            content: `Deployment "${dep.name}" on ${dep.provider} failed.\nConfig: ${dep.config}\nError logs:\n${logText}\n\nRespond with JSON: { "rootCause": "string", "fixes": ["step1", "step2", ...], "canRedeploy": true/false }`,
          },
        ],
        max_tokens: 600,
        temperature: 0.3,
      }, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });

      const raw = resp.data.choices[0].message.content as string;
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      return {
        rootCause: 'Could not analyze — check provider logs directly',
        fixes: [
          'Verify build command outputs the expected artifacts',
          'Check start command points to the correct entry file',
          'Ensure all required environment variables are set',
        ],
        canRedeploy: true,
      };
    }
  }
}
