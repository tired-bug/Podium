# Podium v4.0 — Windows Setup Script
# Run from the podium\ root directory in PowerShell
# Usage: .\setup.ps1

Write-Host ""
Write-Host "  ⚡ PODIUM v4.0 — Windows Setup" -ForegroundColor Cyan
Write-Host "  ================================" -ForegroundColor Cyan
Write-Host ""

# ── Check Node.js ──────────────────────────────────────────────────────────────
try {
    $nodeVersion = node --version 2>&1
    Write-Host "  ✓ Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js not found. Install from https://nodejs.org (v18+)" -ForegroundColor Red
    exit 1
}

# ── Step 1: Backend ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [1/3] Installing backend dependencies..." -ForegroundColor Yellow

Set-Location backend
npm install --legacy-peer-deps
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Backend npm install failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Write-Host "  ✓ Backend dependencies installed" -ForegroundColor Green
Set-Location ..

# ── Step 2: Frontend ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [2/3] Installing frontend dependencies..." -ForegroundColor Yellow

Set-Location frontend
npm install --legacy-peer-deps
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Frontend npm install failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Write-Host "  Building frontend..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Frontend build failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Write-Host "  ✓ Frontend built" -ForegroundColor Green
Set-Location ..

# ── Step 3: Root (Electron) ────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [3/3] Installing Electron..." -ForegroundColor Yellow

npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Root npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Electron installed" -ForegroundColor Green

# ── Step 4: .env ───────────────────────────────────────────────────────────────
if (-Not (Test-Path "backend\.env")) {
    Copy-Item ".env.example" "backend\.env"
    Write-Host ""
    Write-Host "  ✓ Created backend\.env from .env.example" -ForegroundColor Green
    Write-Host "  ⚠  Edit backend\.env and set JWT_SECRET and GROQ_API_KEY" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ backend\.env already exists" -ForegroundColor Green
}

# ── Done ───────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✓ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Edit backend\.env  →  set JWT_SECRET + GROQ_API_KEY" -ForegroundColor Gray
Write-Host "    2. npm run dev        →  start dev server (browser)" -ForegroundColor Gray
Write-Host "    3. npm run dist:win   →  build .exe installer" -ForegroundColor Gray
Write-Host ""
