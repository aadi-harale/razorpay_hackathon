@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title RazorProcure Launcher

echo.
echo ==========================================================
echo   RAZORPROCURE  -  AI PROCUREMENT FOR RETAILERS
echo ==========================================================
echo.

where node >nul 2>nul || (echo [RazorProcure] Node.js 22+ is required. & pause & exit /b 1)
where npm >nul 2>nul || (echo [RazorProcure] npm was not found on PATH. & pause & exit /b 1)
node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)" || (echo [RazorProcure] Node.js 22+ is required. & pause & exit /b 1)

if not exist .env.local (
  echo [RazorProcure] .env.local missing. Creating a secure local environment template...
  call npm run bootstrap
  if errorlevel 1 goto :fail
)

echo [RazorProcure] Payment mode: account-free demo simulator. No external payment account is contacted.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\check-openrouter.ps1"
if errorlevel 1 echo [RazorProcure] WARNING: OpenRouter key is not configured. Invoice AI will be unavailable.

if not exist node_modules (
  echo [RazorProcure] Installing pinned dependencies...
  call npm ci
  if errorlevel 1 goto :fail
)

echo [RazorProcure] Synchronizing local authentication...
node scripts\ensure-local-auth.mjs
if errorlevel 1 goto :fail
call show-login.bat /nopause
echo.

if exist .run\server.pid call stop.bat >nul 2>nul

echo [RazorProcure] Removing stale Next.js build output...
if exist .next rmdir /s /q .next

echo [RazorProcure] Building a fresh production application...
call npm run build
if errorlevel 1 goto :fail

if not exist .next\BUILD_ID (
  echo [RazorProcure] ERROR: Production BUILD_ID was not created.
  goto :fail
)

powershell -NoProfile -Command "$css = Get-ChildItem -Path '.next\\static' -Recurse -Filter '*.css' -ErrorAction SilentlyContinue; if ($css.Count -gt 0) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo [RazorProcure] ERROR: No compiled CSS asset was found. Refusing to start an unstyled build.
  goto :fail
)

if not exist .run mkdir .run
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\start-server.ps1"
if errorlevel 1 goto :fail

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\wait-health.ps1"
if errorlevel 1 (
  echo [RazorProcure] Health/identity check failed. Review .run\server.log
  goto :failstop
)

set /p RAZORPROCURE_PORT=<.run\server.port
set "RAZORPROCURE_URL=http://localhost:%RAZORPROCURE_PORT%"
echo [RazorProcure] Starting at %RAZORPROCURE_URL%
start "" "%RAZORPROCURE_URL%"
echo.
echo [RazorProcure] READY
 echo   Fresh RazorProcure build verified. UI + APIs + ShadowFunnel + safe demo payments are online.
echo.
exit /b 0

:failstop
call stop.bat >nul 2>nul
:fail
echo.
echo [RazorProcure] Start failed. Review the error above or .run\server.log.
pause
exit /b 1
