@echo off
echo.
echo   ^<^< PODIUM v4.0 - Windows Setup ^>^>
echo   ====================================
echo.

:: Check Node
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   ERROR: Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo   OK  Node.js %NODE_VER%

echo.
echo   [1/3] Backend dependencies...
cd backend
call npm install --legacy-peer-deps
if %ERRORLEVEL% NEQ 0 ( echo   FAILED: backend install & cd .. & pause & exit /b 1 )
cd ..
echo   OK  Backend ready

echo.
echo   [2/3] Frontend dependencies + build...
cd frontend
call npm install --legacy-peer-deps
if %ERRORLEVEL% NEQ 0 ( echo   FAILED: frontend install & cd .. & pause & exit /b 1 )
call npm run build
if %ERRORLEVEL% NEQ 0 ( echo   FAILED: frontend build & cd .. & pause & exit /b 1 )
cd ..
echo   OK  Frontend built

echo.
echo   [3/3] Electron...
call npm install
if %ERRORLEVEL% NEQ 0 ( echo   FAILED: root install & pause & exit /b 1 )
echo   OK  Electron ready

:: Create .env
if not exist "backend\.env" (
    copy ".env.example" "backend\.env" >nul
    echo   OK  Created backend\.env  ^(edit JWT_SECRET + GROQ_API_KEY^)
) else (
    echo   OK  backend\.env exists
)

echo.
echo   ==========================================
echo   Setup complete!
echo.
echo   Next:
echo     1. Edit backend\.env  -  set JWT_SECRET + GROQ_API_KEY
echo     2. npm run dev         -  dev server in browser
echo     3. npm run dist:win    -  build .exe installer
echo.
pause
