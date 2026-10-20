#!/usr/bin/env bash
# Spin up a local TREK instance, install this plugin into it, and seed a small demo trip
# to click around in. Handy for manual testing of any branch.
#
#   cd <plugin worktree>
#   /path/to/scripts/test-local.sh
#
# It packs whatever is checked out in the current directory, so run it from the worktree
# you want to try. Re-run after a change to reinstall. Reset the instance (wipe all data):
#   docker compose -f docker-compose.test.yml down -v
set -euo pipefail

BASE="http://127.0.0.1:3737"
CONTAINER="trek-timeline-test"
EMAIL="demo@trek.local"
PASS="Demo1234!pass"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$SCRIPT_DIR/../docker-compose.test.yml"
DB="/app/data/travel.db"
# Identify the plugin from its manifest rather than hard-coding it.
PLUGIN_ID="$(node -e "process.stdout.write(require('$PWD/trek-plugin.json').id)")"
PLUGIN_NAME="$(node -e "const m=require('$PWD/trek-plugin.json');process.stdout.write(m.name||m.id)")"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
api() { curl -sS -b "$COOKIES" -c "$COOKIES" "$@"; }
dbrun() { docker exec "$CONTAINER" node -e "const db=require('/app/node_modules/better-sqlite3')('$DB');$1"; }

COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES"' EXIT

# 1) Build + pack the plugin from the current worktree.
say "Building + packing $PLUGIN_ID ($PWD)"
npm run build >/dev/null
npx trek-plugin-sdk pack >/dev/null
ZIP="$PWD/plugin.zip"
[ -f "$ZIP" ] || { echo "pack did not produce plugin.zip"; exit 1; }

# 2) Make sure TREK is up.
say "Starting TREK (docker-compose.test.yml)"
docker compose -f "$COMPOSE" up -d
printf 'waiting for TREK to answer'
for _ in $(seq 1 60); do
  if curl -sf "$BASE/api/auth/app-config" >/dev/null 2>&1; then ok=1; break; fi
  printf '.'; sleep 1
done
echo
[ "${ok:-}" = 1 ] || { echo "TREK did not come up on $BASE"; exit 1; }

# 3) Admin user. Registration is a no-op if it already exists; promote to admin either way,
#    since installing a plugin needs admin rights.
say "Creating + promoting admin ($EMAIL / $PASS)"
api -X POST "$BASE/api/auth/register" -H 'content-type: application/json' \
  -d "{\"username\":\"demo\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Demo\"}" >/dev/null || true
dbrun "db.prepare('UPDATE users SET role=? WHERE email=?').run('admin','$EMAIL');"
api -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" >/dev/null

# 4) Install + activate the freshly packed plugin.
say "Installing + activating $PLUGIN_ID"
api -X POST "$BASE/api/admin/plugins/upload" -F "file=@$ZIP" | sed 's/^/  upload: /'; echo
api -X POST "$BASE/api/admin/plugins/$PLUGIN_ID/activate" | sed 's/^/  activate: /'; echo

# 5) Seed a rich demo trip (no-ops if it is already there). See scripts/seed-demo.mjs.
say "Seeding demo trip"
node "$SCRIPT_DIR/seed-demo.mjs" "$BASE" "$CONTAINER" "$EMAIL" "$PASS"

cat <<EOF

────────────────────────────────────────────────────────────
  TREK ready:   $BASE
  Login:        $EMAIL  /  $PASS
  Open:         Trips → "Demo trip" → "$PLUGIN_NAME" tab

  Re-run this script to reinstall after a change.
  Reset the instance (wipe data):  docker compose -f docker-compose.test.yml down -v
────────────────────────────────────────────────────────────
EOF
