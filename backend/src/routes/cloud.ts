import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { createHmac } from 'crypto';
import { getDb } from '../db/index';
import { requireAuth, requireRole } from '../auth';

const router = Router();

function get(key: string): string {
  return (getDb().prepare('SELECT value FROM settings WHERE key=?').get(key) as any)?.value
    || process.env[key.toUpperCase()] || '';
}

function ready(provider: string): boolean {
  if (provider === 'azure')  return !!(get('azure_subscription_id') && get('azure_client_id') && get('azure_client_secret') && get('azure_tenant_id'));
  if (provider === 'aws')    return !!(get('aws_access_key_id') && get('aws_secret_access_key'));
  if (provider === 'vercel') return !!get('vercel_api_token');
  if (provider === 'render') return !!(get('render_api_key') && get('render_owner_id'));
  return false;
}

function appendLog(id: string, message: string) {
  try {
    const dep = getDb().prepare('SELECT logs FROM cloud_deployments WHERE id=?').get(id) as any;
    if (!dep) return;
    const logs = JSON.parse(dep.logs || '[]');
    logs.push({ time: new Date().toISOString(), message });
    getDb().prepare("UPDATE cloud_deployments SET logs=?, updated_at=datetime('now') WHERE id=?")
      .run(JSON.stringify(logs), id);
  } catch {}
}

function setStatus(id: string, status: string, url?: string) {
  try {
    getDb().prepare("UPDATE cloud_deployments SET status=?, url=COALESCE(?,url), updated_at=datetime('now') WHERE id=?")
      .run(status, url || null, id);
  } catch {}
}

async function getAzureToken(): Promise<string> {
  const r = await axios.post(
    `https:
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id:  get('azure_client_id'),
      client_secret: get('azure_client_secret'),
      scope: 'https:
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return r.data.access_token;
}

async function deployAzure(id: string, name: string, image: string, region: string, envVars: Record<string,string>, portList: number[]) {
  const sub = get('azure_subscription_id');
  const rg  = get('azure_resource_group') || 'podium-rg';
  const loc = region || get('azure_location') || 'eastus';
  const ports = portList.length ? portList : [80];

  try {
    appendLog(id, 'Authenticating with Azure AD...');
    const token = await getAzureToken();

    appendLog(id, `Ensuring resource group "${rg}" in ${loc}...`);
    await axios.put(
      `https:
      { location: loc },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const cName = `podium-${name}-${id.slice(0,6)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 63);
    appendLog(id, `Creating Container Instance "${cName}"...`);
    setStatus(id, 'deploying');

    await axios.put(
      `https:
      {
        location: loc,
        properties: {
          containers: [{
            name: cName,
            properties: {
              image,
              resources: { requests: { cpu: 1, memoryInGB: 1.5 } },
              environmentVariables: Object.entries(envVars).map(([n,v]) => ({ name: n, value: v })),
              ports: ports.map(p => ({ port: p, protocol: 'TCP' })),
            },
          }],
          osType: 'Linux',
          restartPolicy: 'Always',
          ipAddress: {
            type: 'Public',
            dnsNameLabel: cName,
            ports: ports.map(p => ({ port: p, protocol: 'TCP' })),
          },
        },
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    appendLog(id, 'Waiting for container to start...');
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 6000));
      const s = await axios.get(
        `https:
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const state = s.data.properties?.provisioningState;
      const fqdn  = s.data.properties?.ipAddress?.fqdn;
      const ip    = s.data.properties?.ipAddress?.ip;
      appendLog(id, `Azure state: ${state}${fqdn ? ` - ${fqdn}` : ''}`);
      if (state === 'Succeeded') {
        const url = fqdn ? `http:
        setStatus(id, 'running', url);
        appendLog(id, `- Live${url ? ': ' + url : ''}!`);
        return;
      }
      if (state === 'Failed') throw new Error('Azure provisioning failed');
    }
    throw new Error('Timed out waiting for Azure');
  } catch (err: any) {
    const msg = err.response?.data?.error?.message || err.message;
    setStatus(id, 'failed');
    appendLog(id, `- Azure error: ${msg}`);
    throw err;
  }
}

