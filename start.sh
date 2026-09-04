#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)"
[ -f .env.local ] || npm run bootstrap
[ -d node_modules ] || npm install
[ ! -f .run/server.pid ] || ./stop.sh
rm -rf .next
npm run build
mkdir -p .run
PORT=3100 nohup npm start -- -p 3100 > .run/server.log 2>&1 & echo $! > .run/server.pid
echo 3100 > .run/server.port
for _ in $(seq 1 90); do
  body=$(curl -fsS http://localhost:3100/api/health 2>/dev/null || true)
  if printf '%s' "$body" | grep -q '"app":"razorprocure"'; then
    printf 'RazorProcure ready at http://localhost:3100\n'
    exit 0
  fi
  sleep .5
done
printf 'Health check failed. Review .run/server.log\n' >&2
./stop.sh
exit 1
