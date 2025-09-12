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

# Also stop Energy & HVAC twin stack
if [[ -f twins/energy_hvac/compose.yaml ]]; then
  echo "Stopping Energy & HVAC twin stack (twins/energy_hvac)..."
  EH_OPTS=(down)
  if [[ "${1:-}" == "--clean" ]]; then EH_OPTS+=(-v); fi
  "${COMPOSE[@]}" -f twins/energy_hvac/compose.yaml "${EH_OPTS[@]}"
fi

# Also stop M5Core2 twin stack
if [[ -f twins/m5core2/compose.yaml ]]; then
  echo "Stopping M5Core2 twin stack (twins/m5core2)..."
  M5_OPTS=(down)
  if [[ "${1:-}" == "--clean" ]]; then M5_OPTS+=(-v); fi
  "${COMPOSE[@]}" -f twins/m5core2/compose.yaml "${M5_OPTS[@]}"
fi

echo "Project stopped."
