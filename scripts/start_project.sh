#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

have_cmd() { command -v "$1" >/dev/null 2>&1; }

if ! have_cmd docker; then
  echo "docker is required but not found" >&2
  exit 1
fi

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if have_cmd docker-compose; then
    COMPOSE=(docker-compose)
  else
    echo "Neither 'docker compose' nor 'docker-compose' available" >&2
    exit 1
  fi
fi

if [[ ! -f .env && -f .env.example ]]; then
  echo "Creating .env from .env.example (edit as needed)..."
  cp .env.example .env
fi

OPTS=(up -d)
if [[ "${1:-}" == "--build" ]]; then
  OPTS+=(--build)
fi

"${COMPOSE[@]}" "${OPTS[@]}"

# Also start example Lift twin UI (localhost:3001) and generator
if [[ -f twins/lift/compose.yaml ]]; then
  echo "Starting Lift twin UI (twins/lift)..."
  "${COMPOSE[@]}" -f twins/lift/compose.yaml up -d ui generator
fi

# Start Energy & HVAC twin UI (localhost:3002)
if [[ -f twins/energy_hvac/compose.yaml ]]; then
  echo "Starting Energy & HVAC twin UI (twins/energy_hvac)..."
  "${COMPOSE[@]}" -f twins/energy_hvac/compose.yaml up -d ui generator
fi

echo "Project started. Use scripts/stop_project.sh to stop."
