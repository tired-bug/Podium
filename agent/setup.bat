@echo off
echo.
echo   ^<^< Podium Docker Agent - Windows Setup ^>^>
echo   =========================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   ERROR: Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo   OK  Node.js %NODE_VER%

echo.
echo   Checking Docker Desktop...
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   WARNING: Docker Desktop does not seem to be running.
    echo   Start Docker Desktop, then re-run this script or just "npm start".
) else (
    echo   OK  Docker Desktop is running
)

if not exist ".env" (
    echo.
    echo   Creating .env from .env.example...
    copy ".env.example" ".env" >nul
    echo   IMPORTANT: edit .env and set a real AGENT_TOKEN before starting.
    echo   Generate one with:
    echo     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    echo.
    pause
)

echo.
echo   Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 ( echo   FAILED: npm install & pause & exit /b 1 )

echo.
echo   ==========================================
echo   Setup complete. Starting the agent...
echo   (Leave this window open. Open a SECOND terminal
echo    and run: ngrok http 4500   to get a public URL.)
echo   ==========================================
echo.
call npm start
pause
