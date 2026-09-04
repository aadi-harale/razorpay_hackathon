@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not exist .env.local (
  echo No local credentials yet. Run start.bat first.
  if /I not "%~1"=="/nopause" pause
  exit /b 1
)
echo.
echo RazorProcure local credentials
echo ------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\show-login.ps1"
if errorlevel 1 (
  if /I not "%~1"=="/nopause" pause
  exit /b 1
)
if /I not "%~1"=="/nopause" pause
