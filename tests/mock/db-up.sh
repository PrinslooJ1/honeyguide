#!/bin/bash
# Fresh local PostgreSQL for the Supabase stand-in: stub auth and storage, then every migration.
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
B=${PG_BIN:-/usr/lib/postgresql/16/bin}
D=${MOCK_PGDIR:-/var/tmp/hgmock}
PORT=${MOCK_PGPORT:-55440}
[ -f "$D/data/postmaster.pid" ] && su postgres -c "$B/pg_ctl -D $D/data stop -m fast" >/dev/null 2>&1
rm -rf "$D"; mkdir -p "$D" && chown postgres "$D"
su postgres -c "$B/initdb -D $D/data -A trust -U postgres" >/dev/null
su postgres -c "$B/pg_ctl -D $D/data -o '-k $D -p $PORT -c listen_addresses=' -l $D/log start" >/dev/null
sleep 2
P="psql -h $D -p $PORT -U postgres -X -q"
$P -c 'create database hg' >/dev/null
$P -c "alter database hg set timezone to 'UTC'" >/dev/null
$P -d hg -f "$ROOT/tests/db/stub.sql" >/dev/null 2>&1
for m in "$ROOT"/supabase/migrations/*.sql; do
  $P -d hg -v ON_ERROR_STOP=1 -f "$m" >/dev/null || echo "!! $(basename "$m") failed"
done
echo "database ready: socket $D/.s.PGSQL.$PORT"
