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
powershell -NoProfile -Command "$p='.env.local'; $email=((Get-Content $p | Where-Object { $_ -match '^DEMO_EMAIL=' } | Select-Object -First 1) -replace '^DEMO_EMAIL=','').Trim('"'); $pw=((Get-Content $p | Where-Object { $_ -match '^DEMO_PASSWORD=' } | Select-Object -First 1) -replace '^DEMO_PASSWORD=','').Trim('"'); Write-Host ('Email: ' + $email); Write-Host ('Password: ' + $pw)"
if /I not "%~1"=="/nopause" pause
