#!/bin/bash
# ═══════════════════════════════════════════
#  🛡️ HappVPN — Установка за 1 минуту
#  
#  Использование:
#  bash install.sh ДОМЕН
#  
#  Пример:
#  bash install.sh vpn.mysite.com
# ═══════════════════════════════════════════
set -e

DOMAIN=${1:-""}
XRAY_DIR="/usr/local/etc/xray"
APP_DIR="/opt/happvpn"

if [ -z "$DOMAIN" ]; then
    echo ""
    echo "  ❌ Укажите домен!"
    echo "  Использование: bash install.sh vpn.example.com"
    echo ""
    exit 1
fi

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   🛡️  HappVPN Installer              ║"
echo "  ╠══════════════════════════════════════╣"
echo "  ║   Домен: $DOMAIN"
echo "  ║   Панель: HTTPS 443"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ===== 1. SYSTEM =====
echo "[1/7] Обновление системы..."
apt update -y && apt install -y curl wget unzip socat cron git psmisc ufw

# ===== 2. NODE.JS =====
echo "[2/7] Установка Node.js..."
NODE_MAJOR=$(node -p "parseInt(process.versions.node.split('.')[0], 10)" 2>/dev/null || echo 0)
if [ "${NODE_MAJOR}" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "  Node $(node -v) | npm $(npm -v)"

# ===== 3. XRAY =====
echo "[3/7] Установка Xray..."
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

# ===== 4. TLS CERT =====
echo "[4/7] TLS сертификат для $DOMAIN..."
if [ ! -f /root/.acme.sh/acme.sh ]; then
    curl https://get.acme.sh | sh -s email=admin@${DOMAIN}
fi

mkdir -p ${XRAY_DIR}

if [ ! -s "${XRAY_DIR}/fullchain.pem" ] || [ ! -s "${XRAY_DIR}/privkey.pem" ]; then
    echo "  Для выпуска сертификата домен должен указывать на этот сервер, а порт 80 должен быть открыт."
    systemctl stop nginx caddy 2>/dev/null || true
    fuser -k 80/tcp 2>/dev/null || true

    if ! /root/.acme.sh/acme.sh --issue -d ${DOMAIN} --standalone --keylength ec-256 --server letsencrypt; then
        echo ""
        echo "  ❌ Не удалось выпустить TLS сертификат."
        echo "  Проверьте DNS A-запись домена, доступность порта 80 и лимиты Let's Encrypt."
        exit 1
    fi

    if ! /root/.acme.sh/acme.sh --install-cert -d ${DOMAIN} --ecc \
        --fullchain-file ${XRAY_DIR}/fullchain.pem \
        --key-file ${XRAY_DIR}/privkey.pem \
        --reloadcmd "systemctl restart xray"; then
        echo ""
        echo "  ❌ Не удалось установить TLS сертификат в ${XRAY_DIR}."
        exit 1
    fi
fi

if [ ! -s "${XRAY_DIR}/fullchain.pem" ] || [ ! -s "${XRAY_DIR}/privkey.pem" ]; then
    echo ""
    echo "  ❌ Сертификат не найден: ${XRAY_DIR}/fullchain.pem и ${XRAY_DIR}/privkey.pem"
    exit 1
fi

chmod 644 ${XRAY_DIR}/fullchain.pem ${XRAY_DIR}/privkey.pem

# ===== 5. HAPPVPN =====
echo "[5/7] Установка HappVPN..."
mkdir -p ${APP_DIR}/public

# Копируем файлы (они уже в той же папке что и install.sh)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp -f ${SCRIPT_DIR}/server.js ${APP_DIR}/
cp -f ${SCRIPT_DIR}/bot.js ${APP_DIR}/ 2>/dev/null || true
cp -f ${SCRIPT_DIR}/user-bot.js ${APP_DIR}/ 2>/dev/null || true
cp -f ${SCRIPT_DIR}/package.json ${APP_DIR}/
cp -f ${SCRIPT_DIR}/package-lock.json ${APP_DIR}/ 2>/dev/null || true
cp -f ${SCRIPT_DIR}/relay-config-gen.js ${APP_DIR}/
cp -rf ${SCRIPT_DIR}/public/* ${APP_DIR}/public/

# data.json — не перезаписываем если уже есть
if [ ! -f ${APP_DIR}/data.json ]; then
    if [ -f ${SCRIPT_DIR}/data.json ]; then
        cp ${SCRIPT_DIR}/data.json ${APP_DIR}/
    else
        echo '{"templates":[],"subscriptions":[],"settings":{},"logs":[]}' > ${APP_DIR}/data.json
    fi
fi

cd ${APP_DIR}
if [ -f package-lock.json ]; then
    npm ci --omit=dev
else
    npm install --omit=dev
fi

# ===== 6. НАСТРОЙКА =====
echo "[6/7] Настройка..."

# Записать домен в settings
node -e "
const fs = require('fs');
const crypto = require('crypto');
const d = JSON.parse(fs.readFileSync('data.json','utf8'));
if (!d.settings) d.settings = {};
d.settings.relayDomain = '${DOMAIN}';
d.settings.relayMainPort = '8443';
d.settings.relayBasePort = '10001';
d.settings.serverUrl = 'https://${DOMAIN}';
if (!d.settings.adminPath) d.settings.adminPath = 'panel-' + crypto.randomBytes(8).toString('hex');
if (!d.settings.adminPassword) d.settings.adminPassword = crypto.randomBytes(12).toString('base64url');
fs.writeFileSync('data.json', JSON.stringify(d, null, 2));
console.log('  Settings OK');
"

# Начальный Xray конфиг
DEFAULT_UUID=$(xray uuid)
mkdir -p /var/log/xray
touch /var/log/xray/access.log

cat > ${XRAY_DIR}/config.json << XEOF
{
    "log": {"loglevel": "warning"},
    "inbounds": [{
        "tag": "main-in",
        "listen": "0.0.0.0",
        "port": 8443,
        "protocol": "vless",
        "settings": {
            "clients": [{"id": "${DEFAULT_UUID}", "flow": "xtls-rprx-vision"}],
            "decryption": "none"
        },
        "streamSettings": {
            "network": "tcp",
            "security": "tls",
            "tlsSettings": {
                "certificates": [{"certificateFile": "${XRAY_DIR}/fullchain.pem", "keyFile": "${XRAY_DIR}/privkey.pem"}],
                "alpn": ["h2", "http/1.1"]
            }
        },
        "sniffing": {"enabled": true, "destOverride": ["http", "tls"]}
    }],
    "outbounds": [{"tag": "direct", "protocol": "freedom"}, {"tag": "blocked", "protocol": "blackhole"}]
}
XEOF

systemctl enable xray
systemctl restart xray

# ===== 7. PM2 =====
echo "[7/7] Запуск HappVPN..."
npm install -g pm2 2>/dev/null
cd ${APP_DIR}

# Останавливаем если уже работает
pm2 delete happvpn 2>/dev/null || true
systemctl stop nginx caddy 2>/dev/null || true
pm2 start server.js --name happvpn
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# Firewall
ufw allow 80/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true
ufw allow 8443/tcp 2>/dev/null || true
ufw allow 10001:10100/tcp 2>/dev/null || true

ADMIN_PATH=$(node -pe "JSON.parse(require('fs').readFileSync('${APP_DIR}/data.json','utf8')).settings.adminPath")
ADMIN_PASSWORD=$(node -pe "JSON.parse(require('fs').readFileSync('${APP_DIR}/data.json','utf8')).settings.adminPassword || ''")

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   ✅  HappVPN установлен!                ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║                                          ║"
echo "  ║   🌐 Панель: https://${DOMAIN}/${ADMIN_PATH}"
echo "  ║   🔑 Пароль: ${ADMIN_PASSWORD}"
echo "  ║   🔐 Xray:   ${DOMAIN}:8443              "
echo "  ║                                          ║"
echo "  ║   📁 Файлы: ${APP_DIR}                   "
echo "  ║   ⚙️  Xray:   ${XRAY_DIR}/config.json    "
echo "  ║                                          ║"
echo "  ║   Управление:                            ║"
echo "  ║   pm2 logs happvpn                       ║"
echo "  ║   pm2 restart happvpn                    ║"
echo "  ║                                          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Следующий шаг:"
echo "  1. Откройте панель в браузере"
echo "  2. Добавьте шаблоны (VLESS серверы)"  
echo "  3. Создайте подписки"
echo "  4. Relay включится автоматически!"
echo ""
