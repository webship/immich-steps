#!/usr/bin/env bash
# Start the demo the features run against (.github/demo/compose.yml) and give it its two accounts, through Immich's
# own API: the first admin (admin-sign-up, which only an empty server takes) and a normal user the admin makes, both
# past the first-run wizard (onboarded), and the version check off (no call out, no "new version" notice under a
# test). Their passwords come from the environment, never from a file of the repository:
#   IMMICH_ADMIN_PASSWORD, IMMICH_USER_PASSWORD  (required)
#   IMMICH_ADMIN_EMAIL, IMMICH_USER_EMAIL        (admin@example.com, user@example.com)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="${ROOT}/demo-app"
U=http://127.0.0.1:8502
: "${IMMICH_ADMIN_PASSWORD:?set IMMICH_ADMIN_PASSWORD}" "${IMMICH_USER_PASSWORD:?set IMMICH_USER_PASSWORD}"
ADMIN="${IMMICH_ADMIN_EMAIL:-admin@example.com}"
USER_EMAIL="${IMMICH_USER_EMAIL:-user@example.com}"
mkdir -p "${APP}/library"
if [ ! -f "${APP}/.env.webship" ]; then
  ( umask 077 && printf 'DB_PASSWORD=%s\nIMMICH_LIBRARY=%s\n' "$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)" "${APP}/library" > "${APP}/.env.webship" )
fi
docker compose -p immich-steps-demo -f "${ROOT}/.github/demo/compose.yml" --env-file "${APP}/.env.webship" up -d --quiet-pull
for i in $(seq 1 120); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "${U}/api/server/ping")" = 200 ] && break
  sleep 2
done
curl -fsS "${U}/api/server/version" > /dev/null || { echo "The demo did not answer at ${U}." >&2; exit 1; }
body() { python3 -c 'import json, sys; it = iter(sys.argv[1:]); print(json.dumps({k: (v == "true" if v in ("true", "false") else v) for k, v in zip(it, it)}))' "$@"; }
login() { curl -fsS -X POST "${U}/api/auth/login" -H 'Content-Type: application/json' --data "$(body email "$1" password "$2")" | python3 -c 'import json, sys; print(json.load(sys.stdin)["accessToken"])'; }
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${U}/api/auth/admin-sign-up" -H 'Content-Type: application/json' --data "$(body email "${ADMIN}" password "${IMMICH_ADMIN_PASSWORD}" name 'Webship admin')")
case "${code}" in 201) echo "The admin is made: ${ADMIN}." ;; 400) echo "The admin is there already." ;; *) echo "admin-sign-up answered ${code}." >&2; exit 1 ;; esac
A="$(login "${ADMIN}" "${IMMICH_ADMIN_PASSWORD}")"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${U}/api/admin/users" -H "Authorization: Bearer ${A}" -H 'Content-Type: application/json' --data "$(body email "${USER_EMAIL}" password "${IMMICH_USER_PASSWORD}" name 'Webship user' shouldChangePassword false)")
case "${code}" in 201) echo "The user is made: ${USER_EMAIL}." ;; 400) echo "The user is there already." ;; *) echo "The admin API answered ${code} for the user." >&2; exit 1 ;; esac
for who in "${ADMIN}:${IMMICH_ADMIN_PASSWORD}" "${USER_EMAIL}:${IMMICH_USER_PASSWORD}"; do
  T="$(login "${who%%:*}" "${who#*:}")"
  curl -fsS -o /dev/null -X PUT "${U}/api/users/me/onboarding" -H "Authorization: Bearer ${T}" -H 'Content-Type: application/json' --data '{"isOnboarded":true}'
  curl -fsS -o /dev/null -X POST "${U}/api/auth/logout" -H "Authorization: Bearer ${T}"
done
echo "Both accounts are past the first-run wizard."
curl -fsS "${U}/api/system-config" -H "Authorization: Bearer ${A}" | python3 -c 'import json, sys; c = json.load(sys.stdin); c["newVersionCheck"]["enabled"] = False; print(json.dumps(c))' > "${APP}/config.json"
curl -fsS -o /dev/null -X PUT "${U}/api/system-config" -H "Authorization: Bearer ${A}" -H 'Content-Type: application/json' --data @"${APP}/config.json"
rm -f "${APP}/config.json"
# The library's own first-run setup, which only an admin meets: a flag of its own beside each account's (the
# isOnboarded of /api/server/config). Until it is set, the admin's sign-in lands on /auth/onboarding.
curl -fsS -o /dev/null -X POST "${U}/api/system-metadata/admin-onboarding" -H "Authorization: Bearer ${A}" -H 'Content-Type: application/json' --data '{"isOnboarded":true}'
echo "The library's own first-run setup is marked done."
curl -fsS -o /dev/null -X POST "${U}/api/auth/logout" -H "Authorization: Bearer ${A}"
echo "The version check is off. The demo is ready at ${U}."
