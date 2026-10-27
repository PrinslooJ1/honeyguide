#!/bin/bash
# End-to-end tests: build the app against a local Supabase stand-in, then run Playwright.
# Needs PostgreSQL 16 (see tests/db/run.sh), Node 20+ and Playwright with Chromium.
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT="$ROOT/tests/.out"
mkdir -p "$OUT"
cd "$ROOT"
OUT_DIR="$OUT/app" SUPABASE_URL=http://localhost:54321 SUPABASE_KEY=test-key node scripts/build.mjs >/dev/null
python3 -m http.server 8084 --bind 127.0.0.1 --directory "$OUT/app" >/dev/null 2>&1 &
WEB=$!
status=0
for t in ${@:-sharing vault}; do
  bash "$ROOT/tests/mock/db-up.sh" >/dev/null
  PGSOCK=${MOCK_PGDIR:-/var/tmp/hgmock}/.s.PGSQL.${MOCK_PGPORT:-55440} PGDB=hg PORT=54321 node "$ROOT/tests/mock/server.mjs" > "$OUT/mock.log" 2>&1 &
  API=$!
  sleep 1.5
  echo "== $t"
  node "$ROOT/tests/e2e/$t.cjs" | grep -E '^(PASS|FAIL)|passed' || status=1
  kill $API 2>/dev/null
done
kill $WEB 2>/dev/null
exit $status
