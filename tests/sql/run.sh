#!/usr/bin/env bash
# Applies every migration to a throwaway local Postgres, then runs each
# tests/sql/*.test.sql against it. Needs Postgres 16 or later: initdb, pg_ctl
# and psql on PATH. Nothing touches the production database.
#
#   tests/sql/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
# Postgres on macOS refuses to start under an unset or unknown locale.
export LC_ALL=C LANG=C

for bin in initdb pg_ctl psql; do
  if ! command -v "$bin" >/dev/null; then
    echo "SKIP: $bin not found. Install Postgres 16 to run the SQL tests."
    exit 0
  fi
done

dir="$(mktemp -d "${TMPDIR:-/tmp}/gw-sql.XXXXXX")"
# Unix socket paths are limited to about 100 characters; keep this one short.
sock="$(mktemp -d /tmp/gw.XXXXXX)"
port=$((20000 + RANDOM % 20000))
cleanup() {
  pg_ctl -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$dir" "$sock"
}
trap cleanup EXIT

initdb -D "$dir/data" -U postgres --auth=trust --no-sync --no-locale -E UTF8 >/dev/null
if ! pg_ctl -D "$dir/data" -l "$dir/log" -w \
  -o "-p $port -k $sock -c listen_addresses='' -c fsync=off -c timezone=UTC" start >/dev/null; then
  cat "$dir/log"
  exit 1
fi

run_psql() {
  psql -X -q -v ON_ERROR_STOP=1 -h "$sock" -p "$port" -U postgres -d postgres "$@"
}

run_psql -f tests/sql/supabase-stub.sql
for f in supabase/migrations/*.sql; do
  if ! run_psql -f "$f" >/dev/null 2>"$dir/err"; then
    echo "FAIL migration $f"
    cat "$dir/err"
    exit 1
  fi
done
echo "ok   $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') migrations apply cleanly"

status=0
for t in tests/sql/*.test.sql; do
  if run_psql -f "$t" 2>"$dir/err"; then
    echo "ok   $t ($(grep -c '^-- test:' "$t") tests)"
  else
    echo "FAIL $t"
    grep -v '^NOTICE' "$dir/err" || true
    status=1
  fi
done
exit $status
