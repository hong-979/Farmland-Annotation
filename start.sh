#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT_DIR"

if [ ! -f "dist/index.html" ]; then
  echo "[start] dist missing, building..."
  npm run build
fi

BOOTSTRAP_ADMIN_USERNAME=${BOOTSTRAP_ADMIN_USERNAME:-admin}
BOOTSTRAP_ADMIN_PASSWORD=${BOOTSTRAP_ADMIN_PASSWORD:-Admin@123456}
BOOTSTRAP_ADMIN_DISPLAY_NAME=${BOOTSTRAP_ADMIN_DISPLAY_NAME:-System Admin}
SESSION_SECRET=${SESSION_SECRET:-annotation-platform-session-secret}
ANNOTATION_SERVER_HOST=${ANNOTATION_SERVER_HOST:-0.0.0.0}
ANNOTATION_SERVER_PORT=${ANNOTATION_SERVER_PORT:-3001}
ANNOTATION_DB_PATH=${ANNOTATION_DB_PATH:-"$ROOT_DIR/.data/annotation.sqlite"}

export BOOTSTRAP_ADMIN_USERNAME
export BOOTSTRAP_ADMIN_PASSWORD
export BOOTSTRAP_ADMIN_DISPLAY_NAME
export SESSION_SECRET
export ANNOTATION_SERVER_HOST
export ANNOTATION_SERVER_PORT
export ANNOTATION_DB_PATH

mkdir -p ".data" ".codex-logs"

PID_FILE="$ROOT_DIR/.codex-logs/service.pid"
LOG_FILE="$ROOT_DIR/.codex-logs/service.log"

if [ -f "$PID_FILE" ]; then
  EXISTING_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "[start] service already running, pid=$EXISTING_PID"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

echo "[start] starting http://$ANNOTATION_SERVER_HOST:$ANNOTATION_SERVER_PORT"
nohup node dist-server/index.js >> "$LOG_FILE" 2>&1 &
SERVICE_PID=$!
printf '%s\n' "$SERVICE_PID" > "$PID_FILE"
echo "[start] pid=$SERVICE_PID"
