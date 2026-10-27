#!/bin/bash
# Throwaway local PostgreSQL 16: apply every migration in order, then run the access-rule checks.
# Needs the PostgreSQL 16 server binaries and psql, and root (the server runs as the postgres user).
# Expected errors are printed after a line that says "(expect ... error)".
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
B=${PG_BIN:-/usr/lib/postgresql/16/bin}
PORT=${PG_PORT:-55450}
D=$(mktemp -d /var/tmp/hgtest.XXXXXX)
chown postgres "$D"
su postgres -c "$B/initdb -D $D/data -A trust -U postgres" >/dev/null
su postgres -c "$B/pg_ctl -D $D/data -o '-k $D -p $PORT -c listen_addresses=' -l $D/log start" >/dev/null
sleep 2
P="psql -h $D -p $PORT -U postgres -X -q"
setup() {
  $P -c "create database $1" >/dev/null
  $P -d "$1" -f "$ROOT/tests/db/stub.sql" >/dev/null 2>&1
  for m in "$ROOT"/supabase/migrations/*.sql; do
    $P -d "$1" -v ON_ERROR_STOP=1 -f "$m" >/dev/null || echo "!! $(basename "$m") FAILED in $1"
  done
}
setup sharing
setup r14
echo "== sharing (owner, partner, helper, cover mode, exact location)"
$P -d sharing -At -f "$ROOT/tests/db/sharing.sql" 2>&1 | grep -v '^$'
echo "== photos and exact locations"
$P -d sharing -At -f "$ROOT/tests/db/photos.sql" 2>&1 | grep -v '^$'
echo "== release 1.4 (mentor mode, owner-only deletes, private logs, loss survey, returned inserts)"
$P -d r14 -At -f "$ROOT/tests/db/release_1_4.sql" 2>&1 | grep -v '^$'
echo "== security definer functions the anon role may run (expect get_passport, submit_loss_survey):"
$P -d r14 -At -c "select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p where p.prosecdef and has_function_privilege('anon', p.oid, 'execute') and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)"
su postgres -c "$B/pg_ctl -D $D/data stop" >/dev/null
rm -rf "$D"
