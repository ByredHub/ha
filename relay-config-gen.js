#!/usr/bin/env node
// ===== HappVPN Relay Config Generator v2 =====
// Генерирует Xray конфиг для relay с Reality (антипалево):
// - Relay inbound: Reality + SNI русского сайта (выглядит как обычный трафик)
// - Relay outbound: подключается к чужим VLESS серверам с их настройками
//
// Использование: node relay-config-gen.js [data.json path] [output config path]

const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const DATA_FILE = process.argv[2] || './data.json';
const OUTPUT = process.argv[3] || '/usr/local/etc/xray/config.json';
const XRAY_DIR = '/usr/local/etc/xray';
const KEYS_FILE = `${XRAY_DIR}/reality-keys.json`;
const BASE_PORT = 10001;

// ===== Русские сайты для маскировки (TLS 1.3 + h2) =====
const RUSSIAN_SNI_SITES = [
    'www.gosuslugi.ru',      // Госуслуги — самый безпалевный
    'www.sberbank.ru',       // Сбербанк
    'www.wildberries.ru',    // Wildberries
    'ozon.ru',               // Озон
    'www.avito.ru',          // Авито
    'mail.ru',               // Mail.ru
    'dzen.ru',               // Дзен
];

// ===== Генерация / загрузка Reality ключей =====
function getOrCreateRealityKeys() {
    // Пробуем загрузить существующие ключи
    if (fs.existsSync(KEYS_FILE)) {
        try {
            const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
            if (keys.privateKey && keys.publicKey) {
                console.log('🔑 Reality ключи загружены из', KEYS_FILE);
                return keys;
            }
        } catch { }
    }

    // Генерируем новые через xray
    console.log('🔑 Генерация новых Reality ключей...');
    try {
        const output = execSync('xray x25519', { encoding: 'utf8' });
        const privMatch = output.match(/Private key:\s*(\S+)/);
        const pubMatch = output.match(/Public key:\s*(\S+)/);

        if (privMatch && pubMatch) {
            const keys = {
                privateKey: privMatch[1],
                publicKey: pubMatch[1],
                shortIds: [
                    crypto.randomBytes(4).toString('hex'),
                    crypto.randomBytes(8).toString('hex')
                ],
                generatedAt: new Date().toISOString()
            };
            fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
            console.log('✅ Ключи сохранены:', KEYS_FILE);
            console.log('📋 Public Key (для клиентов):', keys.publicKey);
            return keys;
        }
    } catch (e) {
        console.error('⚠️  xray x25519 не сработал, генерируем через crypto...');
    }

    // Fallback: генерация через Node.js crypto (x25519)
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
    const privBuf = privateKey.export({ type: 'pkcs8', format: 'der' });
    const pubBuf = publicKey.export({ type: 'spki', format: 'der' });
    // x25519 raw key is last 32 bytes
    const privBase64 = Buffer.from(privBuf.slice(-32)).toString('base64url');
    const pubBase64 = Buffer.from(pubBuf.slice(-32)).toString('base64url');

    const keys = {
        privateKey: privBase64,
        publicKey: pubBase64,
        shortIds: [
            crypto.randomBytes(4).toString('hex'),
            crypto.randomBytes(8).toString('hex')
        ],
        generatedAt: new Date().toISOString()
    };
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
    console.log('✅ Ключи (crypto fallback) сохранены:', KEYS_FILE);
    console.log('📋 Public Key (для клиентов):', keys.publicKey);
    return keys;
}

