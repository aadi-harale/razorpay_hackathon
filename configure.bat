@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22+ is required. & pause & exit /b 1)
if not exist .env.local call npm run bootstrap
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\configure-secrets.ps1"
if errorlevel 1 (echo Configuration failed. & pause & exit /b 1)
echo.
echo Configuration saved only to .env.local. This file is git-ignored.
pause
