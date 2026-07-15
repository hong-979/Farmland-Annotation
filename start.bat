@echo off
setlocal

cd /d "%~dp0"

if not exist "dist\index.html" (
  echo [start] dist missing, building...
  call npm run build
  if errorlevel 1 (
    echo [start] build failed
    exit /b 1
  )
)

if not defined BOOTSTRAP_ADMIN_USERNAME set "BOOTSTRAP_ADMIN_USERNAME=admin"
if not defined BOOTSTRAP_ADMIN_PASSWORD set "BOOTSTRAP_ADMIN_PASSWORD=Admin@123456"
if not defined BOOTSTRAP_ADMIN_DISPLAY_NAME set "BOOTSTRAP_ADMIN_DISPLAY_NAME=System Admin"
if not defined SESSION_SECRET set "SESSION_SECRET=annotation-platform-session-secret"
if not defined ANNOTATION_SERVER_HOST set "ANNOTATION_SERVER_HOST=0.0.0.0"
if not defined ANNOTATION_SERVER_PORT set "ANNOTATION_SERVER_PORT=3001"
if not defined ANNOTATION_DB_PATH set "ANNOTATION_DB_PATH=%~dp0.data\annotation.sqlite"

if not exist ".data" mkdir ".data"
if not exist ".codex-logs" mkdir ".codex-logs"

echo [start] starting http://%ANNOTATION_SERVER_HOST%:%ANNOTATION_SERVER_PORT%

for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$wd=(Resolve-Path '.').Path; $log=Join-Path $wd '.codex-logs\service.log'; $pidFile=Join-Path $wd '.codex-logs\service.pid'; $cmd='Set-Location ''' + $wd.Replace('''','''''') + '''; node dist-server/index.js *> ''' + $log.Replace('''','''''') + ''''; $proc=Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-Command',$cmd -WindowStyle Hidden -PassThru; Set-Content -Path $pidFile -Value $proc.Id; Write-Output $proc.Id"`) do set "SERVICE_PID=%%P"

if not defined SERVICE_PID (
  echo [start] failed to capture pid
  exit /b 1
)

echo [start] pid=%SERVICE_PID%
endlocal
