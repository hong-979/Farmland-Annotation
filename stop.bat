@echo off
setlocal

cd /d "%~dp0"

if not exist ".codex-logs\service.pid" (
  echo [stop] no pid file
  exit /b 0
)

set /p SERVICE_PID=<".codex-logs\service.pid"

if "%SERVICE_PID%"=="" (
  echo [stop] pid file empty
  del /q ".codex-logs\service.pid" >nul 2>nul
  exit /b 0
)

taskkill /PID %SERVICE_PID% /T /F >nul 2>nul
if errorlevel 1 (
  echo [stop] process %SERVICE_PID% not stopped or already exited
) else (
  echo [stop] stopped pid %SERVICE_PID%
)

del /q ".codex-logs\service.pid" >nul 2>nul
endlocal
