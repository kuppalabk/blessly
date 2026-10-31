#!/usr/bin/env bash
# Start a local PostgreSQL 16 cluster for development and tests.
# Usage: scripts/db-local.sh start|stop|status
set -euo pipefail
PGBIN=/usr/lib/postgresql/16/bin
DATA=${PGDATA_DIR:-/tmp/wishwell-pg}
PORT=${PGPORT:-55432}
cmd=${1:-start}
as_pg() { if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
case "$cmd" in
  start)
    if [ ! -d "$DATA" ]; then
      mkdir -p "$DATA"; [ "$(id -u)" = "0" ] && chown postgres:postgres "$DATA"
      as_pg "$PGBIN/initdb -D $DATA -U wishwell --auth=trust >/dev/null"
    fi
    as_pg "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp' -l $DATA/log.txt start -w >/dev/null"
    for db in wishwell wishwell_test; do
      as_pg "$PGBIN/psql -h /tmp -p $PORT -U wishwell -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname='$db'\" | grep -q 1 || $PGBIN/createdb -h /tmp -p $PORT -U wishwell $db"
    done
    echo "PostgreSQL running on port $PORT (databases: wishwell, wishwell_test)";;
  stop) as_pg "$PGBIN/pg_ctl -D $DATA stop -m fast";;
  status) as_pg "$PGBIN/pg_ctl -D $DATA status";;
esac
