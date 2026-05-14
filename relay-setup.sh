#!/bin/bash
# ===== HappVPN Xray Relay Setup =====
# Использование: bash relay-setup.sh ДОМЕН
#
set -e

DOMAIN=${1:-""}
XRAY_DIR="/usr/local/etc/xray"

if [ -z "$DOMAIN" ]; then
    echo ""
    echo "  ❌ Укажите домен!"
    echo "  Использование: bash relay-setup.sh vpn.example.com"
    echo ""
    exit 1
fi

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   🛡️  HappVPN Relay Setup            ║"
echo "  ╠══════════════════════════════════════╣"
echo "  ║   Domain: ${DOMAIN}          ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# 1. Update system
echo "[1/5] Обновление системы..."
apt update -y && apt upgrade -y
apt install -y curl wget unzip socat cron

# 2. Install Xray
echo "[2/5] Установка Xray..."
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

# 3. Install acme.sh & get cert
echo "[3/5] Получение TLS сертификата..."
if [ ! -f /root/.acme.sh/acme.sh ]; then
    curl https://get.acme.sh | sh -s email=admin@${DOMAIN}
fi

# Stop anything on 80
systemctl stop nginx 2>/dev/null || true
fuser -k 80/tcp 2>/dev/null || true

if ! /root/.acme.sh/acme.sh --issue -d ${DOMAIN} --standalone --keylength ec-256 --server letsencrypt; then
    echo ""
    echo "  ❌ Не удалось выпустить TLS сертификат."
    echo "  Проверьте DNS A-запись домена и доступность порта 80."
    exit 1
fi

# Install cert for Xray
mkdir -p ${XRAY_DIR}
if ! /root/.acme.sh/acme.sh --install-cert -d ${DOMAIN} --ecc \
    --fullchain-file ${XRAY_DIR}/fullchain.pem \
    --key-file ${XRAY_DIR}/privkey.pem \
    --reloadcmd "systemctl restart xray"; then
    echo ""
    echo "  ❌ Не удалось установить TLS сертификат в ${XRAY_DIR}."
    exit 1
fi

# 4. Generate initial config
echo "[4/5] Генерация конфига..."
DEFAULT_UUID=$(xray uuid)
echo "  → Ваш первый UUID: ${DEFAULT_UUID}"

cat > ${XRAY_DIR}/config.json << XRAYEOF
{
    "log": {
        "loglevel": "warning"
    },
    "inbounds": [
        {
            "tag": "relay-in",
            "listen": "0.0.0.0",
            "port": 443,
            "protocol": "vless",
            "settings": {
                "clients": [
                    {
                        "id": "${DEFAULT_UUID}",
                        "flow": "xtls-rprx-vision"
                    }
                ],
                "decryption": "none"
            },
            "streamSettings": {
                "network": "tcp",
                "security": "tls",
                "tlsSettings": {
                    "certificates": [
                        {
                            "certificateFile": "${XRAY_DIR}/fullchain.pem",
                            "keyFile": "${XRAY_DIR}/privkey.pem"
                        }
                    ],
                    "alpn": ["h2", "http/1.1"]
                }
            },
            "sniffing": {
                "enabled": true,
                "destOverride": ["http", "tls"]
            }
        }
    ],
    "outbounds": [
        {
            "tag": "direct",
            "protocol": "freedom"
        },
        {
            "tag": "blocked",
            "protocol": "blackhole"
        }
    ]
}
XRAYEOF

# 5. Start
echo "[5/5] Запуск Xray..."
systemctl enable xray
systemctl restart xray

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   ✅  Xray Relay установлен!         ║"
echo "  ╠══════════════════════════════════════╣"
echo "  ║   UUID: ${DEFAULT_UUID}              "
echo "  ║   Домен: ${DOMAIN}                   "
echo "  ║                                      ║"
echo "  ║   Тест:                              ║"
echo "  ║   vless://${DEFAULT_UUID}@${DOMAIN}:443"
echo "  ║   ?security=tls&type=tcp              "
echo "  ║   &flow=xtls-rprx-vision              "
echo "  ║                                      ║"
echo "  ║   Конфиг: ${XRAY_DIR}/config.json    ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
echo "Далее: загрузите relay-config-gen.js на VPS"
echo "и запускайте для обновления конфига из HappVPN панели"