// ===== Parse VLESS URI =====
function parseVlessUri(uri) {
    try {
        const match = uri.match(/^vless:\/\/([^@]+)@([^:]+):(\d+)\??([^#]*)#?(.*)?$/);
        if (!match) return null;

        const [, uuid, host, port, paramsStr, name] = match;
        const params = {};
        if (paramsStr) {
            paramsStr.split('&').forEach(p => {
                const [k, v] = p.split('=');
                if (k) params[k] = decodeURIComponent(v || '');
            });
        }

        return {
            uuid,
            address: host,
            port: parseInt(port),
            name: name ? decodeURIComponent(name) : `${host}:${port}`,
            security: params.security || 'none',
            type: params.type || 'tcp',
            sni: params.sni || host,
            fp: params.fp || 'chrome',
            pbk: params.pbk || '',
            sid: params.sid || '',
            flow: params.flow || '',
            path: params.path || '',
            hostParam: params.host || '',
            headerType: params.headerType || '',
            alpn: params.alpn || '',
            serviceName: params.serviceName || '',
            encryption: params.encryption || 'none',
            raw: params
        };
    } catch {
        return null;
    }
}

// ===== Build stream settings for outbound (к чужому серверу) =====
function buildOutboundStreamSettings(parsed) {
    const ss = {
        network: parsed.type
    };

    if (parsed.security === 'tls') {
        ss.security = 'tls';
        ss.tlsSettings = {
            serverName: parsed.sni || parsed.address,
            fingerprint: parsed.fp || 'chrome',
            alpn: parsed.alpn ? parsed.alpn.split(',') : ['h2', 'http/1.1']
        };
    } else if (parsed.security === 'reality') {
        ss.security = 'reality';
        ss.realitySettings = {
            serverName: parsed.sni || '',
            fingerprint: parsed.fp || 'chrome',
            publicKey: parsed.pbk || '',
            shortId: parsed.sid || '',
            spiderX: parsed.raw.spx || ''
        };
    } else {
        ss.security = 'none';
    }

    if (parsed.type === 'ws') {
        ss.wsSettings = {
            path: parsed.path || '/',
            headers: parsed.raw.host ? { Host: parsed.raw.host } : {}
        };
    } else if (parsed.type === 'grpc') {
        ss.grpcSettings = {
            serviceName: parsed.serviceName || '',
            multiMode: false
        };
    } else if (parsed.type === 'tcp') {
        if (parsed.headerType === 'http') {
            ss.tcpSettings = {
                header: {
                    type: 'http',
                    request: {
                        path: [parsed.path || '/'],
                        headers: { Host: [parsed.raw.host || parsed.address] }
                    }
                }
            };
        }
    }

    return ss;
}

// ===== Main =====
function generate() {
    if (!fs.existsSync(DATA_FILE)) {
        console.error(`❌ Файл не найден: ${DATA_FILE}`);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const templates = data.templates || [];
    const subscriptions = data.subscriptions || [];
    const settings = data.settings || {};

    // Настройки relay из HappVPN
    let DOMAIN = settings.relayDomain || '';
    if (!DOMAIN && settings.serverUrl) {
        try { DOMAIN = new URL(settings.serverUrl).hostname; } catch { }
    }
    if (!DOMAIN) {
        console.error('❌ Укажите settings.relayDomain или settings.serverUrl в data.json');
        process.exit(1);
    }
    const REALITY_SNI = settings.realitySni || RUSSIAN_SNI_SITES[0]; // по умолчанию gosuslugi
    const REALITY_DEST = settings.realityDest || `${REALITY_SNI}:443`;

    console.log(`\n🛡  HappVPN Relay Config Generator v2`);
    console.log(`📡 Домен: ${DOMAIN}`);
    console.log(`🎭 Reality SNI: ${REALITY_SNI} (маскировка)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Получаем или генерируем Reality ключи
    const realityKeys = getOrCreateRealityKeys();

    // Собираем UUID клиентов из подписок
    const clients = [];
    for (const sub of subscriptions) {
        if (sub.enabled === false) continue;
        if (sub.expiresAt && Date.now() > sub.expiresAt) continue;

        const uuid = crypto.createHash('md5').update(sub.token).digest('hex');
        const formattedUuid = [
            uuid.slice(0, 8),
            uuid.slice(8, 12),
            uuid.slice(12, 16),
            uuid.slice(16, 20),
            uuid.slice(20, 32)
        ].join('-');

        clients.push({
            id: formattedUuid,
            flow: 'xtls-rprx-vision',
            email: sub.name || sub.id
        });
    }

    if (clients.length === 0) {
        clients.push({
            id: crypto.randomUUID(),
            flow: 'xtls-rprx-vision',
            email: 'default'
        });
    }

    // Собираем VLESS серверы из шаблонов
    const relayServers = [];
    let portIndex = 0;

    for (const tpl of templates) {
        if (tpl.enabled === false) continue;
        for (let i = 0; i < (tpl.uris || []).length; i++) {
            const uri = tpl.uris[i];
            if (!uri.startsWith('vless://')) continue;
            // Пропускаем серверы помеченные как "прямой" (без relay)
            if ((tpl.uriDirect || [])[i]) continue;

            const parsed = parseVlessUri(uri);
            if (!parsed) continue;

            relayServers.push({
                tag: `relay-out-${portIndex}`,
                port: BASE_PORT + portIndex,
                name: parsed.name,
                templateName: tpl.name,
                parsed
            });
            portIndex++;
        }
    }

    console.log(`👤 Клиентов: ${clients.length}`);
    console.log(`🌍 Relay серверов: ${relayServers.length}`);

    // ===== BUILD XRAY CONFIG =====
    const inbounds = [];
    const outbounds = [];

    // ── Main inbound (прямой VPN через ваш VPS) ──
    // Тоже Reality — без палева
    inbounds.push({
        tag: 'main-in',
        listen: '0.0.0.0',
        port: parseInt(settings.relayMainPort) || 8443,
        protocol: 'vless',
        settings: {
            clients: clients.map(c => ({ id: c.id, flow: c.flow, email: c.email })),
            decryption: 'none'
        },
        streamSettings: {
            network: 'tcp',
            security: 'reality',
            realitySettings: {
                show: false,
                dest: REALITY_DEST,
                xver: 0,
                serverNames: [REALITY_SNI],
                privateKey: realityKeys.privateKey,
                shortIds: realityKeys.shortIds
            }
        },
        sniffing: { enabled: true, destOverride: ['http', 'tls'] }
    });

    // ── Relay inbounds — каждый порт → свой чужой VLESS ──
    // Все через Reality с русским SNI = невидимо для РКН
    for (const srv of relayServers) {
        inbounds.push({
            tag: `relay-in-${srv.port}`,
            listen: '0.0.0.0',
            port: srv.port,
            protocol: 'vless',
            settings: {
                clients: clients.map(c => ({ id: c.id, flow: 'xtls-rprx-vision', email: c.email })),
                decryption: 'none'
            },
            streamSettings: {
                network: 'tcp',
                security: 'reality',
                realitySettings: {
                    show: false,
                    dest: REALITY_DEST,
                    xver: 0,
                    serverNames: [REALITY_SNI],
                    privateKey: realityKeys.privateKey,
                    shortIds: realityKeys.shortIds
                }
            }
        });
    }

    // ── Outbounds ──
    outbounds.push({
        tag: 'direct',
        protocol: 'freedom'
    });

    for (const srv of relayServers) {
        outbounds.push({
            tag: srv.tag,
            protocol: 'vless',
            settings: {
                vnext: [{
                    address: srv.parsed.address,
                    port: srv.parsed.port,
                    users: [{
                        id: srv.parsed.uuid,
                        encryption: 'none',
                        flow: srv.parsed.flow || ''
                    }]
                }]
            },
            streamSettings: buildOutboundStreamSettings(srv.parsed)
        });
    }

    outbounds.push({
        tag: 'blocked',
        protocol: 'blackhole'
    });

    // ── Routing ──
    const rules = relayServers.map(srv => ({
        type: 'field',
        inboundTag: [`relay-in-${srv.port}`],
        outboundTag: srv.tag
    }));

    const config = {
        log: { loglevel: 'warning' },
        inbounds,
        outbounds,
        routing: {
            rules: [
                ...rules,
                {
                    type: 'field',
                    inboundTag: ['main-in'],
                    outboundTag: 'direct'
                }
            ]
        }
    };

    fs.writeFileSync(OUTPUT, JSON.stringify(config, null, 2));
    console.log(`\n✅ Конфиг сохранён: ${OUTPUT}`);

    // ── Готовые URI для подписок ──
    const sid = realityKeys.shortIds[0];
    const pbk = realityKeys.publicKey;
    const mainPort = parseInt(settings.relayMainPort) || 8443;

    console.log('\n📋 Relay URI для подписок:');
    console.log('━'.repeat(60));

    console.log(`\n🔐 Прямой VPN (ваш IP):
vless://{uuid}@${DOMAIN}:${mainPort}?security=reality&sni=${REALITY_SNI}&fp=chrome&pbk=${pbk}&sid=${sid}&type=tcp&flow=xtls-rprx-vision&encryption=none#🛡 ${DOMAIN}`);

    for (const srv of relayServers) {
        console.log(`\n🌍 ${srv.name} [порт ${srv.port}]:
vless://{uuid}@${DOMAIN}:${srv.port}?security=reality&sni=${REALITY_SNI}&fp=chrome&pbk=${pbk}&sid=${sid}&type=tcp&flow=xtls-rprx-vision&encryption=none#🔄 ${srv.name}`);
    }

    console.log('\n' + '━'.repeat(60));
    console.log('Замените {uuid} на UUID клиента');
    console.log(`\n🎭 Reality маскировка: ${REALITY_SNI}`);
    console.log('   РКН видит: обычное подключение к', REALITY_SNI);
    console.log('   На деле: VPN трафик через ваш сервер');
    console.log(`\n🔄 Перезапуск Xray: systemctl restart xray`);

    // ── Сохраняем маппинг ──
    const mapping = {
        domain: DOMAIN,
        realitySni: REALITY_SNI,
        realityPublicKey: pbk,
        realityShortIds: realityKeys.shortIds,
        mainPort,
        relays: relayServers.map(s => ({
            port: s.port,
            name: s.name,
            template: s.templateName,
            originalUri: s.parsed.address + ':' + s.parsed.port
        })),
        generatedAt: new Date().toISOString()
    };
    const mappingFile = OUTPUT.replace('config.json', 'relay-mapping.json');
    fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));
    console.log('📄 Маппинг сохранён:', mappingFile);
}

generate();
