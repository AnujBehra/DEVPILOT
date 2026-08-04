#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" 2>/dev/null || true; fi
  if [[ -n "${WEB_PID:-}" ]]; then kill "$WEB_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

echo "Starting DevPilot PostgreSQL..."
npm run postgres:up

echo "Seeding DevPilot PostgreSQL data..."
npm run postgres:seed

echo "Starting DevPilot API on http://localhost:3010..."
npm start &
API_PID=$!

echo "Starting DevPilot frontend on http://localhost:5173..."
npm --prefix apps/frontend run dev -- --host 0.0.0.0 &
WEB_PID=$!

wait "$API_PID" "$WEB_PID"
