import {
  Framework, Runtime, PackageManager, DetectionResult, DeploymentType,
  MonorepoService, RepoContext,
} from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasFile(ctx: RepoContext, ...paths: string[]): boolean {
  const set = new Set(ctx.files.map(f => f.path.toLowerCase()));
  return paths.some(p => set.has(p.toLowerCase()));
}

function getContent(ctx: RepoContext, ...paths: string[]): string | null {
  for (const p of paths) {
    const key = Object.keys(ctx.configFiles).find(k => k.toLowerCase() === p.toLowerCase());
    if (key) return ctx.configFiles[key];
  }
  return null;
}

function parseJson(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function extractEnvVarNames(ctx: RepoContext): string[] {
  const names = new Set<string>();
  const envRegex = /(?:process\.env\.|os\.environ(?:\.get)?\(|getenv\(|ENV\[["']|config\()["']?([A-Z][A-Z0-9_]{2,50})["']?/g;
  for (const content of Object.values(ctx.configFiles)) {
    let m: RegExpExecArray | null;
    while ((m = envRegex.exec(content)) !== null) names.add(m[1]);
  }
  // Common required vars per framework
  return Array.from(names).slice(0, 30);
}

function detectPackageManager(ctx: RepoContext): PackageManager {
  if (hasFile(ctx, 'bun.lockb')) return 'bun';
  if (hasFile(ctx, 'pnpm-lock.yaml')) return 'pnpm';
  if (hasFile(ctx, 'yarn.lock')) return 'yarn';
  if (hasFile(ctx, 'package-lock.json')) return 'npm';
  if (hasFile(ctx, 'Pipfile', 'Pipfile.lock')) return 'pipenv';
  if (hasFile(ctx, 'poetry.lock', 'pyproject.toml')) {
    const pyproject = getContent(ctx, 'pyproject.toml');
    if (pyproject?.includes('[tool.poetry]')) return 'poetry';
  }
  if (hasFile(ctx, 'requirements.txt')) return 'pip';
  if (hasFile(ctx, 'Cargo.toml')) return 'cargo';
  if (hasFile(ctx, 'go.mod')) return 'unknown'; // go get
  if (hasFile(ctx, 'pom.xml')) return 'maven';
  if (hasFile(ctx, 'build.gradle', 'build.gradle.kts')) return 'gradle';
  if (hasFile(ctx, 'composer.json')) return 'composer';
  if (hasFile(ctx, 'package.json')) return 'npm';
  return 'unknown';
}

function detectRuntimeVersion(ctx: RepoContext, runtime: Runtime): string | undefined {
  if (runtime === 'node') {
    const nvmrc = getContent(ctx, '.nvmrc', '.node-version');
    if (nvmrc) return nvmrc.trim().replace(/^v/, '');
    const pkg = parseJson(getContent(ctx, 'package.json'));
    const engines = pkg?.engines?.node;
    if (engines) return engines.replace(/[^0-9.]/g, '') || undefined;
  }
  if (runtime === 'python') {
    const pv = getContent(ctx, '.python-version');
    if (pv) return pv.trim();
    const pyproject = getContent(ctx, 'pyproject.toml');
    const m = pyproject?.match(/python_requires\s*=\s*["']([>=<~^!0-9.]+)["']/);
    if (m) return m[1];
  }
  return undefined;
}

// ─── Provider-native config detection (priority 1) ───────────────────────────

function detectFromVercelJson(ctx: RepoContext): Partial<DetectionResult> | null {
  const raw = getContent(ctx, 'vercel.json');
  if (!raw) return null;
  const cfg = parseJson(raw);
  if (!cfg) return null;
  return {
    buildCommand: cfg.buildCommand || cfg.scripts?.build,
    outputDirectory: cfg.outputDirectory || cfg.distDir,
    rootDirectory: cfg.rootDirectory,
    framework: (cfg.framework || 'unknown') as Framework,
    confidence: 0.95,
    detectionPath: 'vercel.json',
    reasoning: 'vercel.json detected — using its configuration directly',
  };
}

function detectFromRenderYaml(ctx: RepoContext): Partial<DetectionResult> | null {
  const raw = getContent(ctx, 'render.yaml', 'render.yml');
  if (!raw) return null;
  const buildMatch = raw.match(/buildCommand:\s*(.+)/);
  const startMatch = raw.match(/startCommand:\s*(.+)/);
  const runtimeMatch = raw.match(/(?:env|runtime):\s*(node|python|go|rust|docker)/i);
  return {
    buildCommand: buildMatch?.[1]?.trim(),
    startCommand: startMatch?.[1]?.trim(),
    runtime: (runtimeMatch?.[1]?.toLowerCase() as Runtime) || undefined,
    confidence: 0.95,
    detectionPath: 'render.yaml',
    reasoning: 'render.yaml detected — using its build/start commands',
  };
}

function detectFromRailwayConfig(ctx: RepoContext): Partial<DetectionResult> | null {
  const raw = getContent(ctx, 'railway.json') || getContent(ctx, 'railway.toml');
  if (!raw) return null;
  const buildMatch = raw.match(/"buildCommand"\s*:\s*"([^"]+)"/);
  const startMatch = raw.match(/"startCommand"\s*:\s*"([^"]+)"/);
  // toml style
  const buildMatchT = raw.match(/build_command\s*=\s*"([^"]+)"/);
  const startMatchT = raw.match(/start_command\s*=\s*"([^"]+)"/);
  return {
    buildCommand: buildMatch?.[1] || buildMatchT?.[1],
    startCommand: startMatch?.[1] || startMatchT?.[1],
    confidence: 0.92,
    detectionPath: 'railway.json/toml',
    reasoning: 'railway.json/toml detected — using its commands',
  };
}

function detectFromProcfile(ctx: RepoContext): Partial<DetectionResult> | null {
  const raw = getContent(ctx, 'Procfile');
  if (!raw) return null;
  const web = raw.match(/^web:\s*(.+)/m);
  const worker = raw.match(/^worker:\s*(.+)/m);
  return {
    startCommand: web?.[1]?.trim(),
    hasBackgroundWorkers: !!worker,
    confidence: 0.88,
    detectionPath: 'Procfile',
    reasoning: `Procfile detected — web: ${web?.[1]?.trim() || 'not set'}`,
  };
}

function detectFromDockerfile(ctx: RepoContext): Partial<DetectionResult> | null {
  const raw = getContent(ctx, 'Dockerfile', 'dockerfile');
  if (!raw) return null;
  const exposeMatch = raw.match(/EXPOSE\s+(\d+)/i);
  const port = exposeMatch ? parseInt(exposeMatch[1]) : 3000;
  return {
    framework: 'docker',
    runtime: 'docker',
    deploymentType: 'docker',
    hasDockerfile: true,
    exposedPort: port,
    confidence: 0.90,
    detectionPath: 'Dockerfile',
    reasoning: `Dockerfile detected, exposes port ${port}`,
  };
}

// ─── Framework detection from package.json (priority 3) ─────────────────────

function detectFromPackageJson(ctx: RepoContext): Partial<DetectionResult> | null {
  const raw = getContent(ctx, 'package.json');
  if (!raw) return null;
  const pkg = parseJson(raw);
  if (!pkg) return null;

  const deps = {
    ...pkg.dependencies || {},
    ...pkg.devDependencies || {},
    ...pkg.peerDependencies || {},
  };
  const scripts = pkg.scripts || {};

  let framework: Framework = 'node';
  let deploymentType: DeploymentType = 'api';
  let buildCommand: string | undefined;
  let startCommand: string | undefined;
  let outputDirectory: string | undefined;
  let exposedPort = 3000;
  let isSSR = false;
  let confidence = 0.80;
  let reasoning = '';

  // ── Next.js ──────────────────────────────────────────────────────────────
  if (deps['next']) {
    framework = 'nextjs';
    deploymentType = 'fullstack';
    isSSR = true;
    buildCommand = scripts.build || 'next build';
    startCommand = scripts.start || 'next start';
    outputDirectory = '.next';
    exposedPort = 3000;
    reasoning = 'Next.js detected via package.json dependency';
    confidence = 0.93;
  }
  // ── Nuxt ─────────────────────────────────────────────────────────────────
  else if (deps['nuxt'] || deps['nuxt3'] || deps['@nuxt/core']) {
    framework = 'nuxt';
    deploymentType = 'fullstack';
    isSSR = true;
    buildCommand = scripts.build || 'nuxt build';
    startCommand = scripts.start || 'node .output/server/index.mjs';
    outputDirectory = '.output';
    exposedPort = 3000;
    reasoning = 'Nuxt detected via package.json dependency';
    confidence = 0.91;
  }
  // ── SvelteKit ────────────────────────────────────────────────────────────
  else if (deps['@sveltejs/kit']) {
    framework = 'sveltekit';
    deploymentType = 'fullstack';
    isSSR = true;
    buildCommand = scripts.build || 'vite build';
    startCommand = scripts.start || 'node build';
    outputDirectory = 'build';
    exposedPort = 3000;
    reasoning = 'SvelteKit detected via package.json dependency';
    confidence = 0.91;
  }
  // ── Svelte (SPA) ─────────────────────────────────────────────────────────
  else if (deps['svelte'] && !deps['@sveltejs/kit']) {
    framework = 'svelte';
    deploymentType = 'static';
    buildCommand = scripts.build || 'vite build';
    startCommand = undefined;
    outputDirectory = 'public';
    reasoning = 'Svelte SPA detected via package.json dependency';
    confidence = 0.85;
  }
  // ── Vite (React/Vue/etc.) ─────────────────────────────────────────────────
  else if (deps['vite'] || deps['@vitejs/plugin-react'] || deps['@vitejs/plugin-vue']) {
    if (deps['react'] || deps['react-dom']) {
      framework = 'vite'; // Vite + React (not CRA)
      deploymentType = 'static';
      buildCommand = scripts.build || 'vite build';
      outputDirectory = 'dist';
      reasoning = 'Vite + React SPA detected via package.json';
      confidence = 0.88;
    } else if (deps['vue']) {
      framework = 'vue';
      deploymentType = 'static';
      buildCommand = scripts.build || 'vite build';
      outputDirectory = 'dist';
      reasoning = 'Vite + Vue SPA detected via package.json';
      confidence = 0.88;
    } else {
      framework = 'vite';
      deploymentType = 'static';
      buildCommand = scripts.build || 'vite build';
      outputDirectory = 'dist';
      reasoning = 'Vite detected via package.json';
      confidence = 0.82;
    }
  }
  // ── CRA React ─────────────────────────────────────────────────────────────
  else if (deps['react-scripts']) {
    framework = 'react';
    deploymentType = 'static';
    buildCommand = scripts.build || 'react-scripts build';
    outputDirectory = 'build';
    reasoning = 'Create React App (react-scripts) detected via package.json';
    confidence = 0.92;
  }
  // ── Vue CLI ───────────────────────────────────────────────────────────────
  else if (deps['@vue/cli-service'] || deps['vue']) {
    framework = 'vue';
    deploymentType = 'static';
    buildCommand = scripts.build || 'vue-cli-service build';
    outputDirectory = 'dist';
    reasoning = 'Vue CLI detected via package.json';
    confidence = 0.85;
  }
  // ── Angular ───────────────────────────────────────────────────────────────
  else if (deps['@angular/core']) {
    framework = 'angular';
    deploymentType = 'static';
    buildCommand = scripts.build || 'ng build --configuration production';
    outputDirectory = `dist/${pkg.name || 'app'}`;
    reasoning = 'Angular detected via package.json dependency';
    confidence = 0.90;
  }
  // ── NestJS ────────────────────────────────────────────────────────────────
  else if (deps['@nestjs/core']) {
    framework = 'nestjs';
    deploymentType = 'api';
    buildCommand = scripts.build || 'nest build';
    startCommand = scripts['start:prod'] || 'node dist/main';
    outputDirectory = 'dist';
    exposedPort = 3000;
    reasoning = 'NestJS detected via package.json dependency';
    confidence = 0.90;
  }
  // ── Fastify ───────────────────────────────────────────────────────────────
  else if (deps['fastify']) {
    framework = 'fastify';
    deploymentType = 'api';
    startCommand = scripts.start || 'node index.js';
    exposedPort = 3000;
    reasoning = 'Fastify detected via package.json dependency';
    confidence = 0.85;
  }
  // ── Express/generic Node ──────────────────────────────────────────────────
  else if (deps['express']) {
    framework = 'express';
    deploymentType = 'api';
    startCommand = scripts.start || 'node index.js';
    exposedPort = 3000;
    reasoning = 'Express detected via package.json dependency';
    confidence = 0.82;
  }
  // ── Plain Node ────────────────────────────────────────────────────────────
  else if (pkg.main || scripts.start) {
    framework = 'node';
    deploymentType = 'api';
    startCommand = scripts.start || (pkg.main ? `node ${pkg.main}` : 'node index.js');
    exposedPort = 3000;
    reasoning = 'Generic Node.js project detected';
    confidence = 0.70;
  }

  const pm = detectPackageManager(ctx);
  const installCmd =
    pm === 'yarn' ? 'yarn install' :
    pm === 'pnpm' ? 'pnpm install' :
    pm === 'bun'  ? 'bun install' :
    'npm install';

  // Merge buildCommand from scripts if not set
  if (!buildCommand && scripts.build) buildCommand = `${pm === 'npm' ? 'npm run' : pm === 'yarn' ? 'yarn' : pm + ' run'} build`;

  return {
    framework,
    runtime: 'node',
    packageManager: pm,
    deploymentType,
    buildCommand,
    installCommand: installCmd,
    startCommand: startCommand || undefined,
    outputDirectory: outputDirectory || 'dist',
    exposedPort,
    isSSR,
    confidence,
    reasoning,
    detectionPath: 'package.json',
  };
}

// ─── Python detection ─────────────────────────────────────────────────────────

function detectPython(ctx: RepoContext): Partial<DetectionResult> | null {
  const hasPy =
    hasFile(ctx, 'requirements.txt') ||
    hasFile(ctx, 'pyproject.toml') ||
    hasFile(ctx, 'setup.py') ||
    hasFile(ctx, 'Pipfile') ||
    ctx.files.some(f => f.path.endsWith('.py') && !f.path.includes('/'));

  if (!hasPy) return null;

  const req = getContent(ctx, 'requirements.txt') || '';
  const pyproject = getContent(ctx, 'pyproject.toml') || '';
  const pm = detectPackageManager(ctx);

  let framework: Framework = 'python';
  let startCommand: string | undefined;
  let buildCommand: string | undefined;
  let installCommand =
    pm === 'poetry' ? 'poetry install --no-dev' :
    pm === 'pipenv' ? 'pipenv install --deploy' :
    'pip install -r requirements.txt';
  let confidence = 0.78;
  let reasoning = 'Python project detected';

  if (/fastapi/i.test(req) || /fastapi/i.test(pyproject)) {
    framework = 'fastapi';
    startCommand = 'uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}';
    reasoning = 'FastAPI detected via requirements.txt';
    confidence = 0.90;
  } else if (/django/i.test(req) || /django/i.test(pyproject)) {
    framework = 'django';
    startCommand = 'python manage.py runserver 0.0.0.0:${PORT:-8000}';
    buildCommand = 'python manage.py collectstatic --no-input';
    reasoning = 'Django detected via requirements.txt';
    confidence = 0.90;
  } else if (/flask/i.test(req) || /flask/i.test(pyproject)) {
    framework = 'flask';
    startCommand = 'gunicorn app:app --bind 0.0.0.0:${PORT:-5000}';
    reasoning = 'Flask detected via requirements.txt';
    confidence = 0.88;
  } else {
    // Check for common entry points
    const hasMain = ctx.files.some(f => f.path === 'main.py' || f.path === 'app.py' || f.path === 'server.py');
    if (hasMain) {
      const entry = ctx.files.find(f => ['main.py', 'app.py', 'server.py'].includes(f.path));
      startCommand = `python ${entry?.path || 'main.py'}`;
    }
  }

  return {
    framework,
    runtime: 'python',
    packageManager: pm !== 'unknown' ? pm : 'pip',
    deploymentType: 'api',
    installCommand,
    buildCommand,
    startCommand,
    exposedPort: 8000,
    confidence,
    reasoning,
    detectionPath: 'requirements.txt/pyproject.toml',
  };
}

// ─── Go detection ─────────────────────────────────────────────────────────────

function detectGo(ctx: RepoContext): Partial<DetectionResult> | null {
  if (!hasFile(ctx, 'go.mod')) return null;
  const goMod = getContent(ctx, 'go.mod') || '';
  const moduleName = goMod.match(/^module\s+(.+)/m)?.[1]?.trim() || 'app';
  const mainFiles = ctx.files.filter(f => f.path.endsWith('.go') && (f.path.startsWith('cmd/') || f.path === 'main.go'));
  const entry = mainFiles.length > 0 ? (mainFiles[0].path.includes('/') ? `./${mainFiles[0].path.split('/')[0]}/...` : './...') : './...';

  return {
    framework: 'go',
    runtime: 'go',
    packageManager: 'unknown',
    deploymentType: 'api',
    buildCommand: `go build -o server ${entry}`,
    installCommand: 'go mod download',
    startCommand: './server',
    exposedPort: 8080,
    confidence: 0.85,
    reasoning: `Go module detected: ${moduleName}`,
    detectionPath: 'go.mod',
  };
}

// ─── Rust detection ───────────────────────────────────────────────────────────

function detectRust(ctx: RepoContext): Partial<DetectionResult> | null {
  if (!hasFile(ctx, 'Cargo.toml')) return null;
  const cargo = parseJson(getContent(ctx, 'Cargo.toml'));
  const name = cargo?.package?.name || 'server';
  return {
    framework: 'rust',
    runtime: 'rust',
    packageManager: 'cargo',
    deploymentType: 'api',
    buildCommand: 'cargo build --release',
    installCommand: '',
    startCommand: `./target/release/${name}`,
    exposedPort: 8080,
    confidence: 0.85,
    reasoning: `Rust Cargo project: ${name}`,
    detectionPath: 'Cargo.toml',
  };
}

// ─── Java / Spring Boot detection ────────────────────────────────────────────

function detectJava(ctx: RepoContext): Partial<DetectionResult> | null {
  if (!hasFile(ctx, 'pom.xml') && !hasFile(ctx, 'build.gradle', 'build.gradle.kts')) return null;
  const isMaven = hasFile(ctx, 'pom.xml');
  const pm = isMaven ? 'maven' : 'gradle';
  const isSpring = (() => {
    const pom = getContent(ctx, 'pom.xml') || '';
    const gradle = getContent(ctx, 'build.gradle', 'build.gradle.kts') || '';
    return /spring-boot/i.test(pom) || /spring-boot/i.test(gradle);
  })();

  return {
    framework: isSpring ? 'spring-boot' : 'java',
    runtime: 'java',
    packageManager: pm,
    deploymentType: 'api',
    buildCommand: isMaven ? 'mvn package -DskipTests' : './gradlew bootJar',
    installCommand: isMaven ? 'mvn dependency:resolve' : './gradlew dependencies',
    startCommand: 'java -jar target/*.jar',
    exposedPort: 8080,
    confidence: isSpring ? 0.88 : 0.80,
    reasoning: `${isSpring ? 'Spring Boot' : 'Java'} project (${pm}) detected`,
    detectionPath: isMaven ? 'pom.xml' : 'build.gradle',
  };
}

// ─── PHP / Laravel detection ─────────────────────────────────────────────────

function detectPhp(ctx: RepoContext): Partial<DetectionResult> | null {
  if (!hasFile(ctx, 'composer.json')) return null;
  const composer = parseJson(getContent(ctx, 'composer.json'));
  const isLaravel = !!(composer?.require?.['laravel/framework'] || composer?.require?.['laravel/lumen-framework']);
  return {
    framework: isLaravel ? 'laravel' : 'php',
    runtime: 'php',
    packageManager: 'composer',
    deploymentType: isLaravel ? 'fullstack' : 'api',
    buildCommand: isLaravel ? 'php artisan config:cache && php artisan route:cache' : undefined,
    installCommand: 'composer install --no-dev --optimize-autoloader',
    startCommand: isLaravel ? 'php artisan serve --host=0.0.0.0 --port=${PORT:-8000}' : 'php -S 0.0.0.0:8000 -t public',
    exposedPort: 8000,
    confidence: isLaravel ? 0.88 : 0.78,
    reasoning: `${isLaravel ? 'Laravel' : 'PHP'} project detected via composer.json`,
    detectionPath: 'composer.json',
  };
}

// ─── .NET detection ───────────────────────────────────────────────────────────

function detectDotnet(ctx: RepoContext): Partial<DetectionResult> | null {
  const hasCsproj = ctx.files.some(f => f.path.endsWith('.csproj'));
  if (!hasCsproj) return null;
  const csproj = ctx.files.find(f => f.path.endsWith('.csproj'));
  return {
    framework: 'dotnet',
    runtime: 'dotnet',
    packageManager: 'dotnet',
    deploymentType: 'api',
    buildCommand: 'dotnet publish -c Release -o out',
    installCommand: 'dotnet restore',
    startCommand: 'dotnet out/*.dll',
    exposedPort: 5000,
    confidence: 0.83,
    reasoning: `.NET project detected: ${csproj?.path}`,
    detectionPath: '.csproj',
  };
}

// ─── Static site detection ────────────────────────────────────────────────────

function detectStatic(ctx: RepoContext): Partial<DetectionResult> | null {
  const hasIndex = hasFile(ctx, 'index.html');
  const hasPublic = ctx.files.some(f => f.path.startsWith('public/'));
  if (!hasIndex && !hasPublic) return null;
  return {
    framework: 'static',
    runtime: 'static',
    packageManager: 'unknown',
    deploymentType: 'static',
    buildCommand: undefined,
    installCommand: '',
    startCommand: undefined,
    outputDirectory: hasPublic ? 'public' : '.',
    exposedPort: 80,
    confidence: 0.70,
    reasoning: 'Static HTML site detected (index.html present)',
    detectionPath: 'index.html',
  };
}

// ─── Monorepo detection ───────────────────────────────────────────────────────

function detectMonorepo(ctx: RepoContext): { isMonorepo: boolean; services: MonorepoService[] } {
  const hasWorkspaces =
    hasFile(ctx, 'turbo.json') ||
    hasFile(ctx, 'nx.json') ||
    hasFile(ctx, 'lerna.json') ||
    hasFile(ctx, 'pnpm-workspace.yaml');

  if (!hasWorkspaces) {
    // Check for manual monorepo structure: packages/ or apps/ directories with own package.json
    const subPkgs = ctx.files.filter(f =>
      /^(packages|apps|services)\/[^/]+\/package\.json$/.test(f.path)
    );
    if (subPkgs.length > 1) {
      const services: MonorepoService[] = subPkgs.map(f => {
        const dir = f.path.split('/').slice(0, 2).join('/');
        const name = f.path.split('/')[1];
        const subCtx: RepoContext = {
          ...ctx,
          files: ctx.files.filter(sf => sf.path.startsWith(dir + '/')).map(sf => ({ ...sf, path: sf.path.slice(dir.length + 1) })),
          configFiles: Object.fromEntries(
            Object.entries(ctx.configFiles)
              .filter(([k]) => k.startsWith(dir + '/'))
              .map(([k, v]) => [k.slice(dir.length + 1), v])
          ),
        };
        const inner = runDetectors(subCtx);
        return { name, path: dir, framework: inner.framework, runtime: inner.runtime };
      });
      return { isMonorepo: true, services };
    }
    return { isMonorepo: false, services: [] };
  }

  const services: MonorepoService[] = ctx.files
    .filter(f => /^(packages|apps|services)\/[^/]+\/package\.json$/.test(f.path))
    .slice(0, 10)
    .map(f => {
      const dir = f.path.split('/').slice(0, 2).join('/');
      const name = f.path.split('/')[1];
      const subCtx: RepoContext = {
        ...ctx,
        files: ctx.files.filter(sf => sf.path.startsWith(dir + '/')).map(sf => ({ ...sf, path: sf.path.slice(dir.length + 1) })),
        configFiles: Object.fromEntries(
          Object.entries(ctx.configFiles)
            .filter(([k]) => k.startsWith(dir + '/'))
            .map(([k, v]) => [k.slice(dir.length + 1), v])
        ),
      };
      const inner = runDetectors(subCtx);
      return { name, path: dir, framework: inner.framework, runtime: inner.runtime };
    });

  return { isMonorepo: true, services };
}

// ─── Merge helper ─────────────────────────────────────────────────────────────

function merge(base: Partial<DetectionResult>, override: Partial<DetectionResult>): Partial<DetectionResult> {
  const result: any = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v !== undefined && v !== null) result[k] = v;
  }
  return result;
}

// ─── Main detector (priority chain) ──────────────────────────────────────────

function runDetectors(ctx: RepoContext): DetectionResult {
  let partial: Partial<DetectionResult> = {};

  // Priority 1: provider config files
  const vercel = detectFromVercelJson(ctx);
  const render = detectFromRenderYaml(ctx);
  const railway = detectFromRailwayConfig(ctx);
  const procfile = detectFromProcfile(ctx);

  // Priority 2: Dockerfile
  const docker = detectFromDockerfile(ctx);

  // Priority 3: project manifests
  const pkgJson = detectFromPackageJson(ctx);
  const python = detectPython(ctx);
  const go = detectGo(ctx);
  const rust = detectRust(ctx);
  const java = detectJava(ctx);
  const php = detectPhp(ctx);
  const dotnet = detectDotnet(ctx);
  const staticSite = detectStatic(ctx);

  // Resolve by priority (highest confidence first, but provider configs win)
  const manifestResult = pkgJson || python || go || rust || java || php || dotnet || staticSite;

  if (docker && !pkgJson && !python && !go && !rust && !java && !php && !dotnet) {
    // Pure Docker project
    partial = docker;
  } else if (manifestResult) {
    partial = manifestResult;
    // Provider configs enrich but don't replace framework detection
    if (vercel) partial = merge(partial, { buildCommand: vercel.buildCommand, outputDirectory: vercel.outputDirectory, rootDirectory: vercel.rootDirectory });
    if (render) partial = merge(partial, { buildCommand: render.buildCommand, startCommand: render.startCommand, runtime: render.runtime as Runtime });
    if (railway) partial = merge(partial, { buildCommand: railway.buildCommand, startCommand: railway.startCommand });
    if (procfile && !partial.startCommand) partial = merge(partial, { startCommand: procfile.startCommand });
    if (docker) partial = merge(partial, { hasDockerfile: true });
  } else if (docker) {
    partial = docker;
  } else {
    partial = {
      framework: 'unknown',
      runtime: 'unknown',
      packageManager: 'unknown',
      deploymentType: 'api',
      confidence: 0.30,
      reasoning: 'Could not detect framework — manual configuration required',
      detectionPath: 'inference',
    };
  }

  // Extra signals
  const { isMonorepo, services } = detectMonorepo(ctx);
  const envVarNames = extractEnvVarNames(ctx);
  const runtimeVersion = detectRuntimeVersion(ctx, (partial.runtime || 'unknown') as Runtime);

  // Database/Redis detection from env var names and deps
  const allContent = Object.values(ctx.configFiles).join('\n');
  const usesDatabase =
    envVarNames.some(n => /DATABASE|POSTGRES|MYSQL|MONGO|REDIS|SQLITE|DB_URL|DATABASE_URL/i.test(n)) ||
    /pg|mysql|mongoose|prisma|sequelize|knex|drizzle/i.test(allContent);
  const usesRedis =
    envVarNames.some(n => /REDIS/i.test(n)) ||
    /redis|ioredis|bull|bullmq/i.test(allContent);
  const hasBackgroundWorkers =
    partial.hasBackgroundWorkers || /worker|queue|bull|celery|sidekiq/i.test(allContent);
  const hasScheduledJobs =
    /cron|schedule|agenda|node-cron/i.test(allContent);

  // Health check detection
  let healthCheckPath: string | undefined;
  if (/\/health/i.test(allContent)) healthCheckPath = '/health';
  else if (/\/api\/health/i.test(allContent)) healthCheckPath = '/api/health';
  else if (/\/ping/i.test(allContent)) healthCheckPath = '/ping';

  return {
    framework: partial.framework || 'unknown',
    runtime: partial.runtime || 'unknown',
    packageManager: partial.packageManager || 'unknown',
    runtimeVersion,
    buildCommand: partial.buildCommand,
    installCommand: partial.installCommand || '',
    startCommand: partial.startCommand,
    outputDirectory: partial.outputDirectory || 'dist',
    rootDirectory: partial.rootDirectory || '.',
    exposedPort: partial.exposedPort || 3000,
    deploymentType: partial.deploymentType || 'api',
    isMonorepo,
    monorepoServices: services.length ? services : undefined,
    hasDockerfile: hasFile(ctx, 'Dockerfile', 'dockerfile'),
    hasDockerCompose: hasFile(ctx, 'docker-compose.yml', 'docker-compose.yaml'),
    hasProcfile: hasFile(ctx, 'Procfile'),
    envVarNames: usesDatabase && !envVarNames.includes('DATABASE_URL') ? ['DATABASE_URL', ...envVarNames] : envVarNames,
    healthCheckPath,
    usesDatabase,
    usesRedis,
    hasBackgroundWorkers: !!hasBackgroundWorkers,
    hasScheduledJobs,
    isSSR: partial.isSSR || false,
    confidence: partial.confidence || 0.50,
    reasoning: partial.reasoning || 'Unknown',
    detectionPath: partial.detectionPath || 'inference',
  };
}

// ─── Exported class ───────────────────────────────────────────────────────────

export class FrameworkDetector {
  detect(ctx: RepoContext): DetectionResult {
    return runDetectors(ctx);
  }
}
