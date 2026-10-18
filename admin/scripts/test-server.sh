#!/bin/sh
# Private server for the end-to-end tests: port 3200, the LOCAL Postgres (never the cloud database in .env),
# its own build folder. Usage: sh scripts/test-server.sh start | stop
cd "$(dirname "$0")/.."
LOCAL_URL="${TEST_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sez_print?schema=public}"
case "$1" in
  start)
    DATABASE_URL="$LOCAL_URL" DIRECT_URL="$LOCAL_URL" NEXT_DIST_DIR=.next-test PUBLIC_BASE_URL=http://localhost:3200 \
      nohup npx next dev --port 3200 > /tmp/sez-admin-test.log 2>&1 &
    echo $! > /tmp/sez-admin-test.pid
    i=0; until curl -s -m 3 localhost:3200/api/health | grep -q '"db":true'; do i=$((i+1)); [ $i -gt 40 ] && { echo "test server did not start"; tail -20 /tmp/sez-admin-test.log; exit 1; }; sleep 2; done
    echo "test server ready on :3200 (local database)";;
  stop)
    [ -f /tmp/sez-admin-test.pid ] && kill "$(cat /tmp/sez-admin-test.pid)" 2>/dev/null; pkill -f "next dev --port 3200" 2>/dev/null; rm -f /tmp/sez-admin-test.pid
    # Next adds its build folder to tsconfig.json while running; take that back out.
    sed -i "" "/\.next-test\//d" tsconfig.json 2>/dev/null || sed -i "/\.next-test\//d" tsconfig.json
    echo stopped;;
esac
