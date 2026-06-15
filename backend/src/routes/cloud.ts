import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { createHmac } from 'crypto';
import { getDb } from '../db/index';
import { requireAuth, requireRole } from '../auth';

const router = Router();

/* ---------------- helpers ---------------- */

function get(key: string): string {
  return (
    (getDb().prepare('SELECT value FROM settings WHERE key=?').get(key) as any)
      ?.value ||
    process.env[key.toUpperCase()] ||
    ''
  );
}

function ready(provider: string): boolean {
  if (provider === 'azure')
    return !!(
      get('azure_subscription_id') &&
      get('azure_client_id') &&
      get('azure_client_secret') &&
      get('azure_tenant_id')
    );

  if (provider === 'aws')
    return !!(get('aws_access_key_id') && get('aws_secret_access_key'));

  if (provider === 'vercel') return !!get('vercel_api_token');
  if (provider === 'render')
    return !!(get('render_api_key') && get('render_owner_id'));

  return false;
}

function appendLog(id: string, message: string) {
  try {
    const dep = getDb().prepare('SELECT logs FROM cloud_deployments WHERE id=?').get(id) as any;
    if (!dep) return;

    const logs = JSON.parse(dep.logs || '[]');
    logs.push({ time: new Date().toISOString(), message });

    getDb()
      .prepare("UPDATE cloud_deployments SET logs=?, updated_at=datetime('now') WHERE id=?")
      .run(JSON.stringify(logs), id);
  } catch {}
}

function setStatus(id: string, status: string, url?: string) {
  try {
    getDb()
      .prepare(
        "UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), updated_at=datetime('now') WHERE id=?"
      )
      .run(status, url || null, id);
  } catch {}
}

/* ---------------- Azure ---------------- */

