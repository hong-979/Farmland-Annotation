#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT_DIR"

PID_FILE="$ROOT_DIR/.codex-logs/service.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "[stop] no pid file"
  exit 0
fi

SERVICE_PID=$(cat "$PID_FILE" 2>/dev/null || true)

if [ -z "$SERVICE_PID" ]; then
  echo "[stop] pid file empty"
  rm -f "$PID_FILE"
  exit 0
fi

if kill -0 "$SERVICE_PID" 2>/dev/null; then
  kill "$SERVICE_PID"
  echo "[stop] stopped pid $SERVICE_PID"
else
  echo "[stop] process $SERVICE_PID not running"
fi

rm -f "$PID_FILE"
