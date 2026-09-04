@echo off
setlocal
cd /d "%~dp0"
echo ==========================================================
echo   RAZORPROCURE RELEASE VERIFICATION
echo ==========================================================
if not exist node_modules (echo Installing pinned dependencies... & call npm ci & if errorlevel 1 goto :fail)
call npm run secret-scan || goto :fail
call npm run typecheck || goto :fail
call npm run lint || goto :fail
call npm run test || goto :fail
call npm run build || goto :fail
echo.
echo ALL RELEASE GATES PASSED.
exit /b 0
:fail
echo.
echo RELEASE VERIFICATION FAILED.
pause
exit /b 1