async function getAzureToken(): Promise<string> {
  const r = await axios.post(
    `https://login.microsoftonline.com/${get('azure_tenant_id')}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: get('azure_client_id'),
      client_secret: get('azure_client_secret'),
      scope: 'https://management.azure.com/.default',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return r.data.access_token;
}

async function deployAzure(
  id: string,
  name: string,
  image: string,
  region: string,
  envVars: Record<string, string>,
  ports: number[]
) {
  const sub = get('azure_subscription_id');
  const rg = get('azure_resource_group') || 'podium-rg';
  const loc = region || get('azure_location') || 'eastus';

  const token = await getAzureToken();

  try {
    appendLog(id, 'Creating Azure Container Instance...');
    setStatus(id, 'deploying');

    const containerName = `podium-${name}-${id.slice(0, 6)}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 63);

    const portsPayload = (ports.length ? ports : [80]).map(p => ({
      port: p,
      protocol: 'TCP',
    }));

    await axios.put(
      `https://management.azure.com/subscriptions/${sub}/resourceGroups/${rg}?api-version=2021-04-01`,
      { location: loc },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const res = await axios.put(
      `https://management.azure.com/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.ContainerInstance/containerGroups/${containerName}?api-version=2021-10-01`,
      {
        location: loc,
        properties: {
          containers: [
            {
              name: containerName,
              properties: {
                image,
                resources: {
                  requests: { cpu: 1, memoryInGB: 1.5 },
                },
                environmentVariables: Object.entries(envVars).map(([name, value]) => ({
                  name,
                  value,
                })),
                ports: portsPayload,
              },
            },
          ],
          osType: 'Linux',
          ipAddress: {
            type: 'Public',
            ports: portsPayload,
            dnsNameLabel: containerName,
          },
        },
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const fqdn = res.data?.properties?.ipAddress?.fqdn;
    const url = fqdn ? `http://${fqdn}` : '';

    setStatus(id, 'running', url);
    appendLog(id, `Azure deployed: ${url}`);
  } catch (err: any) {
    const msg = err.response?.data?.error?.message || err.message;
    setStatus(id, 'failed');
    appendLog(id, `Azure error: ${msg}`);
    throw err;
  }
}

/* ---------------- AWS ---------------- */

function awsSign(
  method: string,
  url: string,
  region: string,
  service: string,
  body: string,
  accessKey: string,
  secretKey: string
) {
  const now = new Date();
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateShort = date.slice(0, 8);

  const urlObj = new URL(url);

  const canonicalHeaders =
    `content-type:application/x-amz-json-1.0\n` +
    `host:${urlObj.hostname}\n` +
    `x-amz-date:${date}\n`;

  const signedHeaders = 'content-type;host;x-amz-date';

  const bodyHash = createHmac('sha256', '').update(body).digest('hex');

  const canonicalReq = [
    method,
    urlObj.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  const credScope = `${dateShort}/${region}/${service}/aws4_request`;

  const strToSign =
    `AWS4-HMAC-SHA256\n${date}\n${credScope}\n` +
    createHmac('sha256', canonicalReq).digest('hex');

  const kDate = createHmac('sha256', `AWS4${secretKey}`).update(dateShort).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update(service).digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();

  const signature = createHmac('sha256', kSigning).update(strToSign).digest('hex');

  return {
    date,
    auth: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function deployAWS(
  id: string,
  name: string,
  image: string,
  region: string,
  envVars: Record<string, string>,
  ports: number[]
) {
  const accessKey = get('aws_access_key_id');
  const secretKey = get('aws_secret_access_key');
  const awsRegion = region || get('aws_default_region') || 'us-east-1';
  const port = ports[0] || 8080;

  try {
    appendLog(id, `Deploying to AWS (${awsRegion})...`);
    setStatus(id, 'deploying');

    const body = JSON.stringify({
      ServiceName: `podium-${name}-${id.slice(0, 6)}`.toLowerCase(),
      SourceConfiguration: {
        ImageRepository: {
          ImageIdentifier: image,
          ImageRepositoryType: 'ECR_PUBLIC',
          ImageConfiguration: {
            Port: String(port),
            RuntimeEnvironmentVariables: envVars,
          },
        },
        AutoDeploymentsEnabled: false,
      },
      InstanceConfiguration: {
        Cpu: '1 vCPU',
        Memory: '2 GB',
      },
    });

    const url = `https://apprunner.${awsRegion}.amazonaws.com/services`;

    const { date, auth } = awsSign(
      'POST',
      url,
      awsRegion,
      'apprunner',
      body,
      accessKey,
      secretKey
    );

    const resp = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/x-amz-json-1.0',
        'X-Amz-Date': date,
        'X-Amz-Target': 'AppRunner.CreateService',
        Authorization: auth,
      },
    });

    const serviceUrl = resp.data?.Service?.ServiceUrl;

    setStatus(id, 'running', serviceUrl);
    appendLog(id, `AWS live: ${serviceUrl}`);
  } catch (err: any) {
    const msg = err.response?.data?.message || err.message;
    setStatus(id, 'failed');
    appendLog(id, `AWS error: ${msg}`);
    throw err;
  }
}

/* ---------------- Vercel ---------------- */

async function deployVercel(
  id: string,
  name: string,
  envVars: Record<string, string>,
  githubRepo?: string
) {
  const token = get('vercel_api_token');

  try {
    appendLog(id, 'Deploying to Vercel...');
    setStatus(id, 'deploying');

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const projectName = `podium-${name}`.toLowerCase();

    const project = await axios.post(
      'https://api.vercel.com/v9/projects',
      { name: projectName },
      { headers }
    );

    const projectId = project.data.id;

    const files = githubRepo
      ? []
      : [
          {
            file: 'index.html',
            data: `<h1>${name}</h1>`,
          },
        ];

    const deploy = await axios.post(
      'https://api.vercel.com/v13/deployments',
      {
        name: projectName,
        project: projectId,
        files,
      },
      { headers }
    );

    setStatus(id, 'running', `https://${deploy.data.url}`);
    appendLog(id, `Vercel live: ${deploy.data.url}`);
  } catch (err: any) {
    const msg = err.response?.data?.error?.message || err.message;
    setStatus(id, 'failed');
    appendLog(id, `Vercel error: ${msg}`);
    throw err;
  }
}

/* ---------------- Render ---------------- */

async function deployRender(
  id: string,
  name: string,
  image: string,
  envVars: Record<string, string>
) {
  const apiKey = get('render_api_key');

  try {
    appendLog(id, 'Deploying to Render...');
    setStatus(id, 'deploying');

    const service = await axios.post(
      'https://api.render.com/v1/services',
      {
        type: 'web_service',
        name: `podium-${name}`,
        image: { imagePath: image },
        envVars: Object.entries(envVars).map(([key, value]) => ({
          key,
          value,
        })),
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const url = service.data?.service?.serviceDetails?.url;

    setStatus(id, 'running', url);
    appendLog(id, `Render live: ${url}`);
  } catch (err: any) {
    const msg = err.response?.data?.message || err.message;
    setStatus(id, 'failed');
    appendLog(id, `Render error: ${msg}`);
    throw err;
  }
}

/* ---------------- dispatcher ---------------- */

async function dispatch(
  id: string,
  provider: string,
  name: string,
  image: string,
  region: string,
  envVars: Record<string, string>,
  ports: number[]
) {
  try {
    if (provider === 'azure')
      return await deployAzure(id, name, image, region, envVars, ports);

    if (provider === 'aws')
      return await deployAWS(id, name, image, region, envVars, ports);

    if (provider === 'vercel')
      return await deployVercel(id, name, envVars);

    if (provider === 'render')
      return await deployRender(id, name, image, envVars);

    throw new Error('Unknown provider');
  } catch (e: any) {
    setStatus(id, 'failed');
    appendLog(id, e.message);
  }
}

/* ---------------- routes ---------------- */

router.get('/', requireAuth, (_req, res) => {
  const deps = getDb().prepare('SELECT * FROM cloud_deployments').all() as any[];

  res.json(
    deps.map(d => ({
      ...d,
      config: JSON.parse(d.config || '{}'),
      logs: JSON.parse(d.logs || '[]'),
    }))
  );
});

router.post('/deploy', requireAuth, async (req, res: Response) => {
  const { provider, name, image = 'nginx:latest', region, config = {}, ports = [] } = req.body;

  const id = uuidv4();
  const envVars = config || {};
  const portNums = ports.map(Number);

  getDb()
    .prepare(
      'INSERT INTO cloud_deployments (id, provider, name, region, status, docker_image, config, logs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      id,
      provider,
      name,
      region,
      'queued',
      image,
      JSON.stringify(envVars),
      JSON.stringify([{ time: new Date().toISOString(), message: 'Queued' }])
    );

  dispatch(id, provider, name, image, region, envVars, portNums).catch(() => {});

  res.status(201).json({ id });
});

export default router;