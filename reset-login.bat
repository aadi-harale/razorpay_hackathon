@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title RazorProcure Login Reset
where node >nul 2>nul || (echo Node.js 22+ is required. & pause & exit /b 1)
if not exist .env.local call npm run bootstrap
if exist .run\server.pid call stop.bat >nul 2>nul
call npm run auth:reset
if errorlevel 1 (echo Login reset failed. & pause & exit /b 1)
echo.
echo Login reset to the one local RazorProcure account.
call show-login.bat /nopause
echo.
echo Starting RazorProcure...
call start.bat
