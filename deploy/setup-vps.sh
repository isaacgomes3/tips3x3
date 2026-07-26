# tips3x3 — setup inicial da VPS (AlmaLinux 10)
# Uso: bash setup-vps.sh

set -euo pipefail

APP_DIR=/var/www/tips3x3
DOMAIN=tips3x3.com
NODE_MAJOR=22

echo "==> Pacotes base"
dnf -y update
dnf -y install nginx git curl tar gcc-c++ make firewalld policycoreutils-python-utils

echo "==> Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  dnf -y install nodejs
fi
node -v
npm -v

echo "==> PM2"
npm install -g pm2

echo "==> Playwright Chromium deps (Sofascore)"
dnf -y install \
  nss atk at-spi2-atk cups-libs libdrm libXcomposite libXdamage \
  libXrandr libgbm alsa-lib pango gtk3 xorg-x11-fonts-Type1 \
  xorg-x11-fonts-misc mesa-libEGL libxkbcommon 2>/dev/null || true

echo "==> Diretório app"
mkdir -p "$APP_DIR"
chown -R root:root "$APP_DIR"

echo "==> Nginx site"
cat >/etc/nginx/conf.d/tips3x3.conf <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name tips3x3.com www.tips3x3.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX

# Remover default conflitante se existir
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true

nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "==> Firewall"
systemctl enable --now firewalld || true
firewall-cmd --permanent --add-service=http || true
firewall-cmd --permanent --add-service=https || true
firewall-cmd --permanent --add-service=ssh || true
firewall-cmd --reload || true

echo "==> Certbot (SSL) — rode DEPOIS do DNS apontar para este IP"
if ! command -v certbot >/dev/null 2>&1; then
  dnf -y install certbot python3-certbot-nginx || true
fi

echo ""
echo "OK. Próximos passos:"
echo "1) Apontar DNS A de tips3x3.com e www para $(curl -4 -s ifconfig.me || echo SEU_IP)"
echo "2) Enviar o app (deploy-remote.sh) para $APP_DIR"
echo "3) certbot --nginx -d tips3x3.com -d www.tips3x3.com --non-interactive --agree-tos -m admin@tips3x3.com"
