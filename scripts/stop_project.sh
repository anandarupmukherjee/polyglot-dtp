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

OPTS=(down)
if [[ "${1:-}" == "--clean" ]]; then
  OPTS+=(-v)
fi

"${COMPOSE[@]}" "${OPTS[@]}"

# Also stop Lift twin stack
if [[ -f twins/lift/compose.yaml ]]; then
  echo "Stopping Lift twin stack (twins/lift)..."
  LIFT_OPTS=(down)
  if [[ "${1:-}" == "--clean" ]]; then LIFT_OPTS+=(-v); fi
  "${COMPOSE[@]}" -f twins/lift/compose.yaml "${LIFT_OPTS[@]}"
fi

echo "Project stopped."
