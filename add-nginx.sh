#!/bin/bash
# Quick add Nginx reverse proxy for HappVPN
DOMAIN=${1:-""}
PORT=${2:-3000}
APP_DIR="/opt/happvpn"
CERT_FILE="/usr/local/etc/xray/fullchain.pem"
KEY_FILE="/usr/local/etc/xray/privkey.pem"

if [ -z "$DOMAIN" ]; then
    echo "[❌] Укажите домен: bash add-nginx.sh vpn.example.com"
    exit 1
fi

if [ ! -f "${APP_DIR}/server.js" ]; then
    echo "[❌] HappVPN не найден в ${APP_DIR}. Сначала установите приложение."
    exit 1
fi

if [ ! -s "${CERT_FILE}" ] || [ ! -s "${KEY_FILE}" ]; then
    echo "[❌] TLS сертификат не найден в /usr/local/etc/xray."
    echo "    Сначала выпустите сертификат через install.sh или acme.sh."
    exit 1
fi

echo "[+] Installing Nginx..."
apt install -y nginx

cat > /etc/nginx/sites-available/happvpn <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /usr/local/etc/xray/fullchain.pem;
    ssl_certificate_key /usr/local/etc/xray/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

ln -sf /etc/nginx/sites-available/happvpn /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "[+] Restarting HappVPN in HTTP-only mode on 127.0.0.1:${PORT}..."
npm install -g pm2 2>/dev/null || true
cd ${APP_DIR}
pm2 delete happvpn 2>/dev/null || true
HAPPVPN_HTTP_ONLY=1 PORT=${PORT} pm2 start server.js --name happvpn
pm2 save

nginx -t && systemctl restart nginx && systemctl enable nginx

echo "[✅] Nginx proxy: https://${DOMAIN} → localhost:${PORT}"
