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

# Debian and Ubuntu keep the server tools off PATH; look where they install them.
if ! command -v initdb >/dev/null; then
  for d in "$(pg_config --bindir 2>/dev/null)" /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@*/bin; do
    if [ -n "$d" ] && [ -x "$d/initdb" ]; then
      PATH="$d:$PATH"
      break
    fi
  done
fi
for bin in initdb pg_ctl psql; do
  if ! command -v "$bin" >/dev/null; then
    # On CI a missing Postgres is a failure, never a silent pass.
    if [ -n "${CI:-}" ]; then
      echo "FAIL: $bin not found. Install Postgres 16 to run the SQL tests."
      exit 1
    fi
    echo "SKIP: $bin not found. Install Postgres 16 to run the SQL tests."
    exit 0
  fi
done
# initdb refuses to run as root; run the tests as the postgres user instead.
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  chmod -R o+rX . 2>/dev/null || true
  exec su postgres -s /bin/bash -c "cd '$PWD' && PATH='$PATH' TMPDIR=/tmp bash tests/sql/run.sh"
fi

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
  local db="$1"
  shift
  psql -X -q -v ON_ERROR_STOP=1 -h "$sock" -p "$port" -U postgres -d "$db" "$@"
}

# Migrations go into a template; each test file then gets its own copy.
run_psql postgres -c "create database gw_template"
run_psql gw_template -f tests/sql/supabase-stub.sql
for f in supabase/migrations/*.sql; do
  if ! run_psql gw_template -f "$f" >/dev/null 2>"$dir/err"; then
    echo "FAIL migration $f"
    cat "$dir/err"
    exit 1
  fi
done
echo "ok   $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') migrations apply cleanly"

status=0
n=0
for t in tests/sql/*.test.sql; do
  n=$((n + 1))
  run_psql postgres -c "create database gw_test_$n template gw_template"
  if run_psql "gw_test_$n" -f "$t" 2>"$dir/err"; then
    echo "ok   $t ($(grep -c '^-- test:' "$t") tests)"
  else
    echo "FAIL $t"
    grep -v '^NOTICE' "$dir/err" || true
    status=1
  fi
done
exit $status
