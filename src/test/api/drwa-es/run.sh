#!/usr/bin/env bash
# Self-booting harness for the DRWA real-Elasticsearch API spec.
#
# Boots a single-node Elasticsearch container via docker compose, waits for it
# to be healthy, runs jest scoped to drwa.api-spec.ts with DRWA_ES_E2E=1, then
# tears the container down on exit (success, failure, or Ctrl-C).
#
# Usage:   npm run test:drwa-es-e2e
# Env:     DRWA_ES_PORT (default 9201)  host port to bind elasticsearch to
#          DRWA_ES_BOOT_TIMEOUT_SEC (default 120)  max wait for ES to become healthy
#          DRWA_ES_KEEP_UP (default 0)  if 1, leave the container running after tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

DRWA_ES_PORT="${DRWA_ES_PORT:-9201}"
DRWA_ES_BOOT_TIMEOUT_SEC="${DRWA_ES_BOOT_TIMEOUT_SEC:-120}"
DRWA_ES_KEEP_UP="${DRWA_ES_KEEP_UP:-0}"

export DRWA_ES_PORT

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker not found in PATH — cannot run DRWA ES e2e harness" >&2
  exit 2
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "error: neither 'docker compose' nor 'docker-compose' available" >&2
  exit 2
fi

teardown() {
  local exit_code=$?
  if [[ "${DRWA_ES_KEEP_UP}" == "1" ]]; then
    echo "DRWA ES harness: DRWA_ES_KEEP_UP=1, leaving container running on port ${DRWA_ES_PORT}"
    exit "${exit_code}"
  fi
  echo "DRWA ES harness: tearing down"
  "${COMPOSE[@]}" -f "${COMPOSE_FILE}" down --remove-orphans --volumes >/dev/null 2>&1 || true
  exit "${exit_code}"
}
trap teardown EXIT INT TERM

echo "DRWA ES harness: starting elasticsearch on host port ${DRWA_ES_PORT}"
"${COMPOSE[@]}" -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "DRWA ES harness: waiting up to ${DRWA_ES_BOOT_TIMEOUT_SEC}s for elasticsearch to become ready"
deadline=$(( $(date +%s) + DRWA_ES_BOOT_TIMEOUT_SEC ))
url="http://localhost:${DRWA_ES_PORT}"
until curl -fsS "${url}" >/dev/null 2>&1; do
  if (( $(date +%s) > deadline )); then
    echo "error: elasticsearch did not become ready within ${DRWA_ES_BOOT_TIMEOUT_SEC}s" >&2
    "${COMPOSE[@]}" -f "${COMPOSE_FILE}" logs --tail=80 elasticsearch >&2 || true
    exit 1
  fi
  sleep 2
done

echo "DRWA ES harness: elasticsearch ready at ${url}"

cd "${API_ROOT}"
DRWA_ES_E2E=1 DRWA_ES_URL="${url}" \
  npx jest \
    --config ./src/test/jest-api.json \
    --runInBand \
    --detectOpenHandles \
    --forceExit \
    --testPathPattern='drwa\.api-spec'
