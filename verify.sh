#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)"
[ -d node_modules ] || npm install
npm run secret-scan
npm run typecheck
npm run lint
npm test
npm run build
npm audit --audit-level=high
printf '\nRazorProcure VERIFY PASS.\n'
