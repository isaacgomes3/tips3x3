#!/usr/bin/env bash
# Deploy tips3x3 para a VPS (rodar na máquina local / Git Bash / WSL)
# Uso: bash deploy/deploy-remote.sh

set -euo pipefail

HOST="${TIPS3X3_HOST:-tips3x3}"
APP_DIR=/var/www/tips3x3
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Sync arquivos → ${HOST}:${APP_DIR}"
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude deploy \
  --exclude '*.mts' \
  --exclude scripts-probe* \
  "${LOCAL_ROOT}/" "${HOST}:${APP_DIR}/"

if [[ -f "${LOCAL_ROOT}/.env.local" ]]; then
  echo "==> Enviando .env.local"
  scp "${LOCAL_ROOT}/.env.local" "${HOST}:${APP_DIR}/.env.local"
fi

echo "==> Build + PM2 na VPS"
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /var/www/tips3x3
npm ci --omit=dev
# Playwright browser para Sofascore (server-side)
npx playwright-core install chromium || npx playwright install chromium || true
npm run build
mkdir -p logs
pm2 delete tips3x3 2>/dev/null || true
pm2 start npm --name tips3x3 -- start
pm2 save
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true
pm2 status
REMOTE

echo ""
echo "Deploy ok. Teste: http://$(ssh "$HOST" 'curl -4 -s ifconfig.me') e https://tips3x3.com (após DNS+SSL)"
