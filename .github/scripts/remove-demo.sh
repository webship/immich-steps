#!/usr/bin/env bash
# Remove the demo build-demo.sh made: its containers and its database volume, then demo-app/ with the library in it.
# The images it pulled stay: other projects may use them.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="${ROOT}/demo-app"
if [ -f "${APP}/.env.webship" ]; then
  docker compose -p immich-steps-demo -f "${ROOT}/.github/demo/compose.yml" --env-file "${APP}/.env.webship" down -v
fi
# The library's files belong to the server's user in its container: removed from a container of the same image.
if [ -d "${APP}/library" ]; then
  docker run --rm -v "${APP}:/demo-app" --entrypoint /bin/sh docker.io/valkey/valkey@sha256:418652cfb58ef879d4978c33553735d7147016032d5aefaa14c828e611eb9dfd -c 'rm -rf /demo-app/library' > /dev/null 2>&1 || true
fi
rm -rf "${APP:?}"
echo "The demo is removed."
