const { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let splashWindow = null;
let backendProcess = null;
let tray = null;

const BACKEND_PORT = 4000;
const isDev = !app.isPackaged;

// ─── Paths ───────────────────────────────────────────────────────────────────
function getBackendPath() {
  if (isDev) {
    return path.join(__dirname, '..', 'backend', 'dist', 'index.js');
  }
  return path.join(process.resourcesPath, 'app', 'backend', 'dist', 'index.js');
}

function getAppDataPath() {
  return path.join(app.getPath('userData'), 'podium-data');
}

// ─── Backend ─────────────────────────────────────────────────────────────────
function startBackend() {
  return new Promise((resolve, reject) => {
    const backendEntry = getBackendPath();
    const dataDir = getAppDataPath();

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const env = {
      ...process.env,
      PORT: String(BACKEND_PORT),
      NODE_ENV: 'production',
      PODIUM_DATA_DIR: dataDir,
      ELECTRON_RUN: '1',
    };

    // Load user .env from userData directory
    const envPath = path.join(app.getPath('userData'), '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim();
          env[k] = v;
        }
      }
    }

    backendProcess = spawn(process.execPath, [backendEntry], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    backendProcess.stdout.on('data', (d) => {
      if (isDev) console.log('[backend]', d.toString().trim());
    });
    backendProcess.stderr.on('data', (d) => {
      if (isDev) console.error('[backend:err]', d.toString().trim());
    });
    backendProcess.on('exit', (code) => {
      if (isDev) console.log('[backend] exited with code', code);
    });

    let attempts = 0;
    const check = () => {
      http.get(`http://localhost:${BACKEND_PORT}/api/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      attempts++;
      if (attempts > 60) reject(new Error('Backend failed to start within 30 seconds'));
      else setTimeout(check, 500);
    };
    setTimeout(check, 1000);
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

// ─── Splash ───────────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: { nodeIntegration: false },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
}

// ─── Main window ─────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0D1117',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('maximize-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('maximize-change', false);
  });

  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin' && !app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  let img;
  try {
    img = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    img = nativeImage.createEmpty();
  }
  tray = new Tray(img);
  tray.setToolTip('Podium — AIOps Platform');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Podium', click: () => { if (mainWindow) mainWindow.show(); else createMainWindow(); } },
    { type: 'separator' },
    { label: 'Quit Podium', click: () => { app.isQuiting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => {
    if (mainWindow) mainWindow.show();
    else createMainWindow();
  });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
app.on('ready', async () => {
  createSplash();
  createTray();

  try {
    await startBackend();
  } catch (err) {
    dialog.showErrorBox('Podium — Startup Error', `Failed to start backend service:\n\n${err.message}\n\nPlease check your installation and try again.`);
    app.quit();
    return;
  }

  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackend();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
  else mainWindow.show();
});

app.on('before-quit', () => {
  stopBackend();
});

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
