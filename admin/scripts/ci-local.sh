#!/bin/sh
# Everything CI would run, locally. Stops at the first failure.
set -e
cd "$(dirname "$0")/.."
echo "== prisma validate";  npx prisma validate
echo "== dbml in step";     node scripts/check-dbml.mjs
echo "== typecheck";        npx tsc --noEmit
echo "== secret scan";      node ../scripts/secret-scan.mjs
echo "== production build"; NEXT_DIST_DIR=.next-ci npx next build >/dev/null && echo "build ok"
echo "ALL CHECKS PASSED"