function awsSign(method: string, url: string, region: string, service: string, body: string, accessKey: string, secretKey: string) {
  const now = new Date();
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateShort = date.slice(0, 8);
  const urlObj = new URL(url);
  const canonicalHeaders = `content-type:application/x-amz-json-1.0\nhost:${urlObj.hostname}\nx-amz-date:${date}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const bodyHash = require('crypto').createHash('sha256').update(body).digest('hex');
  const canonicalReq = [method, urlObj.pathname, '', canonicalHeaders, signedHeaders, bodyHash].join('\n');
  const credScope = `${dateShort}/${region}/${service}/aws4_request`;
  const strToSign = `AWS4-HMAC-SHA256\n${date}\n${credScope}\n${require('crypto').createHash('sha256').update(canonicalReq).digest('hex')}`;
  const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
  const sigKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateShort), region), service), 'aws4_request');
  const sig = createHmac('sha256', sigKey).update(strToSign).digest('hex');
  return { date, auth: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credScope},SignedHeaders=${signedHeaders},Signature=${sig}` };
}

async function deployAWS(id: string, name: string, image: string, region: string, envVars: Record<string,string>, portList: number[]) {
  const accessKey = get('aws_access_key_id');
  const secretKey = get('aws_secret_access_key');
  const awsRegion = region || get('aws_default_region') || 'us-east-1';
  const port = portList[0] || 8080;

  try {
    appendLog(id, `Connecting to AWS App Runner in ${awsRegion}...`);
    setStatus(id, 'deploying');

    const serviceBody = JSON.stringify({
      ServiceName: `podium-${name}-${id.slice(0,6)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40),
      SourceConfiguration: {
        ImageRepository: {
          ImageIdentifier: image,
          ImageRepositoryType: image.includes('.amazonaws.com') ? 'ECR' : 'ECR_PUBLIC',
          ImageConfiguration: {
            Port: String(port),
            RuntimeEnvironmentVariables: envVars,
          },
        },
        AutoDeploymentsEnabled: false,
      },
      InstanceConfiguration: { Cpu: '1 vCPU', Memory: '2 GB' },
    });

    const url = `https:
    const { date, auth } = awsSign('POST', url, awsRegion, 'apprunner', serviceBody, accessKey, secretKey);

    appendLog(id, 'Creating AWS App Runner service...');
    const resp = await axios.post(url, serviceBody, {
      headers: {
        'Content-Type': 'application/x-amz-json-1.0',
        'X-Amz-Date': date,
        'X-Amz-Target': 'AppRunner.CreateService',
        Authorization: auth,
      },
    });

    const serviceArn = resp.data.Service?.ServiceArn;
    const statusUrl  = resp.data.Service?.ServiceUrl;
    appendLog(id, `Service ARN: ${serviceArn}`);
    appendLog(id, 'Waiting for service to become active (this takes 2-3 minutes)...');

    
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 8000));
      const descBody = JSON.stringify({ ServiceArn: serviceArn });
      const { date: d2, auth: a2 } = awsSign('POST', url.replace('/service', `/${serviceArn}`), awsRegion, 'apprunner', descBody, accessKey, secretKey);
      try {
        const descResp = await axios.post(url, descBody, {
          headers: { 'Content-Type': 'application/x-amz-json-1.0', 'X-Amz-Date': d2, 'X-Amz-Target': 'AppRunner.DescribeService', Authorization: a2 },
        });
        const svcStatus = descResp.data.Service?.Status;
        appendLog(id, `AWS App Runner: ${svcStatus}`);
        if (svcStatus === 'RUNNING') {
          const svcUrl = descResp.data.Service?.ServiceUrl || statusUrl;
          setStatus(id, 'running', svcUrl ? `https:
          appendLog(id, `- Service live${svcUrl ? ': https:
          return;
        }
        if (['CREATE_FAILED', 'DELETED'].includes(svcStatus)) throw new Error(`App Runner status: ${svcStatus}`);
      } catch (pollErr: any) {
        if (pollErr.response?.status === 404) continue;
        throw pollErr;
      }
    }
    throw new Error('Timed out waiting for AWS App Runner');
  } catch (err: any) {
    const msg = err.response?.data?.message || err.message;
    setStatus(id, 'failed');
    appendLog(id, `- AWS error: ${msg}`);
    throw err;
  }
}

async function deployVercel(id: string, name: string, image: string, region: string, envVars: Record<string,string>, githubRepo?: string, branch = 'main') {
  const token  = get('vercel_api_token');
  const teamId = get('vercel_team_id');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const qs = teamId ? `?teamId=${teamId}` : '';

  try {
    appendLog(id, 'Connecting to Vercel API...');
    setStatus(id, 'deploying');

    const me = await axios.get('https:
    appendLog(id, `Authenticated as ${me.data.user?.username || me.data.user?.email}`);

    const projectName = `podium-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 52);

    
    let project: any;
    try {
      const projResp = await axios.post(`https:
        name: projectName,
        ...(teamId ? { teamId } : {}),
      }, { headers });
      project = projResp.data;
      appendLog(id, `Project created: ${project.id}`);
    } catch (e: any) {
      if (e.response?.status === 409) {
        const existing = await axios.get(`https:
        project = existing.data;
        appendLog(id, `Using existing project: ${project.id}`);
      } else throw e;
    }

    
    const cleanEnv = Object.entries(envVars).filter(([k]) =>
      !['github_repo','branch','framework','plan','resource_group','cpu','memory'].includes(k)
    );
    if (cleanEnv.length > 0) {
      await axios.post(`https:
        cleanEnv.map(([key, value]) => ({ key, value, type: 'plain', target: ['production','preview','development'] })),
        { headers }
      ).catch(() => {});
    }

    
    if (githubRepo && githubRepo.includes('github.com')) {
      const match = githubRepo.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
      if (!match) throw new Error('Invalid GitHub repo URL — use https:
      const [, repoOwner, repoName] = match;

      appendLog(id, `Downloading ${repoOwner}/${repoName}@${branch} from GitHub...`);

      
      const zipUrl = `https:
      const zipResp = await axios.get(zipUrl, { responseType: 'arraybuffer' });
      const zipBuffer = Buffer.from(zipResp.data);
      appendLog(id, `Downloaded ${(zipBuffer.length / 1024).toFixed(0)} KB — extracting files...`);

      
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();
      const prefix  = `${repoName}-${branch}/`;

      
      const SKIP = /node_modules|\.git|dist\/|\.next\/|build\/|\.cache/;
      const MAX_FILE_SIZE = 5 * 1024 * 1024; 
      const files: Array<{ file: string; data: string; encoding?: string }> = [];

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const fullPath = entry.entryName;
        if (SKIP.test(fullPath)) continue;
        const relativePath = fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
        if (!relativePath) continue;
        const buf = entry.getData();
        if (buf.length > MAX_FILE_SIZE) { appendLog(id, `Skipping large file: ${relativePath}`); continue; }
        if (files.length >= 200) break;

        
        const isBinary = buf.some((b: number) => b === 0);
        files.push({
          file: relativePath,
          data: isBinary ? buf.toString('base64') : buf.toString('utf-8'),
          ...(isBinary ? { encoding: 'base64' } : {}),
        });
      }

      appendLog(id, `Uploading ${files.length} files to Vercel...`);

      
      const pkgFile = files.find(f => f.file === 'package.json');
      let framework: string | null = null;
      if (pkgFile) {
        try {
          const pkg = JSON.parse(pkgFile.data);
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          if (deps['next'])         framework = 'nextjs';
          else if (deps['nuxt'])    framework = 'nuxtjs';
          else if (deps['@sveltejs/kit']) framework = 'sveltekit';
          else if (deps['astro'])   framework = 'astro';
          else if (deps['vite'])    framework = 'vite';
          else if (deps['react-scripts']) framework = 'create-react-app';
          else if (deps['react'])   framework = 'vite';
          if (framework) appendLog(id, `Detected framework: ${framework}`);
        } catch {}
      }

      
      if (framework) {
        await axios.patch(`https:
          { framework }, { headers }
        ).catch(() => {});
      }

      
      const depResp = await axios.post(`https:
        name: projectName,
        project: project.id,
        target: 'production',
        files,
        ...(teamId ? { teamId } : {}),
      }, { headers });

      const depId  = depResp.data.id;
      const depUrl = depResp.data.url;
      appendLog(id, `Build started: ${depId}`);
      appendLog(id, 'Building project (this takes 1-3 min)...');

      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 6000));
        const statusResp = await axios.get(`https:
        const state = statusResp.data.readyState || statusResp.data.state;
        const url   = statusResp.data.url || depUrl;
        appendLog(id, `Vercel: ${state}`);
        if (state === 'READY') {
          setStatus(id, 'running', `https:
          appendLog(id, `- Live: https:
          return;
        }
        if (['ERROR', 'CANCELED'].includes(state)) {
          
          try {
            const errResp = await axios.get(`https:
            const errors = errResp.data?.filter((e: any) => e.type === 'stderr').slice(-5);
            errors?.forEach((e: any) => appendLog(id, `  ${e.text || e.payload?.text || ''}`));
          } catch {}
          throw new Error(`Vercel build ${state}`);
        }
      }
      throw new Error('Timed out waiting for Vercel build');
    }

    
    appendLog(id, 'No GitHub repo provided — deploying placeholder page...');
    const depResp = await axios.post(`https:
      name: projectName, project: project.id, target: 'production',
      files: [{ file: 'index.html', data: `<!DOCTYPE html><html><head><title>${name}</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0f;color:#fff}h1{background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}</style></head><body><h1>${name} — deployed via Podium</h1></body></html>` }],
      ...(teamId ? { teamId } : {}),
    }, { headers });

    const depId  = depResp.data.id;
    const depUrl = depResp.data.url;
    appendLog(id, `Deployment created: ${depId}`);

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const statusResp = await axios.get(`https:
      const state = statusResp.data.readyState || statusResp.data.state;
      const url   = statusResp.data.url || depUrl;
      appendLog(id, `Vercel: ${state}`);
      if (state === 'READY') { setStatus(id, 'running', `https:
      if (['ERROR', 'CANCELED'].includes(state)) throw new Error(`Vercel deployment ${state}`);
    }
    throw new Error('Timed out');

  } catch (err: any) {
    const msg = err.response?.data?.error?.message || err.message;
    setStatus(id, 'failed');
    appendLog(id, `- Vercel error: ${msg}`);
    throw err;
  }
}

async function deployRender(id: string, name: string, image: string, region: string, envVars: Record<string,string>, portList: number[]) {
  const apiKey  = get('render_api_key');
  const ownerId = get('render_owner_id');
  const renderRegion = region || get('render_region') || 'oregon';
  const port = portList[0] || 80;

  try {
    appendLog(id, 'Connecting to Render API...');
    setStatus(id, 'deploying');

    const me = await axios.get('https:
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    const owner = me.data?.[0]?.owner;
    appendLog(id, `Authenticated as ${owner?.name || owner?.email || 'unknown'}`);

    const serviceName = `podium-${name}-${id.slice(0,6)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 63);
    appendLog(id, `Creating Render web service "${serviceName}" (image: ${image})...`);

    
    
    const createResp = await axios.post('https:
      type: 'web_service',
      name: serviceName,
      ownerId,
      serviceDetails: {
        runtime: 'image',
        plan: 'free',
        region: renderRegion,
        numInstances: 1,
        envVars: Object.entries(envVars).map(([key, value]) => ({ key, value })),
      },
      image: { imagePath: image },
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    });

    const serviceId  = createResp.data.service?.id;
    const serviceUrl = createResp.data.service?.serviceDetails?.url || `https:
    appendLog(id, `Service created: ${serviceId}`);
    appendLog(id, 'Waiting for deployment to go live (free tier takes 3-5 min)...');

    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 9000));
      try {
        const deploysResp = await axios.get(`https:
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        });
        const latest = deploysResp.data?.[0]?.deploy;
        const depStatus = latest?.status || 'unknown';
        appendLog(id, `Render deploy status: ${depStatus}`);
        if (depStatus === 'live') {
          setStatus(id, 'running', serviceUrl);
          appendLog(id, `- Live: ${serviceUrl}`);
          return;
        }
        if (depStatus === 'failed' || depStatus === 'canceled') {
          throw new Error(`Render deployment ${depStatus}`);
        }
      } catch (pollErr: any) {
        if (pollErr.response?.status === 404) continue;
        throw pollErr;
      }
    }
    throw new Error('Timed out waiting for Render');
  } catch (err: any) {
    const msg = err.response?.data?.message || err.message;
    setStatus(id, 'failed');
    appendLog(id, `- Render error: ${msg}`);
    throw err;
  }
}

function simulateDeploy(id: string, provider: string, name: string) {
  const steps = [
    { d: 800,   msg: `[Demo] Initializing ${provider.toUpperCase()} environment...` },
    { d: 2500,  msg: '[Demo] Building container image...' },
    { d: 4500,  msg: '[Demo] Pushing to registry...' },
    { d: 6500,  msg: `[Demo] Deploying to ${provider.toUpperCase()}...` },
    { d: 8500,  msg: '[Demo] Configuring networking...' },
    { d: 10500, msg: '[Demo] Health checks passing -' },
  ];
  for (const s of steps) setTimeout(() => appendLog(id, s.msg), s.d);
  setTimeout(() => {
    setStatus(id, 'running', `https:
    appendLog(id, '[Demo] Deployment live! Add real credentials in Settings - Cloud to deploy for real.');
  }, 12000);
}

async function dispatch(id: string, provider: string, name: string, image: string, region: string, envVars: Record<string,string>, ports: number[], githubRepo?: string, branch?: string) {
  if (provider === 'podium') {
    
    try {
      const existing = getDb().prepare('SELECT config FROM cloud_deployments WHERE id=?').get(id) as any;
      const cfg = (() => { try { return JSON.parse(existing?.config || '{}'); } catch { return {}; } })();
      cfg.container_port = ports[0] || 80;
      cfg.branch = branch || 'main';
      cfg.env = envVars;
      getDb().prepare("UPDATE cloud_deployments SET config=? WHERE id=?").run(JSON.stringify(cfg), id);
      await axios.post(
        `http:
        {},
        { headers: { 'x-internal': 'podium-selfhosted' } }
      );
    } catch (err: any) {
      setStatus(id, 'failed');
      appendLog(id, `Self-hosted dispatch error: ${err.message}`);
    }
    return;
  }
  if (!ready(provider)) { simulateDeploy(id, provider, name); return; }
  if (provider === 'azure')       await deployAzure(id, name, image, region, envVars, ports);
  else if (provider === 'aws')    await deployAWS(id, name, image, region, envVars, ports);
  else if (provider === 'vercel') await deployVercel(id, name, image, region, envVars, githubRepo, branch);
  else if (provider === 'render') await deployRender(id, name, image, region, envVars, ports);
  else simulateDeploy(id, provider, name);
}

router.get('/', requireAuth, (_req, res) => {
  const deps = getDb().prepare('SELECT * FROM cloud_deployments ORDER BY created_at DESC').all() as any[];
  res.json(deps.map(d => ({ ...d, config: JSON.parse(d.config||'{}'), logs: JSON.parse(d.logs||'[]') })));
});

router.get('/providers', requireAuth, (_req, res) => {
  res.json([
    { id: 'azure',  label: 'Microsoft Azure',     icon: '🔷', configured: ready('azure'),
      regions: ['eastus','westus2','westeurope','southeastasia','australiaeast','brazilsouth'],
      hint: 'Uses Azure Container Instances (ACI) — works with Student subscription' },
    { id: 'aws',    label: 'Amazon Web Services', icon: '☁️', configured: ready('aws'),
      regions: ['us-east-1','us-west-2','eu-west-1','ap-southeast-1','ap-northeast-1'],
      hint: 'Uses AWS App Runner — serverless container deployment' },
    { id: 'vercel', label: 'Vercel',              icon: '-', configured: ready('vercel'),
      regions: ['iad1','sfo1','lhr1','sin1','hnd1'],
      hint: 'Deploy containers and static sites — free tier available' },
    { id: 'render', label: 'Render',              icon: '🟣', configured: ready('render'),
      regions: ['oregon','ohio','virginia','frankfurt','singapore'],
      hint: 'Deploy Docker containers — free tier available, no credit card needed' },
    { id: 'podium', label: 'Podium (Self-Hosted)', icon: '🏠', configured: !!(get('selfhosted_domain') || get('cloudflare_tunnel_domain')),
      regions: ['local'],
      hint: 'Deploy directly to this machine — get a public URL via Cloudflare Tunnel' },
  ]);
});

router.get('/:id', requireAuth, (req, res) => {
  const d = getDb().prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!d) return res.status(404).json({ error: 'Not found' });
  return res.json({ ...d, config: JSON.parse(d.config||'{}'), logs: JSON.parse(d.logs||'[]') });
});

router.post('/deploy', requireAuth, requireRole('admin', 'developer'), async (req, res: Response) => {
  const { provider, name, region, source_type, docker_image, github_repo, branch, config = {}, ports = [],
          resource_group, cpu, memory, framework, plan } = req.body;
  if (!provider || !name) return res.status(400).json({ error: 'provider and name required' });

  const image      = docker_image || 'nginx:latest';
  const srcType    = source_type || 'docker';
  const id         = uuidv4();
  const envVars    = typeof config === 'object' ? config as Record<string,string> : {};
  const portNums   = (ports as any[]).map(Number).filter(Boolean);

  
  const fullConfig = {
    ...envVars,
    ...(resource_group ? { resource_group } : {}),
    ...(cpu            ? { cpu }            : {}),
    ...(memory         ? { memory }         : {}),
    ...(framework      ? { framework }      : {}),
    ...(plan           ? { plan }           : {}),
    ...(github_repo    ? { github_repo }    : {}),
    ...(branch         ? { branch }         : {}),
  };

  getDb().prepare(`
    INSERT INTO cloud_deployments (id, provider, name, region, status, source_type, docker_image, repo_url, config, logs)
    VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)
  `).run(id, provider, name, region || 'eastus', srcType, image,
    github_repo || '',
    JSON.stringify(fullConfig),
    JSON.stringify([{ time: new Date().toISOString(), message: `Queued on ${provider.toUpperCase()}` }]));

  dispatch(id, provider, name, image, region, fullConfig, portNums, github_repo, branch).catch(() => {});

  const dep = getDb().prepare('SELECT * FROM cloud_deployments WHERE id=?').get(id) as any;
  return res.status(201).json({ ...dep, config: JSON.parse(dep.config), logs: JSON.parse(dep.logs) });
});

router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  getDb().prepare('DELETE FROM cloud_deployments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/redeploy', requireAuth, requireRole('admin', 'developer'), (req, res) => {
  const dep = getDb().prepare('SELECT * FROM cloud_deployments WHERE id=?').get(req.params.id) as any;
  if (!dep) return res.status(404).json({ error: 'Not found' });
  getDb().prepare("UPDATE cloud_deployments SET status='queued', logs='[]', updated_at=datetime('now') WHERE id=?").run(req.params.id);
  dispatch(req.params.id, dep.provider, dep.name, dep.docker_image || 'nginx:latest', dep.region, {}, []).catch(() => {});
  return res.json({ ok: true });
});

export default router;