#!/usr/bin/env bash
set -euo pipefail

HOST="${TIPS3X3_HOST:-tips3x3}"
APP_DIR=/var/www/tips3x3
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Sync arquivos -> ${HOST}:${APP_DIR}"
cd "$LOCAL_ROOT"
tar -czf - \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  --exclude=deploy \
  --exclude=mobile \
  --exclude=data \
  --exclude='*.mts' \
  --exclude='scripts-probe*' \
  . | ssh "$HOST" "cd $APP_DIR && tar -xzf -"

if [[ -f "${LOCAL_ROOT}/.env.local" ]]; then
  echo "==> Enviando .env.local"
  scp "${LOCAL_ROOT}/.env.local" "${HOST}:${APP_DIR}/.env.local"
fi

echo "==> Build + PM2 na VPS"
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /var/www/tips3x3
npm ci
npx playwright-core install chromium || npx playwright install chromium || true
npm run build
mkdir -p logs
pm2 delete tips3x3 2>/dev/null || true
pm2 start npm --name tips3x3 -- start
pm2 save
pm2 status
REMOTE

echo ""
echo "Deploy ok."
