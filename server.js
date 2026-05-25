const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const dns = require('dns').promises;
const { exec } = require('child_process');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const HTTP_ONLY = process.env.HAPPVPN_HTTP_ONLY === '1' || process.env.FORCE_HTTP === '1';
const HTTP_HOST = process.env.HOST || (HTTP_ONLY ? '127.0.0.1' : '0.0.0.0');

// ===== SECRET ADMIN PATH =====
function getAdminPath() {
    try {
        const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (d.settings && d.settings.adminPath) return d.settings.adminPath;
    } catch { }
    // Generate new random path
    const rnd = crypto.randomBytes(8).toString('hex');
    const adminPath = `panel-${rnd}`;
    try {
        let d = {};
        try { d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { }
        if (!d.settings) d.settings = {};
        d.settings.adminPath = adminPath;
        fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8');
    } catch { }
    return adminPath;
}
const ADMIN_PATH = getAdminPath();

// ===== MIDDLEWARE =====
app.use(express.json({ limit: '50mb' }));

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ===== AUTH =====
const sessions = {};

function generateSession() { return crypto.randomBytes(32).toString('hex'); }

function authMiddleware(req, res, next) {
    const data = loadData();
    const s = data.settings || {};
    // If no password set — skip auth
    if (!s.adminPassword) return next();

    const token = req.cookies?.session || req.headers['x-session'];
    if (token && sessions[token]) return next();

    return res.status(401).json({ error: 'Unauthorized' });
}

// Cookie parser (simple)
app.use((req, res, next) => {
    req.cookies = {};
    const raw = req.headers.cookie || '';
    raw.split(';').forEach(c => {
        const [k, v] = c.trim().split('=');
        if (k) req.cookies[k] = v;
    });
    next();
});

// Login endpoint (no auth required)
app.post('/api/login', (req, res) => {
    const data = loadData();
    const s = data.settings || {};
    const { password } = req.body;

    if (!s.adminPassword) return res.json({ ok: true, session: 'noauth' });

    if (password === s.adminPassword) {
        const session = generateSession();
        sessions[session] = { createdAt: Date.now() };
        res.setHeader('Set-Cookie', `session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
        return res.json({ ok: true, session });
    }

    return res.status(401).json({ error: 'Wrong password' });
});

app.get('/api/auth-check', (req, res) => {
    const data = loadData();
    const s = data.settings || {};
    if (!s.adminPassword) return res.json({ needAuth: false });

    const token = req.cookies?.session || req.headers['x-session'];
    if (token && sessions[token]) return res.json({ needAuth: false });

    return res.json({ needAuth: true });
});

// Static files — served ONLY under secret admin path
app.use(`/${ADMIN_PATH}`, express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// === FAKE COVER SITE — ТСПУ/кто угодно видит обычный сайт ===
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ByRed — IT решения для бизнеса</title>
<meta name="description" content="Разработка веб-приложений, мобильных приложений и облачных решений для малого и среднего бизнеса.">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
.container{max-width:600px;text-align:center;padding:40px 20px}
h1{font-size:2rem;margin-bottom:8px;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub{color:#888;font-size:0.95rem;margin-bottom:32px}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:32px}
.card{background:#151515;border:1px solid #222;border-radius:12px;padding:20px 16px;text-align:left}
.card h3{font-size:0.85rem;margin-bottom:4px;color:#aaa}
.card p{font-size:0.75rem;color:#666}
.footer{color:#444;font-size:0.75rem}
</style>
</head>
<body>
<div class="container">
<h1>ByRed</h1>
<p class="sub">IT решения для бизнеса</p>
<div class="cards">
<div class="card"><h3>🌐 Веб-разработка</h3><p>Сайты и веб-приложения под ключ</p></div>
<div class="card"><h3>📱 Мобильные</h3><p>iOS и Android приложения</p></div>
<div class="card"><h3>☁️ Облако</h3><p>Серверная инфраструктура</p></div>
<div class="card"><h3>🔒 Безопасность</h3><p>Аудит и защита данных</p></div>
</div>
<p class="footer">© ${new Date().getFullYear()} ByRed. Все права защищены.</p>
</div>
</body>
</html>`);
});

// Public access to shop.html (for Telegram Mini App)
app.get('/shop.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'shop.html'));
});

// Auto-detect server URL from first request
function getBaseUrl(req) {
    const data = loadData();
    if (data.settings && data.settings.serverUrl) return data.settings.serverUrl;
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const url = `${proto}://${host}`;
    // Auto-save detected URL
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
        if (!data.settings) data.settings = {};
        data.settings.serverUrl = url;
        saveData(data);
        console.log(`  ✅ serverUrl auto-detected: ${url}`);
    }
    return url;
}

// ===== DATA STORAGE =====
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            if (raw.keys && !raw.templates) {
                raw.templates = migrateKeysToTemplates(raw.keys);
                if (raw.subscriptions) {
                    raw.subscriptions.forEach(sub => {
                        if (sub.keyIds && !sub.templateIds) {
                            sub.templateIds = raw.templates.map(t => t.id);
                            delete sub.keyIds;
                        }
                    });
                }
                delete raw.keys;
                saveData(raw);
            }
            return raw;
        }
    } catch (e) { console.error('Error reading data:', e.message); }
    return { templates: [], subscriptions: [], settings: getDefaultSettings() };
}

function migrateKeysToTemplates(keys) {
    const groups = {};
    for (const key of keys) {
        const name = key.name || 'Default';
        if (!groups[name]) {
            groups[name] = { id: generateId(), name, uris: [], enabled: true, createdAt: key.createdAt || Date.now() };
        }
        if (key.uri) groups[name].uris.push(key.uri);
    }
    return Object.values(groups);
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    // Auto-sync Xray relay config
    if (data.settings?.relayDomain) scheduleRelaySync();
}

// ===== RELAY AUTO-SYNC =====
let relaySyncTimer = null;
function scheduleRelaySync() {
    if (relaySyncTimer) clearTimeout(relaySyncTimer);
    relaySyncTimer = setTimeout(() => syncRelay(), 2000); // debounce 2s
}
// Export for cross-module usage (user-bot.js)
global.scheduleRelaySync = scheduleRelaySync;

function parseVlessUri(uri) {
    try {
        const m = uri.match(/^vless:\/\/([^@]+)@([^:]+):(\d+)\??([^#]*)#?(.*)?$/);
        if (!m) return null;
        const [, uuid, address, port, ps, name] = m;
        const p = {};
        if (ps) ps.split('&').forEach(x => { const [k, v] = x.split('='); if (k) p[k] = decodeURIComponent(v || ''); });
        return { uuid, address, port: parseInt(port), name: name ? decodeURIComponent(name) : address, security: p.security || 'none', type: p.type || 'tcp', sni: p.sni || address, fp: p.fp || 'chrome', pbk: p.pbk || '', sid: p.sid || '', flow: p.flow || '', path: p.path || '', alpn: p.alpn || '', serviceName: p.serviceName || '', headerType: p.headerType || '', raw: p };
    } catch { return null; }
}

function getVlessUriName(uri, fallback = 'Server') {
    if (!uri) return fallback;
    const h = uri.lastIndexOf('#');
    if (h === -1) {
        const parsed = parseVlessUri(uri);
        return parsed?.address || fallback;
    }
    try { return decodeURIComponent(uri.substring(h + 1)) || fallback; }
    catch { return uri.substring(h + 1) || fallback; }
}

function setVlessUriName(uri, name) {
    const h = uri.lastIndexOf('#');
    const base = h > -1 ? uri.substring(0, h) : uri;
    return `${base}#${encodeURIComponent(String(name || 'Server').slice(0, 120))}`;
}

function extractFlagEmoji(text = '') {
    if (!text) return '';
    const str = String(text);
    const flagRegex = /[\u{1F1E6}-\u{1F1FF}]{2}/u;
    const match = str.match(flagRegex);
    return match ? match[0] : '';
}

function formatVlessName(settings = {}, context = {}) {
    const template = String(settings.vlessNameTemplate || '{server}').trim() || '{server}';
    const origFlag = extractFlagEmoji(context.server || '');
    const values = {
        server: context.server || context.host || 'Server',
        template: context.template || '',
        index: context.index || '',
        mode: context.mode || '',
        host: context.host || '',
        port: context.port || '',
        domain: context.domain || settings.relayDomain || '',
        sub: context.sub || '',
        country: context.country || '',
        flag: context.flag || '',
        origflag: origFlag,
        donorflag: origFlag
    };
    const result = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
        const value = values[key] !== undefined ? values[key] : '';
        return String(value);
    }).replace(/\s+/g, ' ').trim();
    return (result || values.server || 'Server').slice(0, 120);
}

function countryCodeToFlag(code = '') {
    const cc = String(code).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return '';
    return [...cc].map(ch => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65)).join('');
}

async function lookupServerGeo(host) {
    if (!host) return null;
    let ip = String(host).trim();
    try {
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
            const resolved = await dns.lookup(ip, { family: 4 });
            ip = resolved.address;
        }
        const geo = await lookupGeo(ip);
        if (!geo) return null;
        return {
            ...geo,
            ip,
            flag: countryCodeToFlag(geo.countryCode)
        };
    } catch {
        return null;
    }
}

async function buildVlessDisplayName(settings, context) {
    const template = String(settings.vlessNameTemplate || '{server}');
    if (!/\{(?:country|flag)\}/i.test(template)) return formatVlessName(settings, context);
    const geo = await lookupServerGeo(context.host || context.server || context.domain);
    return formatVlessName(settings, {
        ...context,
        country: geo?.country || '',
        flag: geo?.flag || ''
    });
}

function buildStream(p) {
    const s = { network: p.type };
    if (p.security === 'tls') { s.security = 'tls'; s.tlsSettings = { serverName: p.sni || p.address, fingerprint: p.fp || 'chrome', alpn: p.alpn ? p.alpn.split(',') : ['h2', 'http/1.1'] }; }
    else if (p.security === 'reality') { s.security = 'reality'; s.realitySettings = { serverName: p.sni, fingerprint: p.fp || 'chrome', publicKey: p.pbk, shortId: p.sid, spiderX: p.raw.spx || '' }; }
    else { s.security = 'none'; }
    if (p.type === 'ws') s.wsSettings = { path: p.path || '/', headers: p.raw.host ? { Host: p.raw.host } : {} };
    else if (p.type === 'grpc') s.grpcSettings = { serviceName: p.serviceName, multiMode: false };
    else if (p.type === 'tcp' && p.headerType === 'http') s.tcpSettings = { header: { type: 'http', request: { path: [p.path || '/'], headers: { Host: [p.raw.host || p.address] } } } };
    // TCP Keep-Alive: не даёт провайдеру сбрасывать долгие соединения
    s.sockopt = { tcpKeepAliveInterval: 30 };
    return s;
}

// Simple YAML serializer (no dependency needed)
function serializeYaml(obj, indent = 0) {
    const pad = '  '.repeat(indent);
    let out = '';
    for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) continue;
        if (Array.isArray(value)) {
            if (value.length === 0) { out += `${pad}${key}: []\n`; continue; }
            if (typeof value[0] === 'object') {
                out += `${pad}${key}:\n`;
                for (const item of value) {
                    out += `${pad}  - `;
                    const lines = serializeYaml(item, indent + 2).split('\n').filter(l => l.trim());
                    out += lines.map((l, i) => i === 0 ? l.trimStart() : `${pad}    ${l.trimStart()}`).join('\n') + '\n';
                }
            } else {
                out += `${pad}${key}:\n`;
                for (const item of value) out += `${pad}  - ${JSON.stringify(item)}\n`;
            }
        } else if (typeof value === 'object') {
            out += `${pad}${key}:\n` + serializeYaml(value, indent + 1);
        } else if (typeof value === 'string') {
            out += `${pad}${key}: ${/[:{}\[\],&*#?|<>=!%@`]/.test(value) ? JSON.stringify(value) : value}\n`;
        } else {
            out += `${pad}${key}: ${value}\n`;
        }
    }
    return out;
}

// ===== REALITY KEYS MANAGEMENT =====
function getOrCreateRealityKeys(s) {
    const XRAY_DIR = '/usr/local/etc/xray';
    const KEYS_FILE = `${XRAY_DIR}/reality-keys.json`;

    // If keys are stored in settings, use those
    if (s.realityPrivateKey && s.realityPublicKey) {
        return {
            privateKey: s.realityPrivateKey,
            publicKey: s.realityPublicKey,
            shortIds: s.realityShortIds ? s.realityShortIds.split(',').map(x => x.trim()) : [crypto.randomBytes(4).toString('hex'), crypto.randomBytes(8).toString('hex')]
        };
    }

    // Try loading from file
    try {
        if (fs.existsSync(KEYS_FILE)) {
            const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
            if (keys.privateKey && keys.publicKey) {
                console.log('  🔑 Reality keys loaded from', KEYS_FILE);
                return keys;
            }
        }
    } catch { }

    // Generate via xray x25519
    try {
        const output = require('child_process').execSync('xray x25519', { encoding: 'utf8' });
        const privMatch = output.match(/Private key:\s*(\S+)/);
        const pubMatch = output.match(/Public key:\s*(\S+)/);
        if (privMatch && pubMatch) {
            const keys = {
                privateKey: privMatch[1],
                publicKey: pubMatch[1],
                shortIds: [crypto.randomBytes(4).toString('hex'), crypto.randomBytes(8).toString('hex')],
                generatedAt: new Date().toISOString()
            };
            try { fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2)); } catch { }
            console.log('  ✅ Reality keys generated via xray x25519');
            console.log('  📋 Public Key:', keys.publicKey);
            return keys;
        }
    } catch { }

    // Fallback: Node.js crypto x25519
    try {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
        const privBuf = privateKey.export({ type: 'pkcs8', format: 'der' });
        const pubBuf = publicKey.export({ type: 'spki', format: 'der' });
        const keys = {
            privateKey: Buffer.from(privBuf.slice(-32)).toString('base64url'),
            publicKey: Buffer.from(pubBuf.slice(-32)).toString('base64url'),
            shortIds: [crypto.randomBytes(4).toString('hex'), crypto.randomBytes(8).toString('hex')],
            generatedAt: new Date().toISOString()
        };
        try { fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2)); } catch { }
        console.log('  ✅ Reality keys generated via crypto fallback');
        console.log('  📋 Public Key:', keys.publicKey);
        return keys;
    } catch (e) {
        console.log('  ⚠️  Failed to generate Reality keys:', e.message);
        return null;
    }
}

function syncRelay() {
    try {
        const data = loadData();
        const s = data.settings || {};
        if (!s.relayDomain) return;

        const XRAY_DIR = '/usr/local/etc/xray';
        const mainPort = parseInt(s.relayMainPort) || 8443;
        const realitySni = s.realitySni || 'www.gosuslugi.ru';
        const realityDest = `${realitySni}:443`;

        // Get or generate Reality keys
        const realityKeys = getOrCreateRealityKeys(s);
        if (!realityKeys) {
            console.log('  ⚠️  Cannot sync relay: no Reality keys');
            return;
        }

        // Save keys back to settings if not there
        if (!s.realityPublicKey || s.realityPublicKey !== realityKeys.publicKey) {
            s.realityPrivateKey = realityKeys.privateKey;
            s.realityPublicKey = realityKeys.publicKey;
            s.realityShortIds = realityKeys.shortIds.join(',');
            data.settings = s;
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        }

        // Active subscriptions
        const activeSubs = (data.subscriptions || []).filter(sub => {
            if (sub.enabled === false) return false;
            if (sub.expiresAt && Date.now() > sub.expiresAt) return false;
            return true;
        });

        // Relay servers from templates (skip direct ones)
        const relays = [];
        let idx = 0;
        for (const tpl of (data.templates || [])) {
            if (tpl.enabled === false) continue;
            for (let i = 0; i < (tpl.uris || []).length; i++) {
                const uri = tpl.uris[i];
                if (!uri.startsWith('vless://')) continue;
                if ((tpl.uriDirect || [])[i]) { idx++; continue; }
                const p = parseVlessUri(uri);
                if (!p) continue;
                relays.push({ tag: `r-out-${idx}`, idx, parsed: p });
                idx++;
            }
        }

        // === SINGLE PORT ARCHITECTURE ===
        // Один порт 8443, маршрутизация по UUID (email) → нужный relay outbound
        // Каждая подписка получает: 1 UUID для прямого VPN + N UUID по одному на каждый relay сервер

        function makeUuid(seed) {
            const h = crypto.createHash('md5').update(seed).digest('hex');
            return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-');
        }

        const allClients = [];
        // Маппинг: relay index → список email'ов для роутинга
        const relayUserMap = {};
        for (let ri = 0; ri < relays.length; ri++) {
            relayUserMap[ri] = [];
        }

        for (const sub of activeSubs) {
            // Прямой VPN (direct) — оригинальный UUID + Vision flow
            const directUuid = makeUuid(sub.token);
            allClients.push({ id: directUuid, flow: 'xtls-rprx-vision', email: `sub-${sub.id}-direct`, level: 0 });

            // Per-relay UUID — БЕЗ flow (чужой сервер может уже использовать Vision → конфликт)
            for (let ri = 0; ri < relays.length; ri++) {
                const relayUuid = makeUuid(sub.token + ':relay:' + relays[ri].idx);
                const email = `sub-${sub.id}-relay-${relays[ri].idx}`;
                allClients.push({ id: relayUuid, email, level: 0 });
                relayUserMap[ri].push(email);
            }
        }

        // Default client if no subs
        if (allClients.length === 0) {
            allClients.push({ id: crypto.randomUUID(), flow: 'xtls-rprx-vision', email: 'default', level: 0 });
        }

        // Reality stream settings
        const realityInboundStream = {
            network: 'tcp',
            security: 'reality',
            realitySettings: {
                show: false,
                dest: realityDest,
                xver: 0,
                serverNames: [realitySni],
                privateKey: realityKeys.privateKey,
                shortIds: realityKeys.shortIds
            }
        };

        // === ONE INBOUND on port 8443 — all VPN traffic ===
        const inbounds = [{
            tag: 'vpn-in', listen: '0.0.0.0', port: mainPort, protocol: 'vless',
            settings: { clients: allClients, decryption: 'none' },
            streamSettings: { ...realityInboundStream },
            sniffing: { enabled: true, destOverride: ['http', 'tls'] }
        }];

        // API inbound for stats
        inbounds.push({
            tag: 'api-in', listen: '127.0.0.1', port: 10085,
            protocol: 'dokodemo-door',
            settings: { address: '127.0.0.1' }
        });

        // Outbounds
        const outbounds = [{ tag: 'direct', protocol: 'freedom' }];
        for (const r of relays) {
            const stream = buildStream(r.parsed);
            stream.sockopt = {
                ...(stream.sockopt || {}),
                tcpKeepAliveInterval: 30
            };
            outbounds.push({
                tag: r.tag, protocol: 'vless',
                settings: { vnext: [{ address: r.parsed.address, port: r.parsed.port, users: [{ id: r.parsed.uuid, encryption: 'none', flow: r.parsed.flow || '' }] }] },
                streamSettings: stream
            });
        }
        outbounds.push({ tag: 'blocked', protocol: 'blackhole' });
        outbounds.push({ tag: 'api', protocol: 'freedom' });

        // Fragment outbound — дробит TLS handshake для обхода DPI
        outbounds.push({
            tag: 'fragment-out',
            protocol: 'freedom',
            settings: {
                fragment: {
                    packets: 'tlshello',
                    length: '10-50',
                    interval: '10-30'
                }
            }
        });

        // === ROUTING: по user email → нужный outbound ===
        const rules = [{ type: 'field', inboundTag: ['api-in'], outboundTag: 'api' }];

        // Blocked IPs
        const blockedIps = data.blockedIps || [];
        if (blockedIps.length > 0) {
            rules.push({ type: 'field', source: blockedIps, outboundTag: 'blocked' });
        }

        // Каждый relay outbound — по списку user email
        for (let ri = 0; ri < relays.length; ri++) {
            if (relayUserMap[ri].length > 0) {
                rules.push({
                    type: 'field',
                    user: relayUserMap[ri],
                    outboundTag: relays[ri].tag
                });
            }
        }

        // Всё остальное (direct UUID) → freedom
        rules.push({ type: 'field', inboundTag: ['vpn-in'], outboundTag: 'direct' });

        const config = {
            log: { loglevel: 'warning', access: '/var/log/xray/access.log' },
            dns: {
                servers: [
                    { address: 'https://dns.google/dns-query', domains: ['geosite:geolocation-!cn'] },
                    { address: 'https://1.1.1.1/dns-query', domains: ['geosite:geolocation-!cn'] },
                    'localhost'
                ],
                queryStrategy: 'UseIPv4'
            },
            stats: {},
            api: { tag: 'api', services: ['StatsService'] },
            policy: {
                levels: { '0': { statsUserUplink: true, statsUserDownlink: true } },
                system: { statsInboundDownlink: true, statsInboundUplink: true, statsOutboundDownlink: true, statsOutboundUplink: true }
            },
            inbounds, outbounds,
            routing: { rules }
        };

        // Write & restart
        const configPath = `${XRAY_DIR}/config.json`;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        require('child_process').exec('systemctl restart xray', (err) => {
            if (err) console.log('  ⚠️  Xray restart failed:', err.message);
            else console.log(`  🔄 Xray synced (1 port:${mainPort}, Reality:${realitySni}): ${activeSubs.length} subs, ${relays.length} relays, ${allClients.length} clients`);
        });
    } catch (e) { console.log('  ⚠️  Relay sync error:', e.message); }
}


// ===== TEMPLATE SYNC ENGINE =====
function fetchUrl(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers, timeout: 15000 }, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
            }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function syncTemplate(tpl) {
    if (!tpl.syncUrl) return false;
    try {
        const hwid = tpl.syncHwid || crypto.createHash('md5').update('happvpn-' + tpl.id).digest('hex');
        const headers = {
            'User-Agent': 'Happ/2.9.6 (iOS; iPhone15,2; 17.4.1)',
            'Accept': '*/*',
            'X-HWID': hwid
        };
        const raw = await fetchUrl(tpl.syncUrl, headers);
        if (!raw || raw.length < 10) return false;

        // Try base64 decode
        let decoded;
        try { decoded = Buffer.from(raw.trim(), 'base64').toString('utf8'); } catch { decoded = raw; }

        // Extract vless:// lines
        const lines = decoded.split('\n').map(l => l.trim()).filter(l => l.startsWith('vless://'));
        if (lines.length === 0) return false;

        // Build map of old URI identity → settings. Donor subscriptions may rotate UUIDs,
        // so use server/transport identity instead of the full VLESS link.
        const oldNames = tpl.uriNames || [];
        const getBase = (uri) => { const h = uri.lastIndexOf('#'); return h > -1 ? uri.substring(0, h) : uri; };
        const getStableKey = (uri) => {
            const parsed = parseVlessUri(uri);
            if (!parsed) return getBase(uri);
            const raw = parsed.raw || {};
            return [
                parsed.address,
                parsed.port,
                parsed.security,
                parsed.type,
                parsed.sni,
                parsed.pbk,
                parsed.sid,
                parsed.path,
                parsed.serviceName,
                parsed.headerType,
                raw.host || '',
                raw.authority || ''
            ].join('|');
        };
        // Map: stable server key / base (without #name) → custom name
        const customNameByKey = {};
        const customNameByBase = {};
        (tpl.uris || []).forEach((uri, i) => {
            if (oldNames[i]) {
                customNameByKey[getStableKey(uri)] = oldNames[i];
                customNameByBase[getBase(uri)] = oldNames[i];
            }
        });

        // Check if base URIs actually changed (ignore name changes)
        const oldBases = (tpl.uris || []).map(getBase).sort().join('\n');
        const newBases = lines.map(getBase).sort().join('\n');
        if (oldBases === newBases) {
            tpl.lastSynced = Date.now();
            return false; // no changes
        }

        // Apply custom names to new URIs where base matches
        const newNames = [];
        for (let i = 0; i < lines.length; i++) {
            const base = getBase(lines[i]);
            const key = getStableKey(lines[i]);
            if (customNameByKey[key]) newNames[i] = customNameByKey[key];
            else if (customNameByBase[base]) newNames[i] = customNameByBase[base];
        }

        // Also preserve uriDirect settings by matching stable server identity.
        const oldDirectByKey = {};
        const oldDirectByBase = {};
        const oldDirectByIndex = tpl.uriDirect || [];
        (tpl.uris || []).forEach((uri, i) => {
            if (oldDirectByIndex[i]) {
                oldDirectByKey[getStableKey(uri)] = true;
                oldDirectByBase[getBase(uri)] = true;
            }
        });
        const newDirect = lines.map((uri, i) => {
            const key = getStableKey(uri);
            const base = getBase(uri);
            return !!(oldDirectByKey[key] || oldDirectByBase[base] || oldDirectByIndex[i]);
        });

        tpl.uris = lines;
        tpl.uriNames = newNames;
        tpl.uriDirect = newDirect;
        tpl.lastSynced = Date.now();
        console.log(`  🔄 Template "${tpl.name}" synced: ${lines.length} servers`);
        return true; // changed
    } catch (e) {
        console.log(`  ⚠️  Sync failed for "${tpl.name}": ${e.message}`);
        return false;
    }
}

async function runSyncAll() {
    let data = loadData();
    const tpls = (data.templates || []).filter(t => t.syncUrl);
    if (tpls.length === 0) return;

    let changed = false;
    for (const tpl of tpls) {
        const intervalMs = (tpl.syncInterval || 12) * 3600000;
        const lastSync = tpl.lastSynced || 0;
        if (Date.now() - lastSync < intervalMs) continue;

        const didChange = await syncTemplate(tpl);

        // IMPORTANT: reload data after each sync to not overwrite
        // device registrations that /sub may have saved during fetch
        data = loadData();
        const freshTpl = (data.templates || []).find(t => t.id === tpl.id);
        if (freshTpl) {
            freshTpl.uris = tpl.uris;
            freshTpl.uriNames = tpl.uriNames;
            freshTpl.uriDirect = tpl.uriDirect;
            freshTpl.lastSynced = tpl.lastSynced;
            saveData(data);
        }
        if (didChange) changed = true;
    }

    if (changed) {
        scheduleRelaySync();
    }
}

// Run sync check every 10 minutes
setInterval(runSyncAll, 600000);
// Also run on startup after 10 seconds
setTimeout(runSyncAll, 10000);

// Manual sync endpoint
app.post('/api/templates/:id/sync', authMiddleware, async (req, res) => {
    const data = loadData();
    const tpl = (data.templates || []).find(t => t.id === req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Not found' });
    if (!tpl.syncUrl) return res.status(400).json({ error: 'No sync URL configured' });

    const didChange = await syncTemplate(tpl);
    saveData(data);
    if (didChange) scheduleRelaySync();
    res.json({ ok: true, changed: didChange, count: (tpl.uris || []).length, lastSynced: tpl.lastSynced });
});

// ===== AUTO-DISABLE EXPIRED SUBSCRIPTIONS =====
async function checkExpiredSubscriptions() {
    const data = loadData();
    const now = Date.now();
    let changed = false;

    for (const sub of (data.subscriptions || [])) {
        if (sub.enabled === false) continue;

        let reason = null;

        // Check expiration
        if (sub.expiresAt && now > sub.expiresAt) {
            reason = '⏰ Срок истёк';
        }

        // Check traffic limit
        if (!reason && sub.trafficTotal > 0 && (sub.trafficUsed || 0) >= sub.trafficTotal) {
            reason = '📊 Лимит трафика исчерпан';
        }

        if (reason) {
            sub.enabled = false;
            sub.autoDisabledAt = now;
            sub.autoDisableReason = reason;
            changed = true;
            console.log(`  ⏰ Auto-disabled "${sub.name}": ${reason}`);

            // If trial subscription with 3DH device — delete device and template
            if (sub.isTrial && sub.threeDhDeviceId) {
                const settings = data.settings || {};
                deleteThreeDhDevice(settings, sub.threeDhDeviceId).then(ok => {
                    console.log(`  3DH trial device ${sub.threeDhDeviceId} delete: ${ok ? 'ok' : 'failed'}`);
                }).catch(e => {
                    console.log(`  3DH trial device delete error: ${e.message}`);
                });
                // Remove 3DH template from data
                if (sub.threeDhTemplateId) {
                    data.templates = (data.templates || []).filter(t => t.id !== sub.threeDhTemplateId);
                }
                sub.threeDhDeviceId = null;
                sub.threeDhTemplateId = null;
            }

            // Telegram notification
            if (global.happBot) {
                const s = data.settings || {};
                const adminIds = (s.adminIds || process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
                const msg = `⏰ *Подписка отключена*\n\n` +
                    `📋 ${sub.name || '—'}\n` +
                    `❌ ${reason}\n` +
                    `📅 ${sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ru-RU') : '—'}`;
                adminIds.forEach(id => {
                    try { global.happBot.sendMessage(id, msg, { parse_mode: 'Markdown' }); } catch { }
                });
            }
        }
    }

    if (changed) saveData(data);
}

// Check every hour
setInterval(() => checkExpiredSubscriptions().catch(e => console.log('checkExpiredSubscriptions error:', e.message)), 3600000);
// Also check on startup after 15 seconds
setTimeout(() => checkExpiredSubscriptions().catch(e => console.log('checkExpiredSubscriptions error:', e.message)), 15000);

// ===== MIGRATE EXISTING TRIAL SUBS TO 3DH =====
async function migrateTrialSubsTo3DH() {
    const data = loadData();
    const s = data.settings || {};
    if (!isThreeDhConfigured(s)) return;

    const now = Date.now();
    const trials = (data.subscriptions || []).filter(sub =>
        sub.isTrial &&
        sub.enabled !== false &&
        (!sub.expiresAt || sub.expiresAt > now) &&
        !sub.threeDhDeviceId
    );

    if (!trials.length) return;
    console.log(`  3DH migration: found ${trials.length} trial subs without 3DH device`);

    for (const sub of trials) {
        const userId = (sub.telegramUsers || [])[0] || 'unknown';
        let device = null;

        // Try up to 2 times per sub (retry on timeout)
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const order = { id: sub.id, userId: String(userId), username: '', firstName: '' };
                const plan = { name: 'Trial', useThreeDh: true };
                device = await createThreeDhDevice(s, order, plan);
                break;
            } catch (e) {
                console.log(`  3DH migration error for sub ${sub.id} (attempt ${attempt}): ${e.message}`);
                if (attempt < 2) await new Promise(r => setTimeout(r, 8000));
            }
        }

        if (!device || !device.configs || !device.configs.length) {
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        // Remove old non-3DH template
        if (sub.templateIds && sub.templateIds.length) {
            data.templates = (data.templates || []).filter(t =>
                !sub.templateIds.includes(t.id) || t.threeDh
            );
        }

        const tplId = generateId();
        const template = {
            id: tplId,
            name: `Trial-${userId}`,
            uris: device.configs,
            uriDirect: device.configs.map(() => true),
            uriNames: [],
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            threeDh: {
                deviceId: device.deviceId,
                deviceName: device.name,
                serverId: device.serverId,
                serverName: device.serverName,
                sourceUrl: device.sourceUrl || '',
                orderId: sub.id
            }
        };
        if (!data.templates) data.templates = [];
        data.templates.push(template);

        sub.templateIds = [tplId];
        sub.threeDhDeviceId = device.deviceId;
        sub.threeDhTemplateId = tplId;

        saveData(data);
        console.log(`  3DH migration: sub ${sub.id} (user ${userId}) → device ${device.deviceId}`);

        // Pause between devices to avoid 3DH rate limiting
        await new Promise(r => setTimeout(r, 6000));
    }

    console.log('  3DH migration: done');
}

// Run migration 30 seconds after startup
setTimeout(() => migrateTrialSubsTo3DH().catch(e => console.log('3DH migration error:', e.message)), 30000);

// ===== EXPIRATION NOTIFICATIONS =====
function checkExpirationNotifications() {
    const data = loadData();
    const now = Date.now();
    const s = data.settings || {};
    const notifyDays = s.expireNotifyDays || [3, 2, 1];
    const notifyAfter = s.expireNotifyAfter !== false;
    const userBot = global.happUserBot;
    if (!userBot) return;

    const notifiedKey = (sub, days) => `notified_${sub.id}_${days}`;
    const notifiedAfterKey = (sub) => `notified_after_${sub.id}_${new Date().toDateString()}`;

    for (const sub of (data.subscriptions || [])) {
        if (!sub.expiresAt || sub.enabled === false) continue;
        if (!sub.telegramUsers || sub.telegramUsers.length === 0) continue;

        const daysLeft = Math.ceil((sub.expiresAt - now) / 86400000);

        // Notify before expiration
        for (const days of notifyDays) {
            if (daysLeft === days && !sub[notifiedKey(sub, days)]) {
                sub[notifiedKey(sub, days)] = true;
                const msg = `⏰ *Подписка истекает через ${days} ${days === 1 ? 'день' : 'дня'}!*\n\n📋 ${sub.name}\n📅 До: ${new Date(sub.expiresAt).toLocaleDateString('ru-RU')}\n\nПродлите подписку, чтобы не потерять доступ.`;
                for (const uid of sub.telegramUsers) {
                    userBot.sendMessage(parseInt(uid), msg, { parse_mode: 'Markdown' }).catch(() => { });
                }
            }
        }

        // Notify after expiration (once per day)
        if (notifyAfter && daysLeft < 0) {
            if (!sub[notifiedAfterKey(sub)]) {
                sub[notifiedAfterKey(sub)] = true;
                const msg = `🔴 *Подписка истекла!*\n\n📋 ${sub.name}\n📅 Истекла: ${new Date(sub.expiresAt).toLocaleDateString('ru-RU')}\n\nПродлите подписку для восстановления доступа.`;
                for (const uid of sub.telegramUsers) {
                    userBot.sendMessage(parseInt(uid), msg, { parse_mode: 'Markdown' }).catch(() => { });
                }
            }
        }
    }

    saveData(data);
}

// Check notifications every hour
setInterval(checkExpirationNotifications, 3600000);
setTimeout(checkExpirationNotifications, 20000);

function getDefaultSettings() {
    return {
        title: 'HappVPN', supportUrl: '', website: '', updateInterval: 12, serverUrl: '', adminPassword: '', botDeepLink: '',
        vlessNameTemplate: '{server}',
        stubTitle: '⛔ Доступ ограничен', stubDisabled: 'Подписка деактивирована', stubExpired: 'Подписка истекла',
        stubDeviceLimit: 'Лимит устройств исчерпан', stubNotFound: 'Подписка не найдена', stubNoToken: 'Токен не указан',
        paymentMethod: '', paymentInfo: '', paymentMethods: [],
        yookassaEnabled: false, yookassaShopId: '', yookassaSecretKey: '', yookassaDescription: 'Оплата картой или СБП через YooKassa',
        plategaEnabled: false, plategaMerchantId: '', plategaSecretKey: '', plategaPaymentMethod: 11, plategaDescription: 'Оплата картой или СБП через Platega',
        requiredChannelsEnabled: false, requiredChannels: '',
        threeDhEnabled: false, threeDhPin: '', threeDhMode: 7, threeDhDeviceType: 2, threeDhProtocol: 'vless', threeDhLocationId: '', threeDhNameTemplate: 'HappVPN-{userId}-{order}',
        notifySuspiciousIp: true,
        // Referral system: rubles instead of days
        referralBonusRub: 40,
        // Trial subscription
        trialDays: 0,
        trialTemplateIds: [],
        // App download links
        appLinks: {
            happIos: 'https://apps.apple.com/app/id6504287215',
            streisandIos: 'https://apps.apple.com/app/streisand/id6450534064',
            v2rayAndroid: 'https://play.google.com/store/apps/details?id=com.v2ray.ang',
            nekorayDesktop: 'https://github.com/MatsuriDayo/nekoray/releases'
        },
        // Expiration notifications (days before)
        expireNotifyDays: [3, 2, 1],
        expireNotifyAfter: true
    };
}

function normalizePaymentMethods(s = {}) {
    const list = Array.isArray(s.paymentMethods) ? s.paymentMethods : [];
    const normalized = list.map((m, i) => ({
        id: String(m.id || m.provider || `method_${i}`).slice(0, 64),
        provider: String(m.provider || m.id || 'custom').slice(0, 64),
        name: String(m.name || m.title || 'Способ оплаты').slice(0, 80),
        methods: String(m.methods || '').slice(0, 120),
        currency: String(m.currency || s.currency || '₽').slice(0, 24),
        info: String(m.info || '').slice(0, 2000),
        enabled: m.enabled !== false
    })).filter(m => m.name || m.info);

    if (normalized.length) return normalized;
    if (s.paymentMethod || s.paymentInfo) {
        return [{
            id: 'manual_card',
            provider: 'manual_card',
            name: s.paymentMethod || 'Оплата',
            methods: '',
            currency: s.currency || '₽',
            info: s.paymentInfo || '',
            enabled: true
        }];
    }
    return [];
}

function isYooKassaConfigured(s = {}) {
    return !!(s.yookassaEnabled && s.yookassaShopId && s.yookassaSecretKey);
}

function isPlategaConfigured(s = {}) {
    return !!(s.plategaEnabled && s.plategaMerchantId && s.plategaSecretKey);
}

function isThreeDhConfigured(s = {}) {
    return !!(s.threeDhEnabled && s.threeDhPin);
}

function parseRequiredChannels(settings = {}) {
    if (settings.requiredChannelsEnabled === false) return [];
    const raw = settings.requiredChannels || '';
    const lines = Array.isArray(raw) ? raw : String(raw).split(/\r?\n|,/);
    return lines.map(line => {
        const parts = String(line || '').split('|').map(p => p.trim()).filter(Boolean);
        if (!parts[0]) return null;

        let chat = parts[0];
        let title = parts[1] || '';
        let url = parts[2] || '';
        const publicMatch = chat.match(/^https?:\/\/t\.me\/([A-Za-z0-9_]+)\/?$/i);
        if (publicMatch) {
            chat = `@${publicMatch[1]}`;
            if (!url) url = parts[0];
        }
        if (!url && chat.startsWith('@')) url = `https://t.me/${chat.slice(1)}`;
        if (!title) title = chat.startsWith('@') ? chat : 'Telegram канал';

        return { chat, title, url };
    }).filter(Boolean);
}

function publicRequiredChannels(settings = {}) {
    return parseRequiredChannels(settings).map(c => ({ title: c.title, url: c.url, chat: c.chat }));
}

function isTelegramMember(member = {}) {
    return ['creator', 'administrator', 'member'].includes(member.status) || (member.status === 'restricted' && member.is_member);
}

async function checkRequiredChannels(userId, settings = {}, bot = global.happUserBot) {
    const channels = parseRequiredChannels(settings);
    if (!channels.length) return { ok: true, missing: [], channels: [] };
    if (!bot || !bot.getChatMember) return { ok: false, missing: channels, channels };

    const missing = [];
    for (const channel of channels) {
        try {
            const member = await bot.getChatMember(channel.chat, parseInt(userId));
            if (!isTelegramMember(member)) missing.push(channel);
        } catch {
            missing.push(channel);
        }
    }

    return { ok: missing.length === 0, missing, channels };
}

async function ensureRequiredChannelsForShop(req, res, userId, data = null) {
    const current = data || loadData();
    const result = await checkRequiredChannels(userId, current.settings || {});
    if (result.ok) return true;
    res.status(403).json({
        ok: false,
        error: 'subscribe_required',
        requiredSubscription: {
            required: true,
            channels: publicRequiredChannels(current.settings || {})
        }
    });
    return false;
}

function secureCompare(a = '', b = '') {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function yookassaRequest(settings, method, apiPath, body = null, idempotenceKey = '') {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const headers = {
            Authorization: 'Basic ' + Buffer.from(`${settings.yookassaShopId}:${settings.yookassaSecretKey}`).toString('base64'),
            Accept: 'application/json',
            'Content-Type': 'application/json'
        };
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
        if (idempotenceKey) headers['Idempotence-Key'] = idempotenceKey;

        const req = https.request({
            hostname: 'api.yookassa.ru',
            path: apiPath,
            method,
            headers,
            timeout: 15000
        }, resp => {
            let raw = '';
            resp.setEncoding('utf8');
            resp.on('data', chunk => raw += chunk);
            resp.on('end', () => {
                let parsed = {};
                try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { raw }; }
                if (resp.statusCode >= 200 && resp.statusCode < 300) return resolve(parsed);
                const message = parsed.description || parsed.message || `YooKassa HTTP ${resp.statusCode}`;
                const err = new Error(message);
                err.response = parsed;
                err.statusCode = resp.statusCode;
                reject(err);
            });
        });
        req.on('timeout', () => req.destroy(new Error('YooKassa request timeout')));
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function plategaRequest(settings, method, apiPath, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-MerchantId': settings.plategaMerchantId,
            'X-Secret': settings.plategaSecretKey
        };
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

        const req = https.request({
            hostname: 'app.platega.io',
            path: apiPath,
            method,
            headers,
            timeout: 15000
        }, resp => {
            let raw = '';
            resp.setEncoding('utf8');
            resp.on('data', chunk => raw += chunk);
            resp.on('end', () => {
                let parsed = {};
                try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { raw }; }
                if (resp.statusCode >= 200 && resp.statusCode < 300) return resolve(parsed);
                const message = parsed.description || parsed.message || parsed.error || `Platega HTTP ${resp.statusCode}`;
                const err = new Error(message);
                err.response = parsed;
                err.statusCode = resp.statusCode;
                reject(err);
            });
        });
        req.on('timeout', () => req.destroy(new Error('Platega request timeout')));
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function updateCookieJar(jar, setCookieHeaders = []) {
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders].filter(Boolean);
    for (const header of headers) {
        const pair = String(header).split(';')[0];
        const eq = pair.indexOf('=');
        if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
}

function getCookieHeader(jar) {
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function decodeHtmlAttr(value = '') {
    return String(value)
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function extractHiddenInput(html, name) {
    const re = new RegExp(`<input[^>]+name=["']${name}["'][^>]*>`, 'i');
    const m = String(html).match(re);
    if (!m) return '';
    const value = m[0].match(/\svalue=["']([^"']*)["']/i);
    return value ? decodeHtmlAttr(value[1]) : '';
}

function stripHtml(html = '') {
    return decodeHtmlAttr(String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractSelectOptions(html, fieldName) {
    const selectRe = new RegExp(`<select[^>]+(?:name|id)=["']${fieldName}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i');
    const select = String(html).match(selectRe);
    if (!select) return [];
    return [...select[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
        .map(match => {
            const value = match[1].match(/\svalue=["']?([^"'\s>]*)/i);
            return {
                value: value ? decodeHtmlAttr(value[1]) : stripHtml(match[2]),
                label: stripHtml(match[2])
            };
        })
        .filter(o => o.value);
}

function resolveThreeDhDeviceType(settings, createHtml) {
    const options = extractSelectOptions(createHtml, 'type');
    const configured = String(settings.threeDhDeviceType || '').trim();
    if (configured && options.some(o => String(o.value) === configured)) return configured;

    const ios = options.find(o => /ios|iphone|ipad|apple|айфон|айос/i.test(`${o.label} ${o.value}`));
    if (ios) {
        if (configured && configured !== String(ios.value)) {
            console.log(`3DH warning: configured device type ${configured} is unavailable, using ${ios.value} (${ios.label})`);
        }
        return ios.value;
    }

    if (configured && !options.length) return configured;
    const available = options.map(o => `${o.value}:${o.label}`).join(', ');
    throw new Error(`3DH iOS device type not found${available ? `. Available types: ${available}` : ''}`);
}

function buildMultipart(fields) {
    const boundary = '----HappVPN3DH' + crypto.randomBytes(12).toString('hex');
    const chunks = [];
    for (const [key, value] of Object.entries(fields)) {
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value ?? ''}\r\n`));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return { boundary, body: Buffer.concat(chunks) };
}

function threeDhRequest(method, pathName, body = null, jar = {}, extraHeaders = {}, redirectDepth = 0) {
    return new Promise((resolve, reject) => {
        const url = new URL(pathName, 'https://ru.3dh.live');
        const headers = {
            Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
            'User-Agent': 'HappVPN/2.0',
            ...extraHeaders
        };
        const cookie = getCookieHeader(jar);
        if (cookie) headers.Cookie = cookie;
        if (body) headers['Content-Length'] = Buffer.byteLength(body);

        const req = https.request({
            hostname: url.hostname,
            path: `${url.pathname}${url.search}`,
            method,
            headers,
            timeout: 20000
        }, resp => {
            updateCookieJar(jar, resp.headers['set-cookie']);
            let raw = '';
            resp.setEncoding('utf8');
            resp.on('data', chunk => raw += chunk);
            resp.on('end', async () => {
                if ([301, 302, 303, 307, 308].includes(resp.statusCode) && resp.headers.location && redirectDepth < 5) {
                    try {
                        const next = await threeDhRequest('GET', resp.headers.location, null, jar, { Referer: url.href }, redirectDepth + 1);
                        return resolve(next);
                    } catch (e) {
                        return reject(e);
                    }
                }
                resolve({ statusCode: resp.statusCode, headers: resp.headers, body: raw, jar });
            });
        });
        req.on('timeout', () => req.destroy(new Error('3DH request timeout')));
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function threeDhLogin(settings) {
    const jar = {};
    const loginPage = await threeDhRequest('GET', '/users/simple-login', null, jar);
    const csrfToken = extractHiddenInput(loginPage.body, 'csrf_token');
    if (!csrfToken) throw new Error('3DH login form did not return csrf_token');

    const payload = new URLSearchParams({
        csrf_token: csrfToken,
        fp: '',
        password: String(settings.threeDhPin || ''),
        action: 'simple_login'
    }).toString();

    await threeDhRequest('POST', '/users/auth', payload, jar, {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://ru.3dh.live',
        Referer: 'https://ru.3dh.live/users/simple-login'
    });
    return jar;
}

function parseThreeDhJson(response, fallbackMessage) {
    try {
        return JSON.parse(response.body);
    } catch {
        throw new Error(fallbackMessage);
    }
}

async function threeDhGetServers(settings, jar) {
    const mode = parseInt(settings.threeDhMode) || 7;
    const resp = await threeDhRequest('GET', `/vpn/get-servers?mode=${encodeURIComponent(mode)}`, null, jar);
    const servers = parseThreeDhJson(resp, '3DH did not return server list as JSON');
    if (!Array.isArray(servers)) throw new Error('3DH server list has unexpected format');
    return servers;
}

function pickThreeDhServer(settings, servers) {
    const configuredId = String(settings.threeDhLocationId || '').trim();
    if (configuredId) {
        const found = servers.find(s => String(s.id) === configuredId);
        if (!found) throw new Error(`3DH location ${configuredId} not found`);
        return found;
    }

    const wantedProto = String(settings.threeDhProtocol || '').trim().toLowerCase();
    const filtered = wantedProto
        ? servers.filter(s => threeDhServerMatchesProtocol(s, wantedProto))
        : servers.slice();
    if (!filtered.length) {
        const available = [...new Set(servers.map(s => [s.type, s.proto, s.protocol, s.name].filter(Boolean).join('/')).filter(Boolean))].slice(0, 12).join(', ');
        if (wantedProto === 'vless' && servers.length) {
            console.log(`3DH warning: no exact VLESS metadata, trying any server. Available: ${available || 'unknown'}`);
            return servers.slice().sort((a, b) => Number(a.client_count || 0) - Number(b.client_count || 0))[0];
        }
        throw new Error(`3DH has no servers for protocol ${wantedProto || 'any'}${available ? `. Available: ${available}` : ''}`);
    }

    return filtered.sort((a, b) => Number(a.client_count || 0) - Number(b.client_count || 0))[0];
}

function threeDhServerMatchesProtocol(server, wantedProto) {
    if (!wantedProto || wantedProto === 'auto' || wantedProto === 'any') return true;
    const fields = [
        server.type,
        server.proto,
        server.protocol,
        server.protocol_name,
        server.name,
        server.title,
        server.location_name,
        server.location_name_ru
    ].map(v => String(v || '').toLowerCase()).filter(Boolean);
    if (fields.some(v => v === wantedProto || v.includes(wantedProto))) return true;
    if (wantedProto === 'vless') return fields.some(v => /xray|reality|xtls|vision/.test(v));
    return false;
}

function formatThreeDhDeviceName(template, order, plan, server) {
    const safeOrder = String(order.id || generateId());
    const name = String(template || 'HappVPN-{userId}-{order}')
        .replace(/\{userId\}/gi, order.userId || '')
        .replace(/\{username\}/gi, order.username || '')
        .replace(/\{firstName\}/gi, order.firstName || '')
        .replace(/\{plan\}/gi, plan.name || order.planName || '')
        .replace(/\{order\}/gi, safeOrder.slice(0, 8))
        .replace(/\{server\}/gi, server.location_name_ru || server.location_name || server.name || server.id || '')
        .replace(/\{country\}/gi, server.location_name_ru || server.location_name || '')
        .replace(/\{proto\}/gi, server.proto || server.type || '')
        .trim()
        .slice(0, 80);
    return name || `HappVPN-${order.userId || safeOrder.slice(0, 8)}`;
}

function extractThreeDhConfig(html, deviceName) {
    const rows = String(html).split(/<tr\b/i);
    for (const row of rows) {
        if (!row.includes(deviceName)) continue;
        const input = row.match(/<input[^>]+(?:class=["'][^"']*vpnString[^"']*["'][^>]*|[^>]*class=["'][^"']*vpnString[^"']*["'])[^>]*>/i);
        const href = row.match(/\shref=["']([^"']*\/vpn\/[^"']+)["']/i);
        if (!input && !href) continue;
        const value = input ? input[0].match(/\svalue=["']([^"']+)["']/i) : null;
        const id = input ? input[0].match(/\sdata-id=["']([^"']+)["']/i) : null;
        return {
            config: value ? decodeHtmlAttr(value[1]) : '',
            deviceId: id ? decodeHtmlAttr(id[1]) : '',
            url: href ? makeThreeDhUrl(decodeHtmlAttr(href[1])) : ''
        };
    }

    const inputs = [...String(html).matchAll(/<input[^>]+(?:class=["'][^"']*vpnString[^"']*["'][^>]*|[^>]*class=["'][^"']*vpnString[^"']*["'])[^>]*>/gi)];
    if (!inputs.length) return null;
    const last = inputs[inputs.length - 1][0];
    const value = last.match(/\svalue=["']([^"']+)["']/i);
    const id = last.match(/\sdata-id=["']([^"']+)["']/i);
    const rowStart = String(html).lastIndexOf('<tr', inputs[inputs.length - 1].index);
    const rowEnd = String(html).indexOf('</tr>', inputs[inputs.length - 1].index);
    const row = rowStart >= 0 && rowEnd > rowStart ? String(html).slice(rowStart, rowEnd) : '';
    const href = row.match(/\shref=["']([^"']*\/vpn\/[^"']+)["']/i);
    return value ? {
        config: decodeHtmlAttr(value[1]),
        deviceId: id ? decodeHtmlAttr(id[1]) : '',
        url: href ? makeThreeDhUrl(decodeHtmlAttr(href[1])) : ''
    } : null;
}

function makeThreeDhUrl(value) {
    if (!value) return '';
    try {
        return new URL(value, 'https://ru.3dh.live').href;
    } catch {
        return '';
    }
}

function maybeDecodeBase64Subscription(raw) {
    const text = String(raw || '').trim();
    if (!text || /^(vless|trojan|ss|vmess):\/\//i.test(text)) return text;
    const compact = text.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=_-]{40,}$/.test(compact)) return text;
    const normalized = compact.replace(/-/g, '+').replace(/_/g, '/');
    try {
        const decoded = Buffer.from(normalized, 'base64').toString('utf8');
        return /vless:\/\//i.test(decoded) ? decoded : text;
    } catch {
        return text;
    }
}

function extractVlessUris(content) {
    const decoded = maybeDecodeBase64Subscription(decodeHtmlAttr(content || ''));
    return [...new Set((decoded.match(/vless:\/\/[^\s"'<>]+/gi) || []).map(u => u.trim()))];
}

async function resolveThreeDhVlessUris(extracted, jar) {
    const direct = extractVlessUris(extracted.config);
    if (direct.length) return { uris: direct, sourceUrl: extracted.url || '' };

    const urls = [];
    const rawConfig = String(extracted.config || '').trim();
    if (/^https?:\/\//i.test(rawConfig) || rawConfig.startsWith('/vpn/')) urls.push(makeThreeDhUrl(rawConfig));
    if (extracted.url) urls.push(extracted.url);

    for (const url of [...new Set(urls.filter(Boolean))]) {
        const variants = [url];
        try {
            const parsed = new URL(url);
            if (parsed.hostname === '3dh.pro') variants.push(`https://ru.3dh.live${parsed.pathname}${parsed.search}`);
        } catch { }

        for (const variant of [...new Set(variants)]) {
            try {
                const resp = await threeDhRequest('GET', variant, null, jar, { Accept: 'text/plain,*/*;q=0.8' });
                const uris = extractVlessUris(resp.body);
                if (uris.length) return { uris, sourceUrl: variant };
            } catch (e) {
                console.log('3DH subscription fetch warning:', e.message);
            }
        }
    }

    const preview = String(extracted.config || extracted.url || '').replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(`3DH device created, but VLESS subscription was not found${preview ? `: ${preview}` : ''}`);
}

async function createThreeDhDevice(settings, order, plan) {
    if (!isThreeDhConfigured(settings)) return null;

    const jar = await threeDhLogin(settings);
    const servers = await threeDhGetServers(settings, jar);
    const server = pickThreeDhServer(settings, servers);
    const name = formatThreeDhDeviceName(settings.threeDhNameTemplate, order, plan, server);
    const createPage = await threeDhRequest('GET', '/vpn/create', null, jar);
    const csrfToken = extractHiddenInput(createPage.body, 'csrf_token');
    const deviceType = resolveThreeDhDeviceType(settings, createPage.body);
    const fields = { name, type: deviceType, location: server.id, mode: parseInt(settings.threeDhMode) || 7 };
    if (csrfToken) fields.csrf_token = csrfToken;
    const multipart = buildMultipart(fields);

    const createResp = await threeDhRequest('POST', '/vpn/create', multipart.body, jar, {
        'Content-Type': `multipart/form-data; boundary=${multipart.boundary}`,
        Origin: 'https://ru.3dh.live',
        Referer: 'https://ru.3dh.live/vpn/create'
    });

    if (createResp.statusCode >= 400) {
        const details = String(createResp.body || '').replace(/\s+/g, ' ').slice(0, 240);
        throw new Error(`3DH create device HTTP ${createResp.statusCode}${details ? `: ${details}` : ''}`);
    }
    const contentType = createResp.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
        const result = parseThreeDhJson(createResp, '3DH create device returned invalid JSON');
        if (result.status === 'error') throw new Error(result.message || '3DH create device failed');
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    const listResp = await threeDhRequest('GET', '/vpn/', null, jar);
    const extracted = extractThreeDhConfig(listResp.body, name);
    if (!extracted || (!extracted.config && !extracted.url)) throw new Error('3DH device created, but config was not found');
    const resolved = await resolveThreeDhVlessUris(extracted, jar);

    return {
        name,
        serverId: server.id,
        serverName: server.location_name_ru || server.location_name || server.name || '',
        protocol: server.type || server.proto || '',
        deviceId: extracted.deviceId,
        sourceUrl: resolved.sourceUrl || extracted.url || '',
        configs: resolved.uris
    };
}

async function deleteThreeDhDevice(settings, deviceId) {
    if (!deviceId) return false;
    if (!isThreeDhConfigured(settings)) return false;
    try {
        const jar = await threeDhLogin(settings);
        const listResp = await threeDhRequest('GET', '/vpn/', null, jar);
        const csrfMatch = String(listResp.body).match(/<input[^>]+name=["']csrf_token["'][^>]+value=["']([^"']+)["']/i);
        const csrfToken = csrfMatch ? csrfMatch[1] : '';
        const payload = new URLSearchParams({ csrf_token: csrfToken }).toString();
        const delResp = await threeDhRequest('POST', `/vpn/delete/${deviceId}`, payload, jar, {
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: 'https://ru.3dh.live',
            Referer: 'https://ru.3dh.live/vpn/'
        });
        console.log(`3DH delete device ${deviceId}: HTTP ${delResp.statusCode}`);
        return delResp.statusCode < 400;
    } catch (e) {
        console.log(`3DH delete device ${deviceId} error: ${e.message}`);
        return false;
    }
}

function mergeIds(...lists) {
    return [...new Set(lists.flat().filter(Boolean))];
}

async function attachThreeDhTemplateForOrder(data, order, plan) {
    const settings = data.settings || {};
    if (!plan || !plan.useThreeDh) return [];
    if (!isThreeDhConfigured(settings)) return [];
    if (order.threeDhTemplateId) return [order.threeDhTemplateId];

    const device = await createThreeDhDevice(settings, order, plan);
    if (!device) return [];

    const template = {
        id: generateId(),
        name: `3DH ${order.userId} ${device.serverName || device.serverId || ''}`.trim(),
        donorUrl: '',
        uris: device.configs,
        uriDirect: device.configs.map(() => true),
        uriNames: [],
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        threeDh: {
            deviceId: device.deviceId,
            deviceName: device.name,
            serverId: device.serverId,
            serverName: device.serverName,
            protocol: device.protocol,
            sourceUrl: device.sourceUrl || '',
            orderId: order.id || ''
        }
    };

    if (!data.templates) data.templates = [];
    data.templates.push(template);
    order.threeDhTemplateId = template.id;
    order.threeDhDeviceId = device.deviceId;
    order.threeDhDeviceName = device.name;
    order.threeDhServerId = device.serverId;
    order.threeDhServerName = device.serverName;
    return [template.id];
}

function makePublicUrl(req, data = null) {
    const s = (data || loadData()).settings || {};
    if (s.serverUrl) return s.serverUrl.replace(/\/+$/, '');
    if (!req) return `http://localhost:${PORT}`;
    return getBaseUrl(req).replace(/\/+$/, '');
}

function activatePlanForUser(data, plan, userId, meta = {}) {
    if (!data.subscriptions) data.subscriptions = [];
    const uid = parseInt(userId);
    const existing = data.subscriptions.find(s => s.telegramUsers && s.telegramUsers.includes(uid) && s.enabled !== false && !s.isTrial);
    const templateIds = mergeIds(plan.templateIds || [], meta.templateIds || []);
    let sub, action;

    if (existing && plan.duration > 0) {
        const base = (existing.expiresAt && existing.expiresAt > Date.now()) ? existing.expiresAt : Date.now();
        existing.expiresAt = base + (plan.duration * 86400000);
        if (plan.traffic > 0) existing.trafficTotal = (existing.trafficTotal || 0) + plan.traffic;
        if (templateIds.length) existing.templateIds = mergeIds(existing.templateIds || [], templateIds);
        existing.notes = (existing.notes || '') + ` | +${plan.duration}д (${plan.name}${meta.note ? ', ' + meta.note : ''})`;
        sub = existing;
        action = 'extended';
    } else {
        sub = {
            id: generateId(),
            name: meta.name || `${plan.name}`,
            trafficTotal: plan.traffic || 0,
            trafficUsed: 0,
            maxDevices: plan.maxDevices || 0,
            token: generateToken(),
            templateIds,
            enabled: true,
            expiresAt: plan.duration > 0 ? Date.now() + (plan.duration * 86400000) : 0,
            notes: meta.note || '',
            devices: [],
            telegramUsers: [uid],
            createdAt: Date.now(),
            accessCount: 0,
            orderId: meta.orderId || ''
        };
        data.subscriptions.push(sub);
        action = 'created';
    }

    return { sub, action };
}

function notifySubscriptionActivated(userId, plan, sub, action, url) {
    if (!global.happUserBot) return;
    const msg = action === 'extended'
        ? `✅ Подписка продлена!\n\n📦 ${plan.name}\n📅 До: ${sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ru-RU') : 'Бессрочно'}\n🔗 ${url}`
        : `🎉 Подписка активирована!\n\n📦 ${plan.name}\n🔗 ${url}\n\nСкопируйте и добавьте в Happ VPN.`;
    global.happUserBot.sendMessage(parseInt(userId), msg).catch(() => { });
}

async function activateOrder(data, order, options = {}) {
    if (!order || order.status === 'completed') return { alreadyCompleted: true, order };
    const basePlan = (data.plans || []).find(p => p.id === order.planId);
    const plan = basePlan ? { ...basePlan, templateIds: mergeIds(basePlan.templateIds || []) } : null;
    if (!plan) throw new Error('Plan not found');
    const threeDhTemplateIds = await attachThreeDhTemplateForOrder(data, order, plan);
    plan.templateIds = mergeIds(plan.templateIds || [], threeDhTemplateIds);

    const { sub, action } = activatePlanForUser(data, plan, order.userId, {
        name: `${plan.name} — ${order.firstName || 'User'}`,
        note: `${options.source || 'Оплата'} | #${order.id.substring(0, 8)} | @${order.username || 'n/a'} | ${order.planName}`,
        orderId: order.id,
        templateIds: threeDhTemplateIds
    });
    order.status = 'completed';
    order.completedAt = Date.now();
    order.subscriptionId = sub.id;
    order.updatedAt = Date.now();

    const baseUrl = options.baseUrl || makePublicUrl(null, data);
    const subUrl = `${baseUrl}/sub?token=${sub.token}`;
    notifySubscriptionActivated(order.chatId || order.userId, plan, sub, action, subUrl);
    if (global.scheduleRelaySync) global.scheduleRelaySync();
    return { order, plan, sub, action, subUrl };
}
global.activateOrder = activateOrder;

function activateTopUpOrder(data, order, options = {}) {
    if (!order || order.status === 'completed') return { alreadyCompleted: true, order };
    const amount = Number(order.amount || order.price || 0);
    if (!amount || amount <= 0) throw new Error('Invalid top-up amount');

    if (!data.shopUsers) data.shopUsers = [];
    let user = data.shopUsers.find(u => u.userId === parseInt(order.userId));
    if (!user) {
        user = {
            userId: parseInt(order.userId),
            balance: 0,
            referralCode: generateId().substring(0, 8),
            balanceHistory: [],
            createdAt: Date.now()
        };
        data.shopUsers.push(user);
    }

    user.balance = (user.balance || 0) + amount;
    if (!user.balanceHistory) user.balanceHistory = [];
    user.balanceHistory.push({
        amount,
        description: `Пополнение баланса (${options.source || order.paymentMethod || 'оплата'})`,
        date: Date.now()
    });

    order.status = 'completed';
    order.completedAt = Date.now();
    order.updatedAt = Date.now();
    order.balanceAfter = user.balance;

    if (global.happUserBot) {
        const cur = (data.settings || {}).currency || '₽';
        global.happUserBot.sendMessage(parseInt(order.chatId || order.userId),
            `✅ Баланс пополнен!\n\n💰 +${amount} ${cur}\n💳 Баланс: ${user.balance} ${cur}`
        ).catch(() => { });
    }

    return { order, user, balance: user.balance };
}

function generateToken() { return crypto.randomBytes(32).toString('base64url'); }
function generateId() { return crypto.randomBytes(8).toString('hex'); }

function generateUuidFromSeed(seed) {
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    return [
        hash.substring(0, 8), hash.substring(8, 12),
        '4' + hash.substring(13, 16),
        ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20),
        hash.substring(20, 32)
    ].join('-');
}

function getServerUrl(data) {
    const s = (data || loadData()).settings || {};
    return s.serverUrl || `http://localhost:${PORT}`;
}

// ===== HAPP CRYPT4 LINK GENERATION =====
const { createHappCryptoLink } = require('@kastov/cryptohapp');

function encryptForHapp(url) {
    // Use official @kastov/cryptohapp library (same as Remnawave)
    const link = createHappCryptoLink(url, 'v4', true);
    if (!link) throw new Error('Failed to encrypt URL for Happ');
    return Promise.resolve(link);
}

// Generate happ:// crypt link for a subscription
app.get('/api/subs/:id/happ-link', authMiddleware, async (req, res) => {
    try {
        const data = loadData();
        const sub = (data.subscriptions || []).find(s => s.id === req.params.id);
        if (!sub) return res.status(404).json({ error: 'Not found' });

        const serverUrl = getBaseUrl(req);
        const subUrl = `${serverUrl}/sub?token=${sub.token}`;

        // Check cache — invalidate if token/padding changed
        if (sub.happLink && sub.happLinkSource === subUrl && sub.happLinkVia === 'pkcs1') {
            return res.json({ link: sub.happLink, cached: true, subUrl });
        }

        // Call Happ API to encrypt
        const happLink = await encryptForHapp(subUrl);

        // Cache it
        sub.happLink = happLink;
        sub.happLinkSource = subUrl;
        sub.happLinkVia = 'pkcs1';
        sub.happLinkCreatedAt = Date.now();
        saveData(data);

        res.json({ link: happLink, cached: false, subUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Clear cached happ link (force regeneration)
app.post('/api/subs/:id/happ-link/refresh', authMiddleware, async (req, res) => {
    try {
        const data = loadData();
        const sub = (data.subscriptions || []).find(s => s.id === req.params.id);
        if (!sub) return res.status(404).json({ error: 'Not found' });

        const serverUrl = getBaseUrl(req);
        const subUrl = `${serverUrl}/sub?token=${sub.token}`;

        const happLink = await encryptForHapp(subUrl);
        sub.happLink = happLink;
        sub.happLinkSource = subUrl;
        sub.happLinkVia = 'pkcs1';
        sub.happLinkCreatedAt = Date.now();
        saveData(data);

        res.json({ link: happLink, cached: false, subUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Quick toggle sub enabled/disabled
app.post('/api/subs/:id/toggle', authMiddleware, (req, res) => {
    const data = loadData();
    const sub = (data.subscriptions || []).find(s => s.id === req.params.id);
    if (!sub) return res.status(404).json({ error: 'Not found' });

    sub.enabled = !sub.enabled;
    sub.updatedAt = Date.now();
    saveData(data);
    scheduleRelaySync();

    // Notify user
    if (global.happUserBot && sub.telegramUsers) {
        sub.telegramUsers.forEach(uid => {
            const msg = sub.enabled
                ? `\u2705 Your subscription "${sub.name}" has been activated!`
                : `\u26D4 Your subscription "${sub.name}" has been suspended.`;
            global.happUserBot.sendMessage(uid, msg).catch(() => { });
        });
    }

    res.json({ id: sub.id, name: sub.name, enabled: sub.enabled });
});

// ===== CLIENT PAGE =====
app.get('/c', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

app.get('/api/client-sub', async (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'No token' });
    const data = loadData();
    const sub = data.subscriptions.find(s => s.token === token);
    if (!sub) return res.status(404).json({ error: 'not_found' });

    const isExpired = sub.expiresAt && Date.now() > sub.expiresAt;
    const isDisabled = sub.enabled === false;
    const status = isDisabled ? 'disabled' : isExpired ? 'expired' : 'active';

    const tpls = (sub.templateIds || [])
        .map(id => (data.templates || []).find(t => t.id === id))
        .filter(t => t && t.enabled !== false);

    const servers = [];
    const s = data.settings || {};
    let serverIndex = 0;
    for (const t of tpls) {
        const customNames = t.threeDh ? [] : (t.uriNames || []);
        for (let ui = 0; ui < (t.uris || []).length; ui++) {
            const uri = t.uris[ui];
            const parsed = parseVlessUri(uri);
            const serverName = customNames[ui] || getVlessUriName(uri, `${t.name} ${ui + 1}`);
            const name = await buildVlessDisplayName(s, {
                server: serverName,
                template: t.name,
                index: serverIndex + 1,
                mode: (t.uriDirect || [])[ui] ? 'direct' : 'relay',
                host: parsed?.address || '',
                port: parsed?.port || '',
                sub: sub.name || ''
            });
            servers.push({ name, template: t.name });
            serverIndex++;
        }
    }

    const subUrl = `${getServerUrl(data)}/sub?token=${sub.token}`;

    res.json({
        name: sub.name,
        status,
        serverCount: servers.length,
        servers,
        devices: (sub.devices || []).length,
        maxDevices: sub.maxDevices || 0,
        expiresAt: sub.expiresAt || 0,
        accessCount: sub.accessCount || 0,
        subUrl,
        supportUrl: s.supportUrl || '',
        title: s.title || 'HappVPN',
        appLinks: s.appLinks || getDefaultSettings().appLinks
    });
});

// ===== STUB =====
function sendStub(res, stubKey) {
    const data = loadData();
    const s = data.settings || {};
    const reason = s[stubKey] || stubKey;
    const title = s.stubTitle || '⛔ Доступ ограничен';
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const lines = [
        `#profile-title: ${title}`,
        `#profile-update-interval: 1`,
        `#announce: base64:${Buffer.from(reason.substring(0, 200)).toString('base64')}`,
        `#subscription-always-hwid-enable: 1`,
        `vless://${fakeUuid}@0.0.0.0:443?security=reality&sni=blocked.local&fp=chrome&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&type=tcp#${encodeURIComponent(reason)}`
    ];
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(Buffer.from(lines.join('\n'), 'utf8').toString('base64'));
}

// ===== /sub ENDPOINT =====
app.get('/sub', async (req, res) => {
    const token = req.query.token;
    if (!token) return sendStub(res, 'stubNoToken');

    // Browser detection: if no HWID and looks like a browser → show client page
    const hwid = req.get('X-HWID') || req.query.hwid;
    const ua = (req.get('User-Agent') || '').toLowerCase();
    const isBrowser = !hwid && (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('edge'));
    if (isBrowser) {
        return res.redirect(`/c?token=${encodeURIComponent(token)}`);
    }
    const data = loadData();
    const sub = data.subscriptions.find(s => s.token === token);
    if (!sub) return sendStub(res, 'stubNotFound');

    // Check enabled
    if (sub.enabled === false) return sendStub(res, 'stubDisabled');

    // Check expiration
    if (sub.expiresAt && Date.now() > sub.expiresAt) return sendStub(res, 'stubExpired');

    // HWID handling — if missing, still serve subscription (needed for crypt4 initial fetch)
    // Device registration only happens when valid HWID is provided
    let hwidClean = null;
    const fakeHwids = ['unknown', 'null', 'undefined', 'test', '0', '00000000', 'none', 'default', 'device'];
    if (hwid) {
        hwidClean = hwid.trim();
        if (hwidClean.length < 8 || fakeHwids.includes(hwidClean.toLowerCase()) || !/^[a-zA-Z0-9_\-:.]+$/.test(hwidClean)) {
            hwidClean = null; // invalid HWID, treat as no HWID
        }
    }

    if (!sub.devices) sub.devices = [];
    let isNewDevice = false;
    if (hwidClean) {
        const existing = sub.devices.find(d => d.hwid === hwidClean);
        if (existing) {
            existing.lastSeen = Date.now();
            existing.ip = (req.ip || '').replace(/^::ffff:/, '');
            existing.ua = req.get('User-Agent') || '';
        } else {
            const maxDevices = sub.maxDevices || 0;
            if (maxDevices > 0 && sub.devices.length >= maxDevices) return sendStub(res, 'stubDeviceLimit');
            sub.devices.push({ hwid: hwidClean, firstSeen: Date.now(), lastSeen: Date.now(), ip: (req.ip || '').replace(/^::ffff:/, ''), ua: req.get('User-Agent') || '', name: `Device ${sub.devices.length + 1}` });
            isNewDevice = true;
        }

        // === LOG CONNECTION ===
        if (!data.logs) data.logs = [];
        data.logs.push({
            ts: Date.now(),
            type: isNewDevice ? 'new_device' : 'connect',
            subId: sub.id,
            subName: sub.name,
            hwid: hwidClean.substring(0, 16),
            ip: (req.ip || '').replace(/^::ffff:/, ''),
            ua: (req.get('User-Agent') || '').substring(0, 100)
        });
        // Keep only last 500 logs
        if (data.logs.length > 500) data.logs = data.logs.slice(-500);
    }

    // === NOTIFY ADMIN (new device) ===
    if (isNewDevice && global.happBot) {
        const devNum = sub.devices.length;
        const maxD = sub.maxDevices || '∞';
        const msg = `🔔 *Новое устройство*\n\n` +
            `📋 ${sub.name}\n` +
            `📱 Устройств: ${devNum}/${maxD}\n` +
            `🌐 IP: ${req.ip}\n` +
            `⏰ ${new Date().toLocaleString('ru-RU')}`;
        try {
            const s = data.settings || {};
            const adminIds = (s.adminIds || process.env.ADMIN_IDS || '').split(',').map(Number).filter(Boolean);
            adminIds.forEach(id => global.happBot.sendMessage(id, msg, { parse_mode: 'Markdown' }).catch(() => { }));
        } catch { }
    }

    // Collect URIs
    const selectedTemplates = (sub.templateIds || [])
        .map(id => data.templates.find(t => t.id === id))
        .filter(t => t && t.enabled !== false);

    const settings = data.settings || {};
    const allUris = [];

    // Relay mode: if relayDomain configured, generate relay URIs
    if (settings.relayDomain) {
        const mainPort = parseInt(settings.relayMainPort) || 8443;

        // UUID generator (must match syncRelay logic!)
        function makeUuid(seed) {
            const h = crypto.createHash('md5').update(seed).digest('hex');
            return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-');
        }

        // Direct VPN UUID (original)
        const directUuid = makeUuid(sub.token);

        // Reality params for relay URIs
        const realityPbk = settings.realityPublicKey || '';
        const realitySid = (settings.realityShortIds || '').split(',')[0] || '';
        const realitySni = settings.realitySni || 'www.gosuslugi.ru';

        // Рандомный fingerprint (детерминированный по токену)
        const FP_LIST = ['chrome', 'firefox', 'safari', 'edge', 'random'];
        function getFingerprint(seed) {
            const h = crypto.createHash('md5').update(seed).digest();
            return FP_LIST[h[0] % FP_LIST.length];
        }

        // Direct VPN through relay (with Reality — invisible to DPI)
        const mainFp = getFingerprint(sub.token + ':main');
        const mainName = await buildVlessDisplayName(settings, {
            server: settings.relayDomain,
            template: settings.title || 'HappVPN',
            index: 1,
            mode: 'main',
            host: settings.relayDomain,
            port: mainPort,
            sub: sub.name || ''
        });
        allUris.push(`vless://${directUuid}@${settings.relayDomain}:${mainPort}?security=reality&sni=${realitySni}&fp=${mainFp}&pbk=${realityPbk}&sid=${realitySid}&type=tcp&flow=xtls-rprx-vision&encryption=none#${encodeURIComponent(mainName)}`);

        // Relay servers — ВСЕ через один порт ${mainPort}, разные UUID
        let relayIdx = 0;
        for (const tpl of selectedTemplates) {
            const directs = tpl.uriDirect || [];
            const customNames = tpl.threeDh ? [] : (tpl.uriNames || []);
            for (let ui = 0; ui < (tpl.uris || []).length; ui++) {
                const uri = tpl.uris[ui];
                // Determine display name
                let serverName = 'Server';
                if (customNames[ui]) {
                    serverName = customNames[ui];
                } else {
                    serverName = getVlessUriName(uri, serverName);
                }
                const parsed = parseVlessUri(uri);
                const name = await buildVlessDisplayName(settings, {
                    server: serverName,
                    template: tpl.name,
                    index: relayIdx + 1,
                    mode: directs[ui] ? 'direct' : 'relay',
                    host: parsed?.address || '',
                    port: parsed?.port || '',
                    sub: sub.name || ''
                });
                if (directs[ui]) {
                    // Direct mode — pass original URI
                    let finalUri = uri;
                    if (finalUri.includes('{uuid}')) {
                        finalUri = finalUri.replace(/\{uuid\}/g, generateUuidFromSeed(sub.token + ':' + tpl.id));
                    }
                    allUris.push(setVlessUriName(finalUri, name));
                } else {
                    // Relay mode — ОДИН порт, разные UUID (БЕЗ flow — избегаем двойной Vision)
                    const relayUuid = makeUuid(sub.token + ':relay:' + relayIdx);
                    const fp = getFingerprint(sub.token + ':' + relayIdx);
                    allUris.push(`vless://${relayUuid}@${settings.relayDomain}:${mainPort}?security=reality&sni=${realitySni}&fp=${fp}&pbk=${realityPbk}&sid=${realitySid}&type=tcp&encryption=none#${encodeURIComponent(name)}`);
                }
                relayIdx++;
            }
        }
    } else {
        // Original mode: give raw URIs
        for (const tpl of selectedTemplates) {
            const customNames = tpl.threeDh ? [] : (tpl.uriNames || []);
            for (let ui = 0; ui < (tpl.uris || []).length; ui++) {
                let finalUri = tpl.uris[ui];
                if (finalUri.includes('{uuid}')) {
                    finalUri = finalUri.replace(/\{uuid\}/g, generateUuidFromSeed(sub.token + ':' + tpl.id));
                }
                const parsed = parseVlessUri(finalUri);
                const serverName = customNames[ui] || getVlessUriName(finalUri, `${tpl.name} ${ui + 1}`);
                const name = await buildVlessDisplayName(settings, {
                    server: serverName,
                    template: tpl.name,
                    index: ui + 1,
                    mode: 'direct',
                    host: parsed?.address || '',
                    port: parsed?.port || '',
                    sub: sub.name || ''
                });
                allUris.push(setVlessUriName(finalUri, name));
            }
        }
    }

    const profileTitle = [settings.title, sub.name].filter(Boolean).join(' | ');
    const bodyLines = [];

    if (profileTitle) bodyLines.push(`#profile-title: ${profileTitle}`);
    if (settings.updateInterval) bodyLines.push(`#profile-update-interval: ${settings.updateInterval}`);
    if (settings.supportUrl) bodyLines.push(`#support-url: ${settings.supportUrl}`);
    if (settings.website) bodyLines.push(`#profile-web-page-url: ${settings.website}`);
    if (settings.description) bodyLines.push(`#announce: base64:${Buffer.from(settings.description.substring(0, 200)).toString('base64')}`);
    bodyLines.push('#subscription-always-hwid-enable: 1');
    bodyLines.push(...allUris);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (sub.trafficTotal) {
        const totalBytes = sub.trafficTotal * 1073741824;
        const usedBytes = (sub.trafficUsed || 0) * 1073741824;
        res.setHeader('subscription-userinfo', `upload=0; download=${Math.floor(usedBytes)}; total=${Math.floor(totalBytes)}`);
    }

    sub.lastAccessed = Date.now();
    sub.accessCount = (sub.accessCount || 0) + 1;
    saveData(data);

    // Detect client format by User-Agent
    const format = req.query.format || '';
    const acceptHeader = req.get('Accept') || '';
    const isJson = format === 'json' || acceptHeader.includes('application/json');
    const isClash = format === 'clash' || /clash|stash|mihomo/i.test(ua);
    const isSingBox = format === 'singbox' || /sing-?box|hiddify/i.test(ua);

    if (isJson) {
        // === JSON FORMAT ===
        const servers = allUris.map((uri, i) => {
            const p = parseVlessUri(uri);
            if (!p) return null;
            let name = 'Server';
            const h = uri.lastIndexOf('#');
            if (h !== -1) try { name = decodeURIComponent(uri.substring(h + 1)); } catch { }

            const server = {
                name,
                protocol: 'vless',
                address: p.address,
                port: p.port,
                uuid: p.uuid,
                security: p.security || 'none',
                network: p.type || 'tcp',
                fingerprint: p.fp || 'chrome'
            };

            if (p.flow) server.flow = p.flow;
            if (p.sni) server.sni = p.sni;

            // TLS settings
            if (p.security === 'tls') {
                server.tls = { serverName: p.sni || p.address, alpn: p.alpn ? p.alpn.split(',') : [] };
            }

            // Reality settings
            if (p.security === 'reality') {
                server.reality = { publicKey: p.pbk || '', shortId: p.sid || '', serverName: p.sni || '', spiderX: p.raw.spx || '' };
            }

            // Transport settings
            if (p.type === 'ws') {
                server.ws = { path: p.path || '/', host: p.raw.host || '' };
            } else if (p.type === 'grpc') {
                server.grpc = { serviceName: p.serviceName || '' };
            } else if (p.type === 'tcp' && p.headerType === 'http') {
                server.httpHeader = { path: p.path || '/', host: p.raw.host || p.address };
            }

            // Original URI for backwards compat
            server.uri = uri;

            return server;
        }).filter(Boolean);

        const jsonResponse = {
            profile: {
                title: profileTitle || settings.title || 'HappVPN',
                updateInterval: settings.updateInterval || 12,
                supportUrl: settings.supportUrl || '',
                website: settings.website || '',
                description: settings.description || ''
            },
            subscription: {
                name: sub.name,
                enabled: sub.enabled !== false,
                expiresAt: sub.expiresAt || null,
                trafficTotal: sub.trafficTotal || 0,
                trafficUsed: sub.trafficUsed || 0,
                maxDevices: sub.maxDevices || 0,
                deviceCount: (sub.devices || []).length
            },
            servers,
            serverCount: servers.length
        };

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.json(jsonResponse);
    }

    if (isClash) {
        // === CLASH META FORMAT ===
        const proxies = allUris.map((uri, i) => {
            const p = parseVlessUri(uri);
            if (!p) return null;
            let name = 'Server';
            const h = uri.lastIndexOf('#');
            if (h !== -1) try { name = decodeURIComponent(uri.substring(h + 1)); } catch { }
            const proxy = {
                name, type: 'vless', server: p.address, port: p.port,
                uuid: p.uuid, tls: p.security === 'tls' || p.security === 'reality',
                'skip-cert-verify': false, network: p.type || 'tcp',
                'client-fingerprint': p.fp || 'chrome', udp: true
            };
            if (p.flow) proxy.flow = p.flow;
            if (p.sni) proxy.servername = p.sni;
            if (p.security === 'reality') {
                proxy['reality-opts'] = { 'public-key': p.pbk || '', 'short-id': p.sid || '' };
            }
            if (p.type === 'ws') proxy['ws-opts'] = { path: p.path || '/', headers: p.host ? { Host: p.host } : {} };
            if (p.type === 'grpc') proxy['grpc-opts'] = { 'grpc-service-name': p.serviceName || '' };
            return proxy;
        }).filter(Boolean);

        const proxyNames = proxies.map(p => p.name);
        const clashConfig = {
            'mixed-port': 7890, 'allow-lan': false, mode: 'rule',
            'log-level': 'info',
            dns: { enable: true, 'enhanced-mode': 'fake-ip', nameserver: ['https://dns.google/dns-query', 'https://1.1.1.1/dns-query'] },
            proxies,
            'proxy-groups': [
                { name: '🚀 Proxy', type: 'select', proxies: ['♻️ Auto', ...proxyNames, 'DIRECT'] },
                { name: '♻️ Auto', type: 'url-test', proxies: proxyNames, url: 'http://www.gstatic.com/generate_204', interval: 300 }
            ],
            rules: ['GEOIP,RU,DIRECT', 'MATCH,🚀 Proxy']
        };

        // Simple YAML serializer
        const yaml = serializeYaml(clashConfig);
        res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="clash.yaml"');
        return res.send(yaml);
    }

    if (isSingBox) {
        // === SING-BOX FORMAT ===
        const outbounds = allUris.map(uri => {
            const p = parseVlessUri(uri);
            if (!p) return null;
            let name = 'Server';
            const h = uri.lastIndexOf('#');
            if (h !== -1) try { name = decodeURIComponent(uri.substring(h + 1)); } catch { }
            const ob = {
                tag: name, type: 'vless', server: p.address, server_port: p.port,
                uuid: p.uuid, packet_encoding: 'xudp'
            };
            if (p.flow) ob.flow = p.flow;
            if (p.security === 'tls') {
                ob.tls = { enabled: true, server_name: p.sni || p.address, utls: { enabled: true, fingerprint: p.fp || 'chrome' } };
            }
            if (p.security === 'reality') {
                ob.tls = {
                    enabled: true, server_name: p.sni || '', utls: { enabled: true, fingerprint: p.fp || 'chrome' },
                    reality: { enabled: true, public_key: p.pbk || '', short_id: p.sid || '' }
                };
            }
            if (p.type === 'ws') ob.transport = { type: 'ws', path: p.path || '/', headers: p.host ? { Host: p.host } : {} };
            if (p.type === 'grpc') ob.transport = { type: 'grpc', service_name: p.serviceName || '' };
            return ob;
        }).filter(Boolean);

        const tags = outbounds.map(o => o.tag);
        const singConfig = {
            log: { level: 'info' },
            dns: { servers: [{ tag: 'google', address: 'https://dns.google/dns-query' }] },
            outbounds: [
                { tag: 'proxy', type: 'selector', outbounds: ['auto', ...tags, 'direct'] },
                { tag: 'auto', type: 'urltest', outbounds: tags, url: 'http://www.gstatic.com/generate_204', interval: '5m' },
                ...outbounds,
                { tag: 'direct', type: 'direct' }, { tag: 'block', type: 'block' }
            ],
            route: { auto_detect_interface: true, rules: [{ geoip: ['ru'], outbound: 'direct' }], final: 'proxy' }
        };

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="singbox.json"');
        return res.json(singConfig);
    }

    // === DEFAULT: BASE64 ===
    res.send(Buffer.from(bodyLines.join('\n'), 'utf8').toString('base64'));
});

// ===== API: AUTH PROTECTED =====

// Templates
app.get('/api/templates', authMiddleware, (req, res) => {
    res.json(loadData().templates || []);
});

app.post('/api/templates', authMiddleware, (req, res) => {
    const data = loadData();
    const { name, uris } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if ((!uris || !Array.isArray(uris) || uris.length === 0) && !req.body.syncUrl) return res.status(400).json({ error: 'Add at least one URI or sync URL' });

    const template = { id: generateId(), name, uris: (uris || []).filter(u => u.trim()), enabled: true, createdAt: Date.now() };
    // Sync fields
    if (req.body.syncUrl) template.syncUrl = req.body.syncUrl;
    if (req.body.syncInterval) template.syncInterval = parseInt(req.body.syncInterval) || 12;
    if (req.body.syncHwid) template.syncHwid = req.body.syncHwid;
    if (!data.templates) data.templates = [];
    data.templates.push(template);
    saveData(data);
    res.json(template);
    // Auto-sync immediately if syncUrl provided
    if (template.syncUrl) {
        syncTemplate(template).then(changed => {
            if (changed) { const d = loadData(); const t = d.templates.find(x => x.id === template.id); if (t) { t.uris = template.uris; t.uriNames = template.uriNames; t.uriDirect = template.uriDirect; t.lastSynced = template.lastSynced; saveData(d); scheduleRelaySync(); } }
        }).catch(() => { });
    }
});

app.put('/api/templates/:id', authMiddleware, (req, res) => {
    const data = loadData();
    const idx = (data.templates || []).findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const { name, uris, enabled, uriDirect, uriNames } = req.body;
    if (name !== undefined) data.templates[idx].name = name;
    if (uris !== undefined) data.templates[idx].uris = uris.filter(u => u.trim());
    if (enabled !== undefined) data.templates[idx].enabled = enabled;
    if (uriDirect !== undefined) data.templates[idx].uriDirect = uriDirect;
    if (uriNames !== undefined) data.templates[idx].uriNames = uriNames;
    // Sync fields
    if (req.body.syncUrl !== undefined) data.templates[idx].syncUrl = req.body.syncUrl;
    if (req.body.syncInterval !== undefined) data.templates[idx].syncInterval = parseInt(req.body.syncInterval) || 12;
    if (req.body.syncHwid !== undefined) data.templates[idx].syncHwid = req.body.syncHwid;
    data.templates[idx].updatedAt = Date.now();
    saveData(data);
    res.json(data.templates[idx]);
});

// Delete all trial templates + their subscriptions + 3DH devices
app.delete('/api/templates/trials', authMiddleware, async (req, res) => {
    const data = loadData();
    const settings = data.settings || {};
    
    const trialTpls = (data.templates || []).filter(t => /^Trial-\d+$/.test(t.name));
    const trialTplIds = new Set(trialTpls.map(t => t.id));
    
    if (trialTplIds.size === 0) {
        return res.json({ ok: true, deletedTemplates: 0, deletedSubs: 0 });
    }
    
    const trialSubs = (data.subscriptions || []).filter(sub => 
        sub.isTrial && (sub.templateIds || []).some(id => trialTplIds.has(id))
    );
    
    for (const sub of trialSubs) {
        if (sub.threeDhDeviceId) {
            try { await deleteThreeDhDevice(settings, sub.threeDhDeviceId); }
            catch (e) { console.log(`3DH cleanup error: ${e.message}`); }
        }
    }
    
    const trialSubIds = new Set(trialSubs.map(s => s.id));
    data.templates = (data.templates || []).filter(t => !trialTplIds.has(t.id));
    data.subscriptions = (data.subscriptions || []).filter(s => !trialSubIds.has(s.id));
    
    saveData(data);
    scheduleRelaySync();
    
    res.json({ ok: true, deletedTemplates: trialTplIds.size, deletedSubs: trialSubIds.size });
});

app.delete('/api/templates/:id', authMiddleware, (req, res) => {
    const data = loadData();
    const idx = (data.templates || []).findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const tplId = data.templates[idx].id;
    data.templates.splice(idx, 1);
    (data.subscriptions || []).forEach(sub => { sub.templateIds = (sub.templateIds || []).filter(id => id !== tplId); });
    saveData(data);
    res.json({ ok: true });
});

// Apply template to all subscriptions
app.post('/api/templates/:id/apply-all', authMiddleware, (req, res) => {
    const data = loadData();
    const tpl = (data.templates || []).find(t => t.id === req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    let count = 0;
    (data.subscriptions || []).forEach(sub => {
        if (!sub.templateIds) sub.templateIds = [];
        if (!sub.templateIds.includes(tpl.id)) {
            sub.templateIds.push(tpl.id);
            count++;
        }
    });
    saveData(data);
    scheduleRelaySync();
    res.json({ ok: true, count, total: (data.subscriptions || []).length });
});

// Remove template from all subscriptions
app.post('/api/templates/:id/remove-all', authMiddleware, (req, res) => {
    const data = loadData();
    const tpl = (data.templates || []).find(t => t.id === req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    let count = 0;
    (data.subscriptions || []).forEach(sub => {
        if (sub.templateIds && sub.templateIds.includes(tpl.id)) {
            sub.templateIds = sub.templateIds.filter(id => id !== tpl.id);
            count++;
        }
    });
    saveData(data);
    scheduleRelaySync();
    res.json({ ok: true, count });
});

// Subscriptions
app.get('/api/subs', authMiddleware, (req, res) => { res.json(loadData().subscriptions || []); });

app.post('/api/subs', authMiddleware, (req, res) => {
    const data = loadData();
    const { name, templateIds, trafficTotal, maxDevices, expiresAt, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!templateIds || templateIds.length === 0) return res.status(400).json({ error: 'Select templates' });

    const sub = {
        id: generateId(), name,
        trafficTotal: parseFloat(trafficTotal) || 0, trafficUsed: 0,
        maxDevices: parseInt(maxDevices) || 0,
        token: generateToken(), templateIds,
        enabled: true,
        expiresAt: expiresAt ? new Date(expiresAt).getTime() : 0,
        notes: notes || '',
        devices: [], createdAt: Date.now(), accessCount: 0
    };

    if (!data.subscriptions) data.subscriptions = [];
    data.subscriptions.push(sub);
    saveData(data);
    res.json(sub);
});

app.put('/api/subs/:id', authMiddleware, (req, res) => {
    const data = loadData();
    const idx = (data.subscriptions || []).findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const { name, templateIds, trafficTotal, trafficUsed, maxDevices, enabled, expiresAt, notes } = req.body;
    if (name !== undefined) data.subscriptions[idx].name = name;
    if (templateIds !== undefined) data.subscriptions[idx].templateIds = templateIds;
    if (trafficTotal !== undefined) data.subscriptions[idx].trafficTotal = parseFloat(trafficTotal) || 0;
    if (trafficUsed !== undefined) data.subscriptions[idx].trafficUsed = parseFloat(trafficUsed) || 0;
    if (maxDevices !== undefined) data.subscriptions[idx].maxDevices = parseInt(maxDevices) || 0;
    if (enabled !== undefined) data.subscriptions[idx].enabled = enabled;
    if (expiresAt !== undefined) data.subscriptions[idx].expiresAt = expiresAt ? new Date(expiresAt).getTime() : 0;
    if (notes !== undefined) data.subscriptions[idx].notes = notes;
    data.subscriptions[idx].updatedAt = Date.now();
    saveData(data);
    // Resync Xray if enabled changed
    if (enabled !== undefined) scheduleRelaySync();
    // Notify user if blocked/unblocked
    if (enabled !== undefined && global.happUserBot) {
        const sub = data.subscriptions[idx];
        const users = sub.telegramUsers || [];
        users.forEach(uid => {
            if (enabled === false) {
                global.happUserBot.sendMessage(uid, `⛔ Ваша подписка "${sub.name}" заблокирована.\nОбратитесь в поддержку.`).catch(() => { });
            } else {
                global.happUserBot.sendMessage(uid, `✅ Ваша подписка "${sub.name}" разблокирована!`).catch(() => { });
            }
        });
    }
    res.json(data.subscriptions[idx]);
});

app.delete('/api/subs/:id', authMiddleware, (req, res) => {
    const data = loadData();
    const idx = (data.subscriptions || []).findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const sub = data.subscriptions[idx];
    // Notify user about deletion
    if (global.happUserBot && sub.telegramUsers) {
        sub.telegramUsers.forEach(uid => {
            global.happUserBot.sendMessage(uid, `🗑 Ваша подписка "${sub.name}" удалена.\nОбратитесь в поддержку для восстановления.`).catch(() => { });
        });
    }
    data.subscriptions.splice(idx, 1);
    saveData(data);
    scheduleRelaySync();
    res.json({ ok: true });
});

app.post('/api/subs/:id/regenerate', authMiddleware, (req, res) => {
    const data = loadData();
    const idx = (data.subscriptions || []).findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    data.subscriptions[idx].token = generateToken();
    data.subscriptions[idx].accessCount = 0;
    saveData(data);
    scheduleRelaySync();
    res.json(data.subscriptions[idx]);
});

// Switch trial subscription template
app.post('/api/subs/:id/switch-template', authMiddleware, async (req, res) => {
    const data = loadData();
    const idx = (data.subscriptions || []).findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    
    const sub = data.subscriptions[idx];
    if (!sub.isTrial) return res.status(400).json({ error: 'Not a trial subscription' });
    
    const { templateType, templateId } = req.body;
    const settings = data.settings || {};
    
    try {
        // Clean up existing 3DH resources if switching away from 3DH
        if (sub.threeDhDeviceId && templateType !== '3dh') {
            await deleteThreeDhDevice(settings, sub.threeDhDeviceId);
            if (sub.threeDhTemplateId) {
                data.templates = (data.templates || []).filter(t => t.id !== sub.threeDhTemplateId);
            }
            sub.threeDhDeviceId = null;
            sub.threeDhTemplateId = null;
        }
        
        if (templateType === '3dh') {
            // Switch to 3DH template
            if (!isThreeDhConfigured(settings)) {
                return res.status(400).json({ error: '3DH not configured' });
            }
            
            if (!sub.threeDhDeviceId) {
                // Create new 3DH device
                const userId = (sub.telegramUsers || [])[0] || 'unknown';
                const order = { id: sub.id, userId: String(userId), username: '', firstName: '' };
                const plan = { name: 'Trial', useThreeDh: true };
                
                const device = await createThreeDhDevice(settings, order, plan);
                if (!device) {
                    return res.status(500).json({ error: 'Failed to create 3DH device' });
                }
                
                // Create 3DH template
                const tplId = generateId();
                const template = {
                    id: tplId,
                    name: `Trial-${userId}`,
                    uris: device.configs,
                    uriDirect: device.configs.map(() => true),
                    uriNames: [],
                    enabled: true,
                    threeDh: true,
                    createdAt: Date.now()
                };
                
                if (!data.templates) data.templates = [];
                data.templates.push(template);
                
                sub.templateIds = [tplId];
                sub.threeDhDeviceId = device.deviceId;
                sub.threeDhTemplateId = tplId;
            }
        } else if (templateType === 'custom' && templateId) {
            // Switch to custom template
            const template = (data.templates || []).find(t => t.id === templateId);
            if (!template) {
                return res.status(404).json({ error: 'Template not found' });
            }
            
            sub.templateIds = [templateId];
        } else {
            // Use default trial templates
            const trialTemplateIds = (settings.trialTemplateIds || []).slice();
            if (!trialTemplateIds.length && data.templates && data.templates.length > 0) {
                trialTemplateIds.push(...data.templates.filter(t => t.enabled !== false && !t.threeDh).map(t => t.id));
            }
            sub.templateIds = trialTemplateIds.slice(0, 5);
        }
        
        sub.updatedAt = Date.now();
        saveData(data);
        scheduleRelaySync();
        
        res.json({ 
            ok: true, 
            subscription: sub,
            message: `Switched to ${templateType === '3dh' ? '3DH' : templateType === 'custom' ? 'custom' : 'default'} template`
        });
        
    } catch (error) {
        console.error('Switch template error:', error);
        res.status(500).json({ error: 'Failed to switch template: ' + error.message });
    }
});

// Devices
app.get('/api/subs/:id/devices', authMiddleware, (req, res) => {
    const data = loadData();
    const sub = (data.subscriptions || []).find(s => s.id === req.params.id);
    if (!sub) return res.status(404).json({ error: 'Not found' });
    res.json(sub.devices || []);
});

app.delete('/api/subs/:id/devices/:hwid', authMiddleware, (req, res) => {
    const data = loadData();
    const sub = (data.subscriptions || []).find(s => s.id === req.params.id);
    if (!sub) return res.status(404).json({ error: 'Not found' });
    if (!sub.devices) sub.devices = [];
    const idx = sub.devices.findIndex(d => d.hwid === req.params.hwid);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    sub.devices.splice(idx, 1);
    saveData(data);
    res.json({ ok: true });
});

// Delete all trial subscriptions
app.delete('/api/trials', authMiddleware, async (req, res) => {
    const data = loadData();
    const settings = data.settings || {};
    
    try {
        // Find all trial subscriptions
        const trialSubs = (data.subscriptions || []).filter(sub => sub.isTrial);
        
        if (trialSubs.length === 0) {
            return res.json({ ok: true, deleted: 0, message: 'Нет пробных подписок для удаления' });
        }
        
        let deletedCount = 0;
        const templateIdsToDelete = new Set();
        
        // Clean up 3DH devices and templates for trials
        for (const sub of trialSubs) {
            if (sub.threeDhDeviceId) {
                try {
                    await deleteThreeDhDevice(settings, sub.threeDhDeviceId);
                } catch (e) {
                    console.log(`Failed to delete 3DH device ${sub.threeDhDeviceId}:`, e.message);
                }
            }
            if (sub.threeDhTemplateId) {
                templateIdsToDelete.add(sub.threeDhTemplateId);
            }
            deletedCount++;
        }
        
        // Remove trial subscriptions
        data.subscriptions = (data.subscriptions || []).filter(sub => !sub.isTrial);
        
        // Remove trial templates
        if (templateIdsToDelete.size > 0) {
            data.templates = (data.templates || []).filter(t => !templateIdsToDelete.has(t.id));
        }
        
        saveData(data);
        scheduleRelaySync();
        
        res.json({ 
            ok: true, 
            deleted: deletedCount,
            message: `Удалено ${deletedCount} пробных подписок`
        });
        
    } catch (error) {
        console.error('Delete trials error:', error);
        res.status(500).json({ error: 'Failed to delete trials: ' + error.message });
    }
});

app.delete('/api/subs/:id/devices', authMiddleware, (req, res) => {
    const data = loadData();
    const sub = (data.subscriptions || []).find(s => s.id === req.params.id);
    if (!sub) return res.status(404).json({ error: 'Not found' });
    sub.devices = [];
    saveData(data);
    res.json({ ok: true });
});

// Ping
app.post('/api/ping', authMiddleware, (req, res) => {
    const { address, port } = req.body;
    if (!address || !port) return res.status(400).json({ error: 'Missing address or port' });

    const net = require('net');
    const start = Date.now();
    const socket = new net.Socket();
    let isDone = false;

    const end = (result) => {
        if (isDone) return;
        isDone = true;
        socket.destroy();
        res.json(result);
    };

    socket.setTimeout(3000);
    socket.on('connect', () => end({ ok: true, ms: Date.now() - start }));
    socket.on('timeout', () => end({ ok: false, error: 'Timeout' }));
    socket.on('error', (err) => end({ ok: false, error: err.message }));

    socket.connect(port, address);
});

// ===== XRAY STATS API =====

function queryXrayStats(reset = false) {
    const cmd = `xray api statsquery --server=127.0.0.1:10085${reset ? ' --reset' : ''}`;
    return new Promise((resolve) => {
        exec(cmd, { timeout: 5000 }, (err, stdout) => {
            if (err) { resolve({}); return; }
            const stats = {};
            try {
                const json = JSON.parse(stdout);
                for (const s of (json.stat || [])) {
                    if (s.name && s.value) stats[s.name] = parseInt(s.value) || 0;
                }
            } catch {
                // Fallback: line-by-line parse
                const lines = stdout.split('\n');
                let currentName = '', currentValue = 0;
                for (const line of lines) {
                    const nameMatch = line.match(/"name":\s*"(.+)"/);
                    const valueMatch = line.match(/"value":\s*"?(\d+)"?/);
                    if (nameMatch) currentName = nameMatch[1];
                    if (valueMatch) currentValue = parseInt(valueMatch[1]);
                    if (currentName && valueMatch) {
                        stats[currentName] = currentValue;
                        currentName = '';
                    }
                }
            }
            resolve(stats);
        });
    });
}

// Get real traffic per user
app.get('/api/xray-stats', authMiddleware, async (req, res) => {
    const stats = await queryXrayStats();
    const result = {};

    for (const [key, value] of Object.entries(stats)) {
        // Format: user>>>email@sub-id>>>traffic>>>uplink/downlink
        const parts = key.split('>>>');
        if (parts.length === 4 && parts[0] === 'user') {
            const email = parts[1];
            const dir = parts[3]; // uplink or downlink
            if (!result[email]) result[email] = { up: 0, down: 0 };
            if (dir === 'uplink') result[email].up = value;
            if (dir === 'downlink') result[email].down = value;
        }
    }
    res.json(result);
});




// ===== SERVER MONITORING =====

app.get('/api/server-stats', authMiddleware, (req, res) => {
    const cpus = os.cpus();
    const cpuCount = cpus.length;
    // CPU usage (avg across cores)
    const cpuTimes = cpus.map(c => {
        const total = Object.values(c.times).reduce((a, b) => a + b, 0);
        const idle = c.times.idle;
        return ((total - idle) / total) * 100;
    });
    const cpuUsage = Math.round(cpuTimes.reduce((a, b) => a + b, 0) / cpuCount);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Disk usage via df
    exec('df -B1 / | tail -1', { timeout: 3000 }, (err, stdout) => {
        let diskTotal = 0, diskUsed = 0;
        if (!err && stdout) {
            const parts = stdout.trim().split(/\s+/);
            if (parts.length >= 4) {
                diskTotal = parseInt(parts[1]) || 0;
                diskUsed = parseInt(parts[2]) || 0;
            }
        }

        // Xray status
        exec('systemctl is-active xray', { timeout: 2000 }, (e2, xrayStatus) => {
            res.json({
                cpu: { usage: cpuUsage, cores: cpuCount, model: cpus[0]?.model || 'Unknown' },
                ram: { total: totalMem, used: usedMem, percent: Math.round((usedMem / totalMem) * 100) },
                disk: { total: diskTotal, used: diskUsed, percent: diskTotal ? Math.round((diskUsed / diskTotal) * 100) : 0 },
                uptime: os.uptime(),
                hostname: os.hostname(),
                platform: `${os.type()} ${os.release()}`,
                xray: (xrayStatus || '').trim() === 'active' ? 'running' : 'stopped'
            });
        });
    });
});

// Settings
app.get('/api/settings', authMiddleware, (req, res) => { res.json(loadData().settings || getDefaultSettings()); });

app.post('/api/settings', authMiddleware, (req, res) => {
    const data = loadData();
    const oldToken = (data.settings || {}).botToken || '';
    const oldAdminIds = (data.settings || {}).adminIds || '';
    const oldUserBotToken = (data.settings || {}).userBotToken || '';
    data.settings = { ...getDefaultSettings(), ...data.settings, ...req.body };
    saveData(data);
    // Restart admin bot if token or admin IDs changed
    const newToken = data.settings.botToken || '';
    const newAdminIds = data.settings.adminIds || '';
    if (newToken !== oldToken || newAdminIds !== oldAdminIds) {
        try {
            const botModule = require('./bot.js');
            if (botModule.restartBot) botModule.restartBot();
        } catch (e) { console.log('  ⚠️  Bot restart failed:', e.message); }
    }
    // Restart user bot if token changed
    const newUserBotToken = data.settings.userBotToken || '';
    if (newUserBotToken !== oldUserBotToken) {
        try {
            const userBotModule = require('./user-bot.js');
            if (userBotModule.restartUserBot) userBotModule.restartUserBot();
        } catch (e) { console.log('  ⚠️  User bot restart failed:', e.message); }
    }
    res.json(data.settings);
});

// Upload welcome photo
app.post('/api/upload-photo', authMiddleware, (req, res) => {
    const { image, field } = req.body;
    if (!image) return res.status(400).json({ error: 'No image' });
    try {
        const matches = image.match(/^data:image\/(.*?);base64,(.+)$/);
        if (!matches) return res.status(400).json({ error: 'Invalid format' });
        const safeField = ['shopWelcomePhoto'].includes(field) ? field : 'shopWelcomePhoto';
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1].toLowerCase();
        if (!['jpg', 'png', 'webp', 'gif'].includes(ext)) return res.status(400).json({ error: 'Unsupported image format' });
        const buf = Buffer.from(matches[2], 'base64');
        if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Image is too large (max 10 MB)' });

        const data = loadData();
        if (!data.settings) data.settings = {};
        const oldUrl = data.settings[safeField] || '';
        if (oldUrl.startsWith('/uploads/')) {
            try { fs.unlinkSync(path.join(__dirname, 'public', oldUrl)); } catch { }
        }

        const fname = `${safeField}_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, fname), buf);
        data.settings[safeField] = `/uploads/${fname}`;
        saveData(data);
        res.json({ url: `/uploads/${fname}` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/upload-photo', authMiddleware, (req, res) => {
    const { field } = req.body;
    const safeField = ['shopWelcomePhoto'].includes(field) ? field : 'shopWelcomePhoto';
    const data = loadData();
    if (data.settings && data.settings[safeField]) {
        const oldPath = path.join(__dirname, 'public', data.settings[safeField]);
        try { fs.unlinkSync(oldPath); } catch { }
        data.settings[safeField] = '';
        saveData(data);
    }
    res.json({ ok: true });
});

// Logs
app.get('/api/logs', authMiddleware, (req, res) => {
    const data = loadData();
    const logs = (data.logs || []).slice().reverse();
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 50;
    res.json({ total: logs.length, logs: logs.slice(page * limit, (page + 1) * limit) });
});

app.delete('/api/logs', authMiddleware, (req, res) => {
    const data = loadData();
    data.logs = [];
    saveData(data);
    res.json({ ok: true });
});

// ===== PLANS CRUD (for User Bot shop) =====
app.get('/api/plans', authMiddleware, (req, res) => {
    const data = loadData();
    res.json(data.plans || []);
});

app.post('/api/plans', authMiddleware, (req, res) => {
    const data = loadData();
    const { name, price, duration, traffic, maxDevices, templateIds, useThreeDh, description, popular } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!price && price !== 0) return res.status(400).json({ error: 'Missing price' });
    if (!useThreeDh && (!templateIds || templateIds.length === 0)) return res.status(400).json({ error: 'Select templates or enable 3DH donor' });

    const plan = {
        id: generateId(),
        name,
        price: parseFloat(price) || 0,
        duration: parseInt(duration) || 30,
        traffic: parseFloat(traffic) || 0,
        maxDevices: parseInt(maxDevices) || 0,
        templateIds: templateIds || [],
        useThreeDh: !!useThreeDh,
        description: description || '',
        popular: !!popular,
        enabled: true,
        createdAt: Date.now()
    };

    if (!data.plans) data.plans = [];
    data.plans.push(plan);
    saveData(data);
    res.json(plan);
});

app.put('/api/plans/:id', authMiddleware, (req, res) => {
    const data = loadData();
    const idx = (data.plans || []).findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const { name, price, duration, traffic, maxDevices, templateIds, useThreeDh, description, popular, enabled } = req.body;
    const nextTemplateIds = templateIds !== undefined ? templateIds : (data.plans[idx].templateIds || []);
    const nextUseThreeDh = useThreeDh !== undefined ? !!useThreeDh : !!data.plans[idx].useThreeDh;
    if (!nextUseThreeDh && nextTemplateIds.length === 0) return res.status(400).json({ error: 'Select templates or enable 3DH donor' });
    if (name !== undefined) data.plans[idx].name = name;
    if (price !== undefined) data.plans[idx].price = parseFloat(price) || 0;
    if (duration !== undefined) data.plans[idx].duration = parseInt(duration) || 30;
    if (traffic !== undefined) data.plans[idx].traffic = parseFloat(traffic) || 0;
    if (maxDevices !== undefined) data.plans[idx].maxDevices = parseInt(maxDevices) || 0;
    if (templateIds !== undefined) data.plans[idx].templateIds = templateIds;
    if (useThreeDh !== undefined) data.plans[idx].useThreeDh = !!useThreeDh;
    if (description !== undefined) data.plans[idx].description = description;
    if (popular !== undefined) data.plans[idx].popular = popular;
    if (enabled !== undefined) data.plans[idx].enabled = enabled;
    data.plans[idx].updatedAt = Date.now();
    saveData(data);
    res.json(data.plans[idx]);
});

app.delete('/api/plans/:id', authMiddleware, (req, res) => {
    const data = loadData();
    const idx = (data.plans || []).findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    data.plans.splice(idx, 1);
    saveData(data);
    res.json({ ok: true });
});

// ===== ORDERS API =====
app.get('/api/orders', authMiddleware, (req, res) => {
    const data = loadData();
    const orders = (data.orders || []).slice().reverse();
    const status = req.query.status;
    const filtered = status ? orders.filter(o => o.status === status) : orders;
    res.json(filtered);
});

app.put('/api/orders/:id', authMiddleware, async (req, res) => {
    const data = loadData();
    const idx = (data.orders || []).findIndex(o => o.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const { status } = req.body;
    try {
        if (status === 'completed') {
            if (['yookassa', 'platega'].includes(data.orders[idx].paymentProvider)) {
                return res.status(400).json({ error: 'Gateway orders are confirmed automatically' });
            }
            await activateOrder(data, data.orders[idx], { source: 'Ручное подтверждение', baseUrl: makePublicUrl(req, data) });
        } else if (status !== undefined) {
            data.orders[idx].status = status;
            data.orders[idx].updatedAt = Date.now();
        }
        saveData(data);
        res.json(data.orders[idx]);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.delete('/api/orders/:id', authMiddleware, (req, res) => {
    const data = loadData();
    const idx = (data.orders || []).findIndex(o => o.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    data.orders.splice(idx, 1);
    saveData(data);
    res.json({ ok: true });
});

// ===== SHOP PUBLIC API (no auth — for Mini App) =====

// Public settings (only non-sensitive fields)
app.get('/api/shop/settings', (req, res) => {
    const data = loadData();
    const s = data.settings || {};
    res.json({
        title: s.title || 'HappVPN',
        shopName: s.shopName || s.title || 'HappVPN',
        currency: s.currency || '₽',
        paymentMethod: s.paymentMethod || '',
        paymentInfo: s.paymentInfo || '',
        paymentMethods: normalizePaymentMethods(s).filter(m => m.enabled),
        yookassaEnabled: isYooKassaConfigured(s),
        yookassaDescription: s.yookassaDescription || 'Оплата картой или СБП через YooKassa',
        plategaEnabled: isPlategaConfigured(s),
        plategaDescription: s.plategaDescription || 'Оплата картой или СБП через Platega',
        userBotWelcome: s.userBotWelcome || '',
        shopWelcomeShort: s.shopWelcomeShort || '',
        supportUrl: s.supportUrl || '',
        userBotLink: s.userBotLink || '',
        requiredChannelsEnabled: !!s.requiredChannelsEnabled,
        requiredChannels: publicRequiredChannels(s),
        referralBonusDays: parseInt(s.referralBonusDays) || 3,
        devicePrice: parseFloat(s.devicePrice) || 0
    });
});

// Public plans (only enabled)
app.get('/api/shop/plans', (req, res) => {
    const data = loadData();
    const plans = (data.plans || []).filter(p => p.enabled !== false);
    res.json(plans.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        duration: p.duration,
        traffic: p.traffic,
        maxDevices: p.maxDevices,
        description: p.description || '',
        popular: !!p.popular
    })));
});

// User's subscriptions (by telegram userId)
app.get('/api/shop/my-subs', (req, res) => {
    const userId = parseInt(req.query.userId);
    if (!userId) return res.json([]);
    const data = loadData();
    const s = data.settings || {};
    const serverUrl = getBaseUrl(req);
    const mySubs = (data.subscriptions || []).filter(sub =>
        sub.telegramUsers && sub.telegramUsers.includes(userId)
    );
    res.json(mySubs.map(sub => ({
        id: sub.id,
        name: sub.name,
        enabled: sub.enabled,
        expiresAt: sub.expiresAt,
        trafficTotal: sub.trafficTotal,
        trafficUsed: sub.trafficUsed,
        maxDevices: sub.maxDevices,
        devices: (sub.devices || []).map(d => ({ name: d.name })),
        subUrl: `${serverUrl}/sub?token=${sub.token}`
    })));
});

// User's orders (by telegram userId)
app.get('/api/shop/my-orders', (req, res) => {
    const userId = parseInt(req.query.userId);
    if (!userId) return res.json([]);
    const data = loadData();
    const orders = (data.orders || []).filter(o => o.userId === userId).reverse().slice(0, 20);
    res.json(orders.map(o => ({
        id: o.id,
        planName: o.planName,
        price: o.price,
        status: o.status,
        createdAt: o.createdAt
    })));
});

// Create order from Mini App
app.post('/api/shop/create-order', async (req, res) => {
    const { planId, userId, username, firstName, receipt, paymentMethod } = req.body;
    if (!planId || !userId) return res.status(400).json({ error: 'Missing data' });
    const data = loadData();
    if (!(await ensureRequiredChannelsForShop(req, res, userId, data))) return;
    const plan = (data.plans || []).find(p => p.id === planId && p.enabled !== false);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const order = {
        id: generateId(),
        planId: plan.id,
        planName: plan.name,
        price: plan.price,
        userId: parseInt(userId),
        chatId: parseInt(userId),
        username: username || '',
        firstName: firstName || '',
        paymentMethod: paymentMethod || '',
        status: 'pending_review',
        createdAt: Date.now()
    };

    // Save receipt image if provided
    let receiptPath = '';
    if (receipt && receipt.startsWith('data:image')) {
        try {
            const base64Data = receipt.split(',')[1];
            const ext = receipt.match(/data:image\/(.*?);/)?.[1] || 'png';
            const fname = `receipt_${order.id}.${ext}`;
            const dir = path.join(__dirname, 'receipts');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            receiptPath = path.join(dir, fname);
            fs.writeFileSync(receiptPath, Buffer.from(base64Data, 'base64'));
            order.receiptFile = fname;
        } catch (e) { console.log('Receipt save error:', e.message); }
    }

    if (!data.orders) data.orders = [];
    data.orders.push(order);
    if (data.orders.length > 500) data.orders = data.orders.slice(-500);
    saveData(data);

    // Notify admins via bot
    if (global.happBot) {
        const adminIds = (data.settings.adminIds || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);
        const cfg = data.settings || {};
        const caption = `🆕 Новый заказ!\n\n` +
            `👤 ${firstName || 'User'} ${username ? `(@${username})` : ''}\n` +
            `📦 Тариф: ${plan.name}\n` +
            `💰 Сумма: ${plan.price} ${cfg.currency || '₽'}\n` +
            `💳 Оплата: ${order.paymentMethod || cfg.paymentMethod || 'не указано'}\n` +
            `📋 Заказ: #${order.id.substring(0, 8)}`;
        adminIds.forEach(adminId => {
            const opts = {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Подтвердить', callback_data: `approve_order:${order.id}` },
                        { text: '❌ Отклонить', callback_data: `reject_order:${order.id}` }
                    ]]
                }
            };
            if (receiptPath) {
                global.happBot.sendPhoto(adminId, receiptPath, { caption, ...opts }).catch(() => {
                    global.happBot.sendMessage(adminId, caption, opts).catch(() => { });
                });
            } else {
                global.happBot.sendMessage(adminId, caption, opts).catch(() => { });
            }
        });
    }

    res.json({ ok: true, orderId: order.id });
});

async function applyYooKassaPaymentResult(data, order, payment, baseUrl) {
    if (!order) throw new Error('Order not found');
    order.yookassaStatus = payment.status || order.yookassaStatus || '';
    order.yookassaPaid = !!payment.paid;
    order.updatedAt = Date.now();

    const expected = Number(order.price || 0).toFixed(2);
    const actual = payment.amount && payment.amount.value ? Number(payment.amount.value).toFixed(2) : '';
    if (payment.status === 'succeeded') {
        if (actual !== expected) throw new Error(`Payment amount mismatch: expected ${expected}, got ${actual}`);
        if (order.orderType === 'topup') return activateTopUpOrder(data, order, { source: 'YooKassa' });
        return await activateOrder(data, order, { source: 'YooKassa', baseUrl });
    }

    if (payment.status === 'canceled') {
        order.status = 'canceled';
        order.canceledAt = Date.now();
    }
    return { order };
}

app.post('/api/shop/yookassa/create-payment', async (req, res) => {
    try {
        const { planId, userId, username, firstName } = req.body;
        if (!planId || !userId) return res.status(400).json({ error: 'Missing data' });

        const data = loadData();
        if (!(await ensureRequiredChannelsForShop(req, res, userId, data))) return;
        const settings = data.settings || {};
        if (!isYooKassaConfigured(settings)) return res.status(400).json({ error: 'YooKassa is not configured' });

        const plan = (data.plans || []).find(p => p.id === planId && p.enabled !== false);
        if (!plan) return res.status(404).json({ error: 'Plan not found' });
        if (!plan.price || plan.price <= 0) return res.status(400).json({ error: 'Invalid plan price' });

        const order = {
            id: generateId(),
            planId: plan.id,
            planName: plan.name,
            price: Number(plan.price),
            userId: parseInt(userId),
            chatId: parseInt(userId),
            username: username || '',
            firstName: firstName || '',
            paymentProvider: 'yookassa',
            paymentMethod: 'YooKassa',
            status: 'awaiting_payment',
            createdAt: Date.now()
        };

        const baseUrl = makePublicUrl(req, data);
        const payment = await yookassaRequest(settings, 'POST', '/v3/payments', {
            amount: { value: Number(plan.price).toFixed(2), currency: 'RUB' },
            capture: true,
            confirmation: {
                type: 'redirect',
                return_url: `${baseUrl}/shop.html?order=${order.id}`
            },
            description: `HappVPN: ${plan.name}`,
            metadata: {
                orderId: order.id,
                userId: String(userId),
                planId: plan.id
            }
        }, `happvpn-${order.id}`);

        order.yookassaPaymentId = payment.id;
        order.yookassaStatus = payment.status || '';
        order.confirmationUrl = payment.confirmation?.confirmation_url || '';

        if (!data.orders) data.orders = [];
        data.orders.push(order);
        if (data.orders.length > 500) data.orders = data.orders.slice(-500);
        saveData(data);

        res.json({
            ok: true,
            orderId: order.id,
            paymentId: order.yookassaPaymentId,
            confirmationUrl: order.confirmationUrl,
            status: order.status
        });
    } catch (e) {
        console.log('YooKassa create payment error:', e.message);
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/shop/yookassa/create-top-up', async (req, res) => {
    try {
        const { amount, userId, username, firstName } = req.body;
        const topUpAmount = Number(amount);
        if (!userId || !topUpAmount || topUpAmount <= 0) return res.status(400).json({ error: 'Missing data' });

        const data = loadData();
        if (!(await ensureRequiredChannelsForShop(req, res, userId, data))) return;
        const settings = data.settings || {};
        if (!isYooKassaConfigured(settings)) return res.status(400).json({ error: 'YooKassa is not configured' });

        const order = {
            id: generateId(),
            orderType: 'topup',
            planName: 'Пополнение баланса',
            amount: topUpAmount,
            price: topUpAmount,
            userId: parseInt(userId),
            chatId: parseInt(userId),
            username: username || '',
            firstName: firstName || '',
            paymentProvider: 'yookassa',
            paymentMethod: 'YooKassa',
            status: 'awaiting_payment',
            createdAt: Date.now()
        };

        const baseUrl = makePublicUrl(req, data);
        const payment = await yookassaRequest(settings, 'POST', '/v3/payments', {
            amount: { value: topUpAmount.toFixed(2), currency: 'RUB' },
            capture: true,
            confirmation: {
                type: 'redirect',
                return_url: `${baseUrl}/shop.html?topup=${order.id}`
            },
            description: `HappVPN: пополнение баланса ${topUpAmount} RUB`,
            metadata: {
                orderId: order.id,
                orderType: 'topup',
                userId: String(userId)
            }
        }, `happvpn-topup-${order.id}`);

        order.yookassaPaymentId = payment.id;
        order.yookassaStatus = payment.status || '';
        order.confirmationUrl = payment.confirmation?.confirmation_url || '';

        if (!data.orders) data.orders = [];
        data.orders.push(order);
        if (data.orders.length > 500) data.orders = data.orders.slice(-500);
        saveData(data);

        res.json({
            ok: true,
            orderId: order.id,
            paymentId: order.yookassaPaymentId,
            confirmationUrl: order.confirmationUrl,
            status: order.status
        });
    } catch (e) {
        console.log('YooKassa create top-up error:', e.message);
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/shop/yookassa/check-payment', async (req, res) => {
    try {
        const { orderId, userId } = req.body;
        if (!orderId || !userId) return res.status(400).json({ error: 'Missing data' });
        const data = loadData();
        const order = (data.orders || []).find(o => o.id === orderId && o.userId === parseInt(userId));
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (!order.yookassaPaymentId) return res.status(400).json({ error: 'No YooKassa payment for this order' });

        const settings = data.settings || {};
        if (!isYooKassaConfigured(settings)) return res.status(400).json({ error: 'YooKassa is not configured' });

        const payment = await yookassaRequest(settings, 'GET', `/v3/payments/${encodeURIComponent(order.yookassaPaymentId)}`);
        const result = await applyYooKassaPaymentResult(data, order, payment, makePublicUrl(req, data));
        saveData(data);

        res.json({
            ok: true,
            status: order.status,
            orderType: order.orderType || 'plan',
            yookassaStatus: order.yookassaStatus,
            balance: result.balance || result.user?.balance || 0,
            subUrl: result.subUrl || ''
        });
    } catch (e) {
        console.log('YooKassa check payment error:', e.message);
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/payments/yookassa/webhook', async (req, res) => {
    try {
        const event = req.body || {};
        const paymentId = event.object && event.object.id;
        if (!paymentId) return res.json({ ok: true });

        const data = loadData();
        const settings = data.settings || {};
        if (!isYooKassaConfigured(settings)) return res.json({ ok: true });

        const order = (data.orders || []).find(o => o.yookassaPaymentId === paymentId);
        if (!order) return res.json({ ok: true });

        const payment = await yookassaRequest(settings, 'GET', `/v3/payments/${encodeURIComponent(paymentId)}`);
        await applyYooKassaPaymentResult(data, order, payment, makePublicUrl(null, data));
        saveData(data);
        res.json({ ok: true });
    } catch (e) {
        console.log('YooKassa webhook error:', e.message);
        res.status(200).json({ ok: false });
    }
});

function getPlategaAmount(payment) {
    if (payment.paymentDetails && payment.paymentDetails.amount !== undefined) return payment.paymentDetails.amount;
    if (payment.amount !== undefined) return payment.amount;
    return null;
}

async function applyPlategaPaymentResult(data, order, payment, baseUrl) {
    if (!order) throw new Error('Order not found');
    order.plategaStatus = payment.status || order.plategaStatus || '';
    order.updatedAt = Date.now();

    const expected = Number(order.price || 0).toFixed(2);
    const actualAmount = getPlategaAmount(payment);
    const actual = actualAmount !== null && actualAmount !== undefined ? Number(actualAmount).toFixed(2) : '';

    if (payment.status === 'CONFIRMED') {
        if (actual !== expected) throw new Error(`Payment amount mismatch: expected ${expected}, got ${actual}`);
        if (order.orderType === 'topup') return activateTopUpOrder(data, order, { source: 'Platega' });
        return await activateOrder(data, order, { source: 'Platega', baseUrl });
    }

    if (payment.status === 'CANCELED') {
        order.status = 'canceled';
        order.canceledAt = Date.now();
    }
    if (payment.status === 'CHARGEBACKED') {
        order.status = 'failed';
        order.failedAt = Date.now();
    }
    return { order };
}

app.post('/api/shop/platega/create-payment', async (req, res) => {
    try {
        const { planId, userId, username, firstName } = req.body;
        if (!planId || !userId) return res.status(400).json({ error: 'Missing data' });

        const data = loadData();
        if (!(await ensureRequiredChannelsForShop(req, res, userId, data))) return;
        const settings = data.settings || {};
        if (!isPlategaConfigured(settings)) return res.status(400).json({ error: 'Platega is not configured' });

        const plan = (data.plans || []).find(p => p.id === planId && p.enabled !== false);
        if (!plan) return res.status(404).json({ error: 'Plan not found' });
        if (!plan.price || plan.price <= 0) return res.status(400).json({ error: 'Invalid plan price' });

        const order = {
            id: generateId(),
            planId: plan.id,
            planName: plan.name,
            price: Number(plan.price),
            userId: parseInt(userId),
            chatId: parseInt(userId),
            username: username || '',
            firstName: firstName || '',
            paymentProvider: 'platega',
            paymentMethod: 'Platega',
            status: 'awaiting_payment',
            createdAt: Date.now()
        };

        const baseUrl = makePublicUrl(req, data);
        const payload = JSON.stringify({ orderId: order.id, userId: String(userId), planId: plan.id });
        const payment = await plategaRequest(settings, 'POST', '/transaction/process', {
            paymentMethod: parseInt(settings.plategaPaymentMethod) || 11,
            paymentDetails: {
                amount: Number(plan.price),
                currency: 'RUB'
            },
            description: `HappVPN ${plan.name} UserId:${parseInt(userId)}`,
            return: `${baseUrl}/shop.html?order=${order.id}`,
            failedUrl: `${baseUrl}/shop.html?order=${order.id}&failed=1`,
            payload
        });

        order.plategaTransactionId = payment.transactionId;
        order.plategaStatus = payment.status || '';
        order.confirmationUrl = payment.redirect || '';

        if (!order.plategaTransactionId || !order.confirmationUrl) {
            throw new Error('Platega did not return payment link');
        }

        if (!data.orders) data.orders = [];
        data.orders.push(order);
        if (data.orders.length > 500) data.orders = data.orders.slice(-500);
        saveData(data);

        res.json({
            ok: true,
            orderId: order.id,
            paymentId: order.plategaTransactionId,
            confirmationUrl: order.confirmationUrl,
            status: order.status
        });
    } catch (e) {
        console.log('Platega create payment error:', e.message);
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/shop/platega/create-top-up', async (req, res) => {
    try {
        const { amount, userId, username, firstName } = req.body;
        const topUpAmount = Number(amount);
        if (!userId || !topUpAmount || topUpAmount <= 0) return res.status(400).json({ error: 'Missing data' });

        const data = loadData();
        if (!(await ensureRequiredChannelsForShop(req, res, userId, data))) return;
        const settings = data.settings || {};
        if (!isPlategaConfigured(settings)) return res.status(400).json({ error: 'Platega is not configured' });

        const order = {
            id: generateId(),
            orderType: 'topup',
            planName: 'Пополнение баланса',
            amount: topUpAmount,
            price: topUpAmount,
            userId: parseInt(userId),
            chatId: parseInt(userId),
            username: username || '',
            firstName: firstName || '',
            paymentProvider: 'platega',
            paymentMethod: 'Platega',
            status: 'awaiting_payment',
            createdAt: Date.now()
        };

        const baseUrl = makePublicUrl(req, data);
        const payload = JSON.stringify({ orderId: order.id, orderType: 'topup', userId: String(userId) });
        const payment = await plategaRequest(settings, 'POST', '/transaction/process', {
            paymentMethod: parseInt(settings.plategaPaymentMethod) || 11,
            paymentDetails: {
                amount: topUpAmount,
                currency: 'RUB'
            },
            description: `HappVPN balance top-up UserId:${parseInt(userId)}`,
            return: `${baseUrl}/shop.html?topup=${order.id}`,
            failedUrl: `${baseUrl}/shop.html?topup=${order.id}&failed=1`,
            payload
        });

        order.plategaTransactionId = payment.transactionId;
        order.plategaStatus = payment.status || '';
        order.confirmationUrl = payment.redirect || '';
        if (!order.plategaTransactionId || !order.confirmationUrl) throw new Error('Platega did not return payment link');

        if (!data.orders) data.orders = [];
        data.orders.push(order);
        if (data.orders.length > 500) data.orders = data.orders.slice(-500);
        saveData(data);

        res.json({
            ok: true,
            orderId: order.id,
            paymentId: order.plategaTransactionId,
            confirmationUrl: order.confirmationUrl,
            status: order.status
        });
    } catch (e) {
        console.log('Platega create top-up error:', e.message);
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/shop/platega/check-payment', async (req, res) => {
    try {
        const { orderId, userId } = req.body;
        if (!orderId || !userId) return res.status(400).json({ error: 'Missing data' });
        const data = loadData();
        const order = (data.orders || []).find(o => o.id === orderId && o.userId === parseInt(userId));
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (!order.plategaTransactionId) return res.status(400).json({ error: 'No Platega payment for this order' });

        const settings = data.settings || {};
        if (!isPlategaConfigured(settings)) return res.status(400).json({ error: 'Platega is not configured' });

        const payment = await plategaRequest(settings, 'GET', `/transaction/${encodeURIComponent(order.plategaTransactionId)}`);
        const result = await applyPlategaPaymentResult(data, order, payment, makePublicUrl(req, data));
        saveData(data);

        res.json({
            ok: true,
            status: order.status,
            orderType: order.orderType || 'plan',
            plategaStatus: order.plategaStatus,
            balance: result.balance || result.user?.balance || 0,
            subUrl: result.subUrl || ''
        });
    } catch (e) {
        console.log('Platega check payment error:', e.message);
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/payments/platega/webhook', async (req, res) => {
    try {
        const event = req.body || {};
        const transactionId = event.id;
        if (!transactionId) return res.json({ ok: true });

        const data = loadData();
        const settings = data.settings || {};
        if (!isPlategaConfigured(settings)) return res.json({ ok: true });

        const headerMerchant = req.headers['x-merchantid'] || '';
        const headerSecret = req.headers['x-secret'] || '';
        if (!secureCompare(headerMerchant, settings.plategaMerchantId) || !secureCompare(headerSecret, settings.plategaSecretKey)) {
            return res.status(401).json({ ok: false });
        }

        const order = (data.orders || []).find(o => o.plategaTransactionId === transactionId);
        if (!order) return res.json({ ok: true });

        const payment = await plategaRequest(settings, 'GET', `/transaction/${encodeURIComponent(transactionId)}`);
        await applyPlategaPaymentResult(data, order, payment, makePublicUrl(null, data));
        saveData(data);
        res.json({ ok: true });
    } catch (e) {
        console.log('Platega webhook error:', e.message);
        res.status(200).json({ ok: false });
    }
});

// Purchase with balance (instant, no admin approval needed)
app.post('/api/shop/buy-with-balance', async (req, res) => {
    try {
        const { planId, userId } = req.body;
        if (!planId || !userId) return res.status(400).json({ error: 'Missing data' });
        const data = loadData();
        if (!(await ensureRequiredChannelsForShop(req, res, userId, data))) return;
        const basePlan = (data.plans || []).find(p => p.id === planId && p.enabled !== false);
        if (!basePlan) return res.status(404).json({ error: 'Plan not found' });
        const plan = { ...basePlan, templateIds: mergeIds(basePlan.templateIds || []) };

        if (!data.shopUsers) data.shopUsers = [];
        let user = data.shopUsers.find(u => u.userId === parseInt(userId));
        if (!user) return res.status(400).json({ error: 'Not enough balance' });
        if ((user.balance || 0) < plan.price) return res.status(400).json({ error: 'Not enough balance' });

        const uid = parseInt(userId);
        const donorOrder = {
            id: generateId(),
            planId: plan.id,
            planName: plan.name,
            userId: uid,
            chatId: uid,
            username: user.username || '',
            firstName: user.firstName || '',
            status: 'balance_processing',
            createdAt: Date.now()
        };
        const threeDhTemplateIds = await attachThreeDhTemplateForOrder(data, donorOrder, plan);
        plan.templateIds = mergeIds(plan.templateIds || [], threeDhTemplateIds);

        // Deduct balance only after external donor provisioning succeeds.
        user.balance -= plan.price;
        if (!user.balanceHistory) user.balanceHistory = [];
        user.balanceHistory.push({ amount: -plan.price, description: `Покупка: ${plan.name}`, date: Date.now() });

        const { sub, action } = activatePlanForUser(data, plan, uid, {
            note: `Баланс | User ${userId} | ${plan.name}`,
            templateIds: threeDhTemplateIds
        });
        donorOrder.status = 'completed';
        donorOrder.subscriptionId = sub.id;
        donorOrder.completedAt = Date.now();
        if (threeDhTemplateIds.length) {
            if (!data.orders) data.orders = [];
            data.orders.push(donorOrder);
            if (data.orders.length > 500) data.orders = data.orders.slice(-500);
        }

        const url = `${makePublicUrl(req, data)}/sub?token=${sub.token}`;
        saveData(data);

        // Notify user via bot
        notifySubscriptionActivated(uid, plan, sub, action, url);
        if (global.scheduleRelaySync) global.scheduleRelaySync();

        res.json({ ok: true, subUrl: url, balance: user.balance, action });
    } catch (e) {
        console.log('Balance purchase error:', e.message);
        res.status(400).json({ error: e.message });
    }
});

// Buy additional devices
app.post('/api/shop/buy-device', async (req, res) => {
    const { userId, subId, qty } = req.body;
    if (!userId || !subId || !qty || qty < 1) return res.status(400).json({ error: 'Missing data' });
    const data = loadData();
    if (!(await ensureRequiredChannelsForShop(req, res, userId, data))) return;
    const s = data.settings || {};
    const devicePrice = parseFloat(s.devicePrice) || 0;
    if (devicePrice <= 0) return res.status(400).json({ error: 'Device purchase disabled' });

    const sub = (data.subscriptions || []).find(x => x.id === subId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    if (!data.shopUsers) data.shopUsers = [];
    let user = data.shopUsers.find(u => u.userId === parseInt(userId));
    if (!user) return res.status(400).json({ error: 'User not found' });

    const cost = qty * devicePrice;
    if ((user.balance || 0) < cost) return res.status(400).json({ error: 'Not enough balance' });

    // Deduct balance
    user.balance -= cost;
    if (!user.balanceHistory) user.balanceHistory = [];
    user.balanceHistory.push({ amount: -cost, description: `+${qty} устройств`, date: Date.now() });

    // Increase max devices
    sub.maxDevices = (sub.maxDevices || 0) + parseInt(qty);
    sub.notes = (sub.notes || '') + ` | +${qty} устр.`;
    saveData(data);

    // Notify user
    if (global.happUserBot) {
        global.happUserBot.sendMessage(parseInt(userId),
            `✅ Лимит устройств увеличен!\n\n📱 Новый лимит: ${sub.maxDevices}\n💰 Списано: ${cost} ${s.currency || '₽'}`
        ).catch(() => { });
    }

    res.json({ ok: true, balance: user.balance, maxDevices: sub.maxDevices });
});

// Consolidated user data for Mini App home
app.get('/api/shop/user-data', async (req, res) => {
    const userId = parseInt(req.query.userId);
    if (!userId) return res.json({});
    const data = loadData();
    const s = data.settings || {};
    const serverUrl = getBaseUrl(req);
    const required = await checkRequiredChannels(userId, s);

    // Find user profile
    if (!data.shopUsers) data.shopUsers = [];
    let user = data.shopUsers.find(u => u.userId === userId);
    if (!user) {
        user = { userId, balance: 0, referralCode: generateId().substring(0, 8), referredBy: null, referralCount: 0, referralInvited: 0, referralDaysBonus: 0, balanceHistory: [], createdAt: Date.now() };
        data.shopUsers.push(user);
    }
    // Save name/username from Mini App init data
    let changed = false;
    if (req.query.firstName && req.query.firstName !== user.firstName) { user.firstName = req.query.firstName; changed = true; }
    if (req.query.username && req.query.username !== user.username) { user.username = req.query.username; changed = true; }
    if (changed || !user.createdAt) { user.createdAt = user.createdAt || Date.now(); saveData(data); }

    // Active subscription
    const mySubs = (data.subscriptions || []).filter(sub => sub.telegramUsers && sub.telegramUsers.includes(userId));
    const activeSub = mySubs.find(sub => sub.enabled !== false && (!sub.expiresAt || Date.now() < sub.expiresAt)) || mySubs[0] || null;

    let subData = null;
    if (activeSub) {
        subData = {
            id: activeSub.id, name: activeSub.name, enabled: activeSub.enabled,
            expiresAt: activeSub.expiresAt, trafficTotal: activeSub.trafficTotal,
            trafficUsed: activeSub.trafficUsed, maxDevices: activeSub.maxDevices,
            devices: (activeSub.devices || []).map(d => ({ name: d.name })),
            subUrl: `${serverUrl}/sub?token=${activeSub.token}`
        };
    }

    // Calculate referral balance earned from history
    const referralBalanceEarned = (user.balanceHistory || [])
        .filter(h => h.type === 'referral')
        .reduce((sum, h) => sum + (h.amount || 0), 0);

    res.json({
        requiredSubscription: required.ok ? null : {
            required: true,
            channels: publicRequiredChannels(s)
        },
        activeSub: subData,
        balance: user.balance || 0,
        referralCode: user.referralCode || '',
        referralCount: user.referralCount || 0,
        referralInvited: user.referralInvited || 0,
        referralBalanceEarned: referralBalanceEarned,
        balanceHistory: (user.balanceHistory || []).slice(-20).reverse()
    });
});

// Top-up request
app.post('/api/shop/top-up', async (req, res) => {
    const { userId, amount, firstName, paymentMethod } = req.body;
    if (!userId || !amount) return res.status(400).json({ error: 'Missing data' });
    const data = loadData();
    if (!(await ensureRequiredChannelsForShop(req, res, userId, data))) return;
    if (!data.topUpRequests) data.topUpRequests = [];
    const request = { id: generateId(), userId: parseInt(userId), amount: parseInt(amount), firstName: firstName || '', paymentMethod: paymentMethod || '', status: 'pending', createdAt: Date.now() };
    data.topUpRequests.push(request);
    saveData(data);

    // Notify admins
    if (global.happBot) {
        const adminIds = (data.settings.adminIds || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);
        const cur = (data.settings || {}).currency || '₽';
        adminIds.forEach(adminId => {
            global.happBot.sendMessage(adminId,
                `💳 *Заявка на пополнение*\n\n👤 ${(firstName || '').replace(/[_*[\]()~\`>#+=|{}.!\\-]/g, '\\$&')}\n💰 Сумма: *${amount} ${cur.replace(/[_*[\]()~\`>#+=|{}.!\\-]/g, '\\$&')}*\n💳 Оплата: ${(request.paymentMethod || 'не указано').replace(/[_*[\]()~\`>#+=|{}.!\\-]/g, '\\$&')}\n📋 ID: ${request.id.substring(0, 8)}`,
                {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✅ Подтвердить', callback_data: `approve_topup:${request.id}` },
                            { text: '❌ Отклонить', callback_data: `reject_topup:${request.id}` }
                        ]]
                    }
                }
            ).catch(() => { });
        });
    }
    res.json({ ok: true });
});

// My tickets
app.get('/api/shop/my-tickets', (req, res) => {
    const userId = parseInt(req.query.userId);
    if (!userId) return res.json([]);
    const data = loadData();
    const tickets = (data.tickets || []).filter(t => t.userId === userId).reverse().slice(0, 20);
    res.json(tickets);
});

// Create ticket
app.post('/api/shop/create-ticket', async (req, res) => {
    const { userId, subject, message, firstName, username } = req.body;
    if (!userId || !subject || !message) return res.status(400).json({ error: 'Missing data' });
    const data = loadData();
    if (!(await ensureRequiredChannelsForShop(req, res, userId, data))) return;
    if (!data.tickets) data.tickets = [];
    const ticket = {
        id: generateId(), userId: parseInt(userId), chatId: parseInt(userId), username: username || '', firstName: firstName || '',
        subject, status: 'open', createdAt: Date.now(),
        messages: [{ from: 'user', text: message, date: Date.now() }]
    };
    data.tickets.push(ticket);
    saveData(data);

    // Notify admins
    if (global.happBot) {
        const adminIds = (data.settings.adminIds || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);
        adminIds.forEach(adminId => {
            global.happBot.sendMessage(adminId,
                `📩 *Новое обращение*\n\n👤 ${(firstName || '').replace(/[_*[\]()~\`>#+=|{}.!\\-]/g, '\\$&')} ${username ? `(@${username.replace(/[_*[\]()~\`>#+=|{}.!\\-]/g, '\\$&')})` : ''}\n📋 ${subject.replace(/[_*[\]()~\`>#+=|{}.!\\-]/g, '\\$&')}\n\n💬 ${message.substring(0, 200).replace(/[_*[\]()~\`>#+=|{}.!\\-]/g, '\\$&')}`,
                {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '💬 Ответить', callback_data: `reply_ticket:${ticket.id}` },
                            { text: '🔒 Закрыть', callback_data: `close_ticket:${ticket.id}` }
                        ]]
                    }
                }
            ).catch(() => { });
        });
    }
    res.json({ ok: true, ticketId: ticket.id });
});

// Reply to ticket (user)
app.post('/api/shop/ticket-reply', (req, res) => {
    const { ticketId, userId, message } = req.body;
    if (!ticketId || !userId || !message) return res.status(400).json({ error: 'Missing data' });
    const data = loadData();
    const ticket = (data.tickets || []).find(t => t.id === ticketId && t.userId === parseInt(userId));
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    if (!ticket.messages) ticket.messages = [];
    ticket.messages.push({ from: 'user', text: message, date: Date.now() });
    ticket.updatedAt = Date.now();
    saveData(data);

    // Notify admins
    if (global.happBot) {
        const adminIds = (data.settings.adminIds || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);
        adminIds.forEach(adminId => {
            global.happBot.sendMessage(adminId,
                `💬 Ответ в тикете #${ticket.id.substring(0, 8)}\n👤 ${ticket.firstName || 'User'}\n\n${message.substring(0, 300)}`,
                { reply_markup: { inline_keyboard: [[{ text: '💬 Ответить', callback_data: `reply_ticket:${ticket.id}` }, { text: '🔒 Закрыть', callback_data: `close_ticket:${ticket.id}` }]] } }
            ).catch(() => { });
        });
    }
    res.json({ ok: true });
});

// ===== ADMIN: Tickets management =====
app.get('/api/tickets', authMiddleware, (req, res) => {
    const data = loadData();
    const status = req.query.status;
    let tickets = (data.tickets || []).slice().reverse();
    if (status) tickets = tickets.filter(t => t.status === status);
    res.json(tickets);
});

app.post('/api/tickets/:id/reply', authMiddleware, (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message' });
    const data = loadData();
    const ticket = (data.tickets || []).find(t => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    if (!ticket.messages) ticket.messages = [];
    ticket.messages.push({ from: 'admin', text: message, date: Date.now() });
    ticket.updatedAt = Date.now();
    saveData(data);

    // Notify user via client bot
    if (global.happUserBot && (ticket.chatId || ticket.userId)) {
        global.happUserBot.sendMessage(ticket.chatId || ticket.userId,
            `💬 Ответ поддержки:\n\n📋 ${ticket.subject}\n\n${message}`
        ).catch(() => { });
    }
    res.json({ ok: true });
});

app.post('/api/tickets/:id/close', authMiddleware, (req, res) => {
    const data = loadData();
    const ticket = (data.tickets || []).find(t => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    ticket.status = 'closed';
    ticket.closedAt = Date.now();
    saveData(data);
    // Notify user
    if (global.happUserBot && (ticket.chatId || ticket.userId)) {
        global.happUserBot.sendMessage(ticket.chatId || ticket.userId,
            `✅ Ваш тикет "${ticket.subject}" закрыт.\nСпасибо за обращение!`
        ).catch(() => { });
    }
    res.json({ ok: true });
});

// ===== ADMIN: Top-up management =====
app.get('/api/top-up-requests', authMiddleware, (req, res) => {
    const data = loadData();
    res.json((data.topUpRequests || []).slice().reverse());
});

app.post('/api/top-up-requests/:id/approve', authMiddleware, (req, res) => {
    const data = loadData();
    const request = (data.topUpRequests || []).find(r => r.id === req.params.id);
    if (!request) return res.status(404).json({ error: 'Not found' });
    if (request.status === 'approved') return res.json({ ok: true });

    request.status = 'approved';
    request.approvedAt = Date.now();

    // Add balance
    if (!data.shopUsers) data.shopUsers = [];
    let user = data.shopUsers.find(u => u.userId === request.userId);
    if (!user) { user = { userId: request.userId, balance: 0, referralCode: generateId().substring(0, 8), balanceHistory: [] }; data.shopUsers.push(user); }
    user.balance = (user.balance || 0) + request.amount;
    if (!user.balanceHistory) user.balanceHistory = [];
    user.balanceHistory.push({ amount: request.amount, description: 'Пополнение баланса', date: Date.now() });

    saveData(data);

    // Notify user
    if (global.happBot) {
        const cur = (data.settings || {}).currency || '₽';
        global.happBot.sendMessage(request.userId, `✅ Баланс пополнен на ${request.amount} ${cur}!\nТекущий баланс: ${user.balance} ${cur}`).catch(() => { });
    }
    res.json({ ok: true });
});

// ===== ADMIN: Shop users =====
app.get('/api/shop-users', authMiddleware, (req, res) => {
    const data = loadData();
    const users = (data.shopUsers || []).map(u => ({ ...u }));
    // Enrich with names from orders
    (data.orders || []).forEach(o => {
        const u = users.find(x => x.userId === o.userId);
        if (u) {
            if (o.firstName) u.firstName = o.firstName;
            if (o.username) u.username = o.username;
        }
    });
    // Enrich with names from subscriptions telegramUsers (add users not yet in shopUsers)
    (data.subscriptions || []).forEach(sub => {
        (sub.telegramUsers || []).forEach(uid => {
            if (!users.find(x => x.userId === uid)) {
                users.push({ userId: uid, balance: 0, blocked: false, firstName: '', username: '', createdAt: sub.createdAt || 0 });
            }
        });
        // Try to get name from sub.notes
        if (sub.notes && sub.telegramUsers) {
            const nameMatch = sub.notes.match(/— (.+?)$/);
            if (nameMatch) {
                sub.telegramUsers.forEach(uid => {
                    const u = users.find(x => x.userId === uid);
                    if (u && !u.firstName) u.firstName = nameMatch[1].split(' |')[0].trim();
                });
            }
        }
    });
    res.json(users);
});

app.put('/api/shop-users/:id/balance', authMiddleware, (req, res) => {
    const data = loadData();
    if (!data.shopUsers) data.shopUsers = [];
    let user = data.shopUsers.find(u => u.userId === parseInt(req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { amount, description } = req.body;
    user.balance = (user.balance || 0) + (parseFloat(amount) || 0);
    if (!user.balanceHistory) user.balanceHistory = [];
    user.balanceHistory.push({ amount: parseFloat(amount) || 0, description: description || 'Корректировка баланса', date: Date.now() });
    saveData(data);
    res.json(user);
});

// Update user profile (block, set balance)
app.put('/api/shop-users/:id', authMiddleware, (req, res) => {
    const data = loadData();
    if (!data.shopUsers) data.shopUsers = [];
    let user = data.shopUsers.find(u => u.userId === parseInt(req.params.id));
    if (!user) {
        user = { userId: parseInt(req.params.id), balance: 0, referralCode: generateId().substring(0, 8), balanceHistory: [], createdAt: Date.now() };
        data.shopUsers.push(user);
    }
    const { blocked, balance } = req.body;
    if (blocked !== undefined) {
        user.blocked = !!blocked;
        // If blocking — disable all user subscriptions
        if (user.blocked) {
            (data.subscriptions || []).forEach(sub => {
                if (sub.telegramUsers && sub.telegramUsers.includes(user.userId) && sub.enabled !== false) {
                    sub.enabled = false;
                    sub.notes = (sub.notes || '') + ' | blocked by admin';
                }
            });
        }
    }
    if (balance !== undefined) {
        const diff = parseFloat(balance) - (user.balance || 0);
        user.balance = parseFloat(balance);
        if (!user.balanceHistory) user.balanceHistory = [];
        user.balanceHistory.push({ amount: diff, description: 'Установлено админом', date: Date.now() });
    }
    saveData(data);
    res.json(user);
});

// Broadcast message to all users
app.post('/api/broadcast', authMiddleware, async (req, res) => {
    const { message, target, parseMode } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message' });
    const data = loadData();
    const allUserIds = new Set();
    const blockedUserIds = new Set((data.shopUsers || []).filter(u => u.blocked).map(u => parseInt(u.userId)));
    const activeUserIds = new Set();
    (data.shopUsers || []).forEach(u => { if (!u.blocked) allUserIds.add(parseInt(u.userId)); });
    (data.subscriptions || []).forEach(s => {
        const isActive = s.enabled !== false && (!s.expiresAt || Date.now() < s.expiresAt);
        (s.telegramUsers || []).forEach(u => {
            const uid = parseInt(u);
            if (!blockedUserIds.has(uid)) allUserIds.add(uid);
            if (isActive && !blockedUserIds.has(uid)) activeUserIds.add(uid);
        });
    });
    const recipients = [...allUserIds].filter(uid => {
        if (target === 'active') return activeUserIds.has(uid);
        if (target === 'inactive') return !activeUserIds.has(uid);
        return true;
    });
    if (recipients.length === 0) return res.json({ ok: true, sent: 0, failed: 0, total: 0 });
    const bot = global.happUserBot || global.happBot;
    if (!bot) return res.status(503).json({ error: 'No bot running' });
    const opts = {};
    if (['HTML', 'Markdown', 'MarkdownV2'].includes(parseMode)) opts.parse_mode = parseMode;
    let sent = 0, failed = 0;
    for (const uid of recipients) {
        try {
            await bot.sendMessage(uid, message, opts);
            sent++;
        } catch { failed++; }
        await new Promise(r => setTimeout(r, 50));
    }
    res.json({ ok: true, sent, failed, total: recipients.length });
});

// Assign subscription to user
app.post('/api/shop-users/:id/assign-sub', authMiddleware, (req, res) => {
    const { days, templateId } = req.body;
    if (!days || days <= 0) return res.status(400).json({ error: 'Missing days' });
    const userId = parseInt(req.params.id);
    const data = loadData();
    // Use specified template or all active non-trial templates
    let tplIds;
    if (templateId) {
        const tpl = (data.templates || []).find(t => t.id === templateId);
        if (!tpl) return res.status(400).json({ error: 'Template not found' });
        tplIds = [templateId];
    } else {
        tplIds = (data.templates || []).filter(t => t.enabled !== false && !/^Trial-\d+$/.test(t.name) && !t.threeDh).map(t => t.id);
    }
    if (tplIds.length === 0) return res.status(400).json({ error: 'No active templates' });
    if (!data.subscriptions) data.subscriptions = [];
    const existing = data.subscriptions.find(s =>
        s.telegramUsers && s.telegramUsers.includes(userId) && s.enabled !== false && !s.isTrial
    );
    let sub;
    if (existing) {
        const base = (existing.expiresAt && existing.expiresAt > Date.now()) ? existing.expiresAt : Date.now();
        existing.expiresAt = base + (parseInt(days) * 86400000);
        existing.notes = (existing.notes || '') + ` | +${days}д (admin-panel)`;
        sub = existing;
    } else {
        sub = {
            id: generateId(), name: `Подписка — User ${userId}`,
            trafficTotal: 0, trafficUsed: 0, maxDevices: 0,
            token: generateToken(), templateIds: tplIds, enabled: true,
            expiresAt: Date.now() + (parseInt(days) * 86400000),
            notes: `Назначена через панель | User ${userId}`,
            devices: [], telegramUsers: [userId],
            createdAt: Date.now(), accessCount: 0
        };
        data.subscriptions.push(sub);
    }
    saveData(data);
    // Notify user
    if (global.happUserBot) {
        const serverUrl = (data.settings || {}).serverUrl || '';
        const url = serverUrl ? `${serverUrl}/sub?token=${sub.token}` : '';
        const txt = existing
            ? `✅ Ваша подписка продлена на ${days} дней!\nДо: ${new Date(sub.expiresAt).toLocaleDateString('ru-RU')}${url ? '\n🔗 ' + url : ''}`
            : `🎉 Вам назначена подписка на ${days} дней!${url ? '\n🔗 ' + url : ''}\n\nСкопируйте и добавьте в Happ VPN.`;
        global.happUserBot.sendMessage(userId, txt).catch(() => { });
    }
    if (global.scheduleRelaySync) global.scheduleRelaySync();
    res.json({ ok: true, sub });
});

// Send direct message to user
app.post('/api/shop-users/:id/send-message', authMiddleware, async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message' });
    const userId = parseInt(req.params.id);
    const bot = global.happUserBot || global.happBot;
    if (!bot) return res.status(503).json({ error: 'No bot running' });
    try {
        await bot.sendMessage(userId, message);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to send: ' + e.message });
    }
});

// Block/Unblock IP
app.post('/api/block-ip', authMiddleware, (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'No IP' });
    const data = loadData();
    if (!data.blockedIps) data.blockedIps = [];
    if (!data.blockedIps.includes(ip)) {
        data.blockedIps.push(ip);
        saveData(data);
        scheduleRelaySync();
    }
    res.json({ ok: true, blocked: data.blockedIps });
});

app.delete('/api/block-ip', authMiddleware, (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'No IP' });
    const data = loadData();
    data.blockedIps = (data.blockedIps || []).filter(b => b !== ip);
    saveData(data);
    scheduleRelaySync();
    res.json({ ok: true, blocked: data.blockedIps });
});

app.get('/api/blocked-ips', authMiddleware, (req, res) => {
    res.json(loadData().blockedIps || []);
});

// Suspicious IP alerter
const alertedIps = new Set();
function checkSuspiciousIps() {
    const data = loadData();
    const s = data.settings || {};
    if (s.notifySuspiciousIp === false) return;
    if (!global.happBot || !s.adminChatId) return;

    const logPath = '/var/log/xray/access.log';
    if (!fs.existsSync(logPath)) return;

    try {
        const stat = fs.statSync(logPath);
        const readSize = Math.min(stat.size, 100000);
        const fd = fs.openSync(logPath, 'r');
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
        fs.closeSync(fd);

        // Known device IPs
        const knownIps = new Set();
        for (const sub of (data.subscriptions || [])) {
            for (const dev of (sub.devices || [])) {
                if (dev.ip) knownIps.add(dev.ip.replace(/^::ffff:/, ''));
            }
        }

        for (const line of buf.toString('utf8').split('\n')) {
            if (!line.includes('accepted')) continue;
            const em = line.match(/email:\s*(\S+)/);
            const ip4 = line.match(/from\s+(\d+\.\d+\.\d+\.\d+):/);
            if (!em || !ip4) continue;
            const ip = ip4[1];
            const email = em[1];

            if (!knownIps.has(ip) && !alertedIps.has(ip)) {
                alertedIps.add(ip);
                // Send Telegram alert
                lookupGeo(ip).then(geo => {
                    const geoStr = geo ? `📍 ${geo.city}, ${geo.country} · ${geo.isp}` : '';
                    const msg = `🚨 *Подозрительный IP*\n\n` +
                        `🔑 Подписка: *${email}*\n` +
                        `🌐 IP: \`${ip}\`\n` +
                        `${geoStr}\n\n` +
                        `_IP не зарегистрирован как устройство_`;
                    global.happBot.sendMessage(s.adminChatId, msg, { parse_mode: 'Markdown' }).catch(() => { });
                });
            }
        }
    } catch { }
}

// Check suspicious IPs every 2 min
setInterval(checkSuspiciousIps, 120000);
setTimeout(checkSuspiciousIps, 15000);

// Monitoring
app.get('/api/monitoring', authMiddleware, (req, res) => {
    const data = loadData();
    const logs = data.logs || [];
    const subsList = data.subscriptions || [];
    const now = Date.now();
    const HOUR = 3600000;

    const result = subsList.map(sub => {
        const devices = sub.devices || [];
        const stripV6 = ip => (ip || '').replace(/^::ffff:/, '');
        const uniqueIps = [...new Set(devices.map(d => stripV6(d.ip)).filter(Boolean))];
        const uniqueUAs = [...new Set(devices.map(d => d.ua).filter(Boolean))];

        // Recent logs for this sub (last 24h)
        const subLogs = logs.filter(l => l.subId === sub.id && l.ts >= now - 24 * HOUR);
        const recentIps = [...new Set(subLogs.map(l => stripV6(l.ip)).filter(Boolean))];
        const recentHwids = [...new Set(subLogs.map(l => l.hwid).filter(Boolean))];

        // All-time IPs from logs
        const allSubLogs = logs.filter(l => l.subId === sub.id);
        const allTimeIps = [...new Set(allSubLogs.map(l => stripV6(l.ip)).filter(Boolean))];

        // Suspicion analysis
        let level = 'ok';
        let reasons = [];
        const maxDev = sub.maxDevices || 0;

        if (devices.length >= 3) {
            level = 'high';
            reasons.push(`${devices.length} устройств подключено`);
        } else if (devices.length === 2) {
            level = 'medium';
            reasons.push('2 устройства подключено');
        }

        if (uniqueIps.length >= 3) {
            level = 'high';
            reasons.push(`${uniqueIps.length} разных IP`);
        } else if (uniqueIps.length === 2) {
            if (level !== 'high') level = 'medium';
            reasons.push('2 разных IP');
        }

        // Different platforms (Android + Windows + iOS etc)
        const platforms = new Set();
        uniqueUAs.forEach(ua => {
            const ual = ua.toLowerCase();
            if (ual.includes('android')) platforms.add('Android');
            else if (ual.includes('windows')) platforms.add('Windows');
            else if (ual.includes('ios') || ual.includes('iphone') || ual.includes('ipad')) platforms.add('iOS');
            else if (ual.includes('mac')) platforms.add('macOS');
            else if (ual.includes('linux')) platforms.add('Linux');
            else platforms.add('Other');
        });
        if (platforms.size >= 2) {
            if (level !== 'high') level = 'medium';
            reasons.push(`Платформы: ${[...platforms].join(', ')}`);
        }

        if (maxDev > 0 && devices.length >= maxDev) {
            reasons.push('Лимит устройств исчерпан');
        }
        // Traffic from accumulated stats
        const trafficData = (data.traffic || {})[sub.name] || { up: 0, down: 0 };
        const trafficTotal = trafficData.up + trafficData.down;

        return {
            id: sub.id,
            name: sub.name || '—',
            notes: sub.notes || '',
            enabled: sub.enabled !== false,
            expired: sub.expiresAt ? now > sub.expiresAt : false,
            maxDevices: maxDev,
            deviceCount: devices.length,
            devices: devices.map(d => ({
                hwid: d.hwid,
                name: d.name || 'Устройство',
                ip: stripV6(d.ip) || '—',
                ua: d.ua || '—',
                firstSeen: d.firstSeen,
                lastSeen: d.lastSeen
            })),
            uniqueIps,
            allTimeIps,
            recentIps,
            recentHwids,
            platforms: [...platforms],
            level,
            reasons,
            connectionsToday: subLogs.length,
            lastAccessed: sub.lastAccessed || 0,
            traffic: { up: trafficData.up, down: trafficData.down, total: trafficTotal }
        };
    });

    // Sort: high first, then medium, then ok; then by device count desc
    const order = { high: 0, medium: 1, ok: 2 };
    result.sort((a, b) => (order[a.level] - order[b.level]) || (b.deviceCount - a.deviceCount));

    res.json(result);
});

// IP Geolocation cache
const geoCache = {};
const GEO_TTL = 3600000; // 1 hour

function lookupGeo(ip) {
    return new Promise(resolve => {
        if (geoCache[ip] && Date.now() - geoCache[ip].ts < GEO_TTL) {
            return resolve(geoCache[ip].data);
        }
        const http = require('http');
        http.get(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,isp,org,regionName`, { timeout: 2000 }, resp => {
            let d = '';
            resp.on('data', c => d += c);
            resp.on('end', () => {
                try {
                    const j = JSON.parse(d);
                    if (j.status === 'success') {
                        const data = { country: j.country, countryCode: j.countryCode, city: j.city, region: j.regionName, isp: j.isp, org: j.org };
                        geoCache[ip] = { ts: Date.now(), data };
                        resolve(data);
                    } else resolve(null);
                } catch { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// Traffic collector — accumulates per-sub traffic from Xray stats
function collectTraffic() {
    const { exec } = require('child_process');
    exec('xray api statsquery --server=127.0.0.1:10085 -reset', { timeout: 3000 }, (err, out) => {
        if (err || !out) return;
        try {
            const parsed = JSON.parse(out);
            const stats = parsed.stat || [];
            const deltas = {}; // email -> { up, down }
            for (const s of stats) {
                if (!s.name || !s.name.startsWith('user>>>')) continue;
                const parts = s.name.split('>>>');
                if (parts.length >= 4 && parts[0] === 'user') {
                    const email = parts[1];
                    const dir = parts[3]; // uplink or downlink
                    const val = parseInt(s.value) || 0;
                    if (val > 0) {
                        if (!deltas[email]) deltas[email] = { up: 0, down: 0 };
                        if (dir === 'uplink') deltas[email].up += val;
                        else if (dir === 'downlink') deltas[email].down += val;
                    }
                }
            }
            if (Object.keys(deltas).length === 0) return;

            // Save to data.json & update subscriptions
            const data = loadData();
            if (!data.traffic) data.traffic = {};
            for (const [email, d] of Object.entries(deltas)) {
                if (!data.traffic[email]) data.traffic[email] = { up: 0, down: 0, lastUpdate: '' };
                data.traffic[email].up += d.up;
                data.traffic[email].down += d.down;
                data.traffic[email].lastUpdate = new Date().toISOString();

                // Sync trafficUsed to subscription (in GB)
                const subId = email.replace('sub-', '');
                const sub = (data.subscriptions || []).find(s => s.id === subId);
                if (sub) {
                    const totalBytes = data.traffic[email].up + data.traffic[email].down;
                    sub.trafficUsed = totalBytes / 1073741824; // bytes → GB

                    // Auto-disable on limit exceeded
                    if (sub.trafficTotal > 0 && sub.trafficUsed >= sub.trafficTotal && sub.enabled !== false) {
                        sub.enabled = false;
                        console.log(`  🚫 ${sub.name}: traffic limit ${sub.trafficTotal} GB exceeded, disabled`);
                        scheduleRelaySync(); // regenerate Xray config to remove this user
                        // Telegram alert
                        const s = data.settings || {};
                        if (global.happBot && s.adminChatId) {
                            global.happBot.sendMessage(s.adminChatId,
                                `📊 *Лимит трафика*\n\n` +
                                `📋 *${sub.name}*\n` +
                                `Использовано: ${sub.trafficUsed.toFixed(2)} / ${sub.trafficTotal} GB\n` +
                                `_Подписка автоматически деактивирована_`,
                                { parse_mode: 'Markdown' }
                            ).catch(() => { });
                        }
                    }
                }
            }
            saveData(data);
        } catch { }
    });
}

// Start traffic collector every 60s
setInterval(collectTraffic, 60000);
setTimeout(collectTraffic, 5000); // first run after 5s

// Online connections (real-time) — uses Xray access log for IP→sub
app.get('/api/online', authMiddleware, (req, res) => {
    const data = loadData();
    const s = data.settings || {};
    if (!s.relayDomain) return res.json({ connections: [], mode: 'no-relay' });

    const basePort = parseInt(s.relayBasePort) || 10001;
    const mainPort = parseInt(s.relayMainPort) || 8443;

    const portMap = {};
    portMap[mainPort] = { name: '🛡 ' + s.relayDomain, template: 'Direct VPN' };
    let portIdx = 0;
    for (const tpl of (data.templates || [])) {
        if (tpl.enabled === false) continue;
        for (const uri of (tpl.uris || [])) {
            let name = 'Server';
            const h = uri.lastIndexOf('#');
            if (h !== -1) try { name = decodeURIComponent(uri.substring(h + 1)); } catch { }
            portMap[basePort + portIdx] = { name, template: tpl.name };
            portIdx++;
        }
    }

    const allPorts = Object.keys(portMap).map(Number);

    // Parse Xray access log → IP to email
    const ipToEmail = {};
    try {
        const logPath = '/var/log/xray/access.log';
        if (fs.existsSync(logPath)) {
            const stat = fs.statSync(logPath);
            const readSize = Math.min(stat.size, 200000);
            const fd = fs.openSync(logPath, 'r');
            const buf = Buffer.alloc(readSize);
            fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
            fs.closeSync(fd);
            for (const line of buf.toString('utf8').split('\n')) {
                const em = line.match(/email:\s*(\S+)/);
                const ip4 = line.match(/(\d+\.\d+\.\d+\.\d+):\d+\s+accepted/);
                if (em && ip4) ipToEmail[ip4[1]] = em[1];
                const ip6 = line.match(/::ffff:(\d+\.\d+\.\d+\.\d+).*accepted/);
                if (em && ip6) ipToEmail[ip6[1]] = em[1];
            }
        }
    } catch { }

    // Device IP fallback
    const ipToDevice = {};
    for (const sub of (data.subscriptions || [])) {
        for (const dev of (sub.devices || [])) {
            if (dev.ip) {
                const ip = dev.ip.replace(/^::ffff:/, '');
                ipToDevice[ip] = { subName: sub.name, deviceName: dev.name || 'Устройство', ua: dev.ua || '' };
            }
        }
    }

    require('child_process').exec('ss -tn state established', (err, stdout) => {
        if (err) return res.json({ connections: [], error: err.message });

        const connections = [];
        const seen = new Set();
        let totalStreams = 0;

        for (const line of stdout.split('\n')) {
            if (!line.trim() || line.includes('Recv-Q')) continue;
            const parts = line.trim().split(/\s+/);
            if (parts.length < 4) continue;

            let localAddr = '', peerAddr = '';
            if (parts.length >= 5 && /^\d+$/.test(parts[1])) { localAddr = parts[2]; peerAddr = parts[3]; }
            else if (parts.length >= 5) { localAddr = parts[3]; peerAddr = parts[4]; }
            else { localAddr = parts[2]; peerAddr = parts[3]; }

            const lpm = localAddr.match(/:(\d+)$/);
            if (!lpm) continue;
            const localPort = parseInt(lpm[1]);
            if (!allPorts.includes(localPort)) continue;

            let peerIp = peerAddr.replace(/:(\d+)$/, '').replace(/^\[/, '').replace(/\]$/, '').replace(/^::ffff:/, '');
            const server = portMap[localPort];
            const key = `${peerIp}:${localPort}`;

            if (!seen.has(key)) {
                seen.add(key);
                const email = ipToEmail[peerIp] || null;
                const device = ipToDevice[peerIp] || null;
                // Map email (sub-xxx) to subscription name
                let subName = device ? device.subName : null;
                if (email) {
                    const subId = email.replace('sub-', '');
                    const matchedSub = (data.subscriptions || []).find(s => s.id === subId);
                    subName = matchedSub ? matchedSub.name : email;
                }
                connections.push({
                    peerIp, localPort,
                    serverName: server ? server.name : `Port ${localPort}`,
                    templateName: server ? server.template : '',
                    subName,
                    deviceName: device ? device.deviceName : null,
                    ua: device ? device.ua : null,
                    matchedBy: email ? 'access-log' : (device ? 'device-ip' : null)
                });
            }
            totalStreams++;
        }

        const grouped = {};
        for (const c of connections) {
            if (!grouped[c.peerIp]) {
                grouped[c.peerIp] = { ip: c.peerIp, subName: c.subName, deviceName: c.deviceName, ua: c.ua, matchedBy: c.matchedBy, servers: [] };
            }
            grouped[c.peerIp].servers.push({ name: c.serverName, template: c.templateName, port: c.localPort });
        }

        const final = Object.values(grouped);

        // Lookup geo for all unique IPs
        Promise.all(final.map(async g => {
            const geo = await lookupGeo(g.ip);
            if (geo) g.geo = geo;
            return g;
        })).then(withGeo => {
            res.json({ total: withGeo.reduce((s, c) => s + c.servers.length, 0), totalStreams, uniqueIps: withGeo.length, connections: withGeo });
        }).catch(() => {
            res.json({ total: final.reduce((s, c) => s + c.servers.length, 0), totalStreams, uniqueIps: final.length, connections: final });
        });
    });
});


// IP History from Xray access log
app.get('/api/ip-history', authMiddleware, async (req, res) => {
    const logPath = '/var/log/xray/access.log';
    if (!fs.existsSync(logPath)) return res.json({ history: {} });

    try {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n');
        // Per-email: { ip: { firstSeen, lastSeen, count } }
        const history = {};

        for (const line of lines) {
            if (!line.includes('accepted')) continue;
            const em = line.match(/email:\s*(\S+)/);
            const ip4 = line.match(/from\s+(\d+\.\d+\.\d+\.\d+):/);
            const ts = line.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/);
            if (!em || !ip4) continue;

            const email = em[1];
            const ip = ip4[1];
            const time = ts ? ts[1] : '';

            if (!history[email]) history[email] = {};
            if (!history[email][ip]) {
                history[email][ip] = { firstSeen: time, lastSeen: time, count: 0 };
            }
            history[email][ip].lastSeen = time;
            history[email][ip].count++;
        }

        // Add geo for each IP
        const allIps = new Set();
        for (const email in history) {
            for (const ip in history[email]) allIps.add(ip);
        }

        await Promise.all([...allIps].map(async ip => {
            const geo = await lookupGeo(ip);
            for (const email in history) {
                if (history[email][ip]) history[email][ip].geo = geo;
            }
        }));

        res.json({ history });
    } catch (e) {
        res.json({ history: {}, error: e.message });
    }
});

// Dashboard
app.get('/api/dashboard', authMiddleware, (req, res) => {
    const data = loadData();
    const logs = data.logs || [];
    const subsList = data.subscriptions || [];
    const now = Date.now();
    const DAY = 86400000;

    // 7-day chart
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const dayStart = now - i * DAY;
        const dayEnd = dayStart + DAY;
        const connects = logs.filter(l => l.ts >= dayStart - (6 - i) * DAY && l.ts < dayEnd - (6 - i) * DAY).length;
        days.push(connects);
    }

    // Correct chart: count per actual day
    const chart = [];
    for (let i = 6; i >= 0; i--) {
        const start = new Date(now - i * DAY); start.setHours(0, 0, 0, 0);
        const end = new Date(start.getTime() + DAY);
        const count = logs.filter(l => l.ts >= start.getTime() && l.ts < end.getTime()).length;
        const label = start.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        chart.push({ label, count });
    }

    // Today/yesterday stats
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart.getTime() - DAY);
    const todayConns = logs.filter(l => l.ts >= todayStart.getTime()).length;
    const yesterdayConns = logs.filter(l => l.ts >= yesterdayStart.getTime() && l.ts < todayStart.getTime()).length;
    const newDevicesToday = logs.filter(l => l.ts >= todayStart.getTime() && l.type === 'new_device').length;

    const activeSubs = subsList.filter(s => s.enabled !== false && !(s.expiresAt && now > s.expiresAt)).length;
    const totalDevices = subsList.reduce((s, sub) => s + (sub.devices || []).length, 0);
    const totalAccess = subsList.reduce((s, sub) => s + (sub.accessCount || 0), 0);

    res.json({
        chart,
        todayConns, yesterdayConns, newDevicesToday,
        totalSubs: subsList.length, activeSubs, totalDevices, totalAccess,
        totalServers: (data.templates || []).reduce((s, t) => s + (t.uris || []).length, 0)
    });
});

// Favicon
app.get('/favicon.svg', (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="url(#g)"/><path d="M14 20l4 4 8-8" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`);
});

app.get('/favicon.ico', (req, res) => res.redirect('/favicon.svg'));

// Export / Import / Clear
app.get('/api/export', authMiddleware, (req, res) => { res.json({ version: '3.2', exportedAt: new Date().toISOString(), ...loadData() }); });

app.post('/api/import', authMiddleware, (req, res) => {
    try {
        const { templates, subscriptions, settings } = req.body;
        const data = loadData();
        if (templates) data.templates = templates;
        if (subscriptions) data.subscriptions = subscriptions;
        if (settings) data.settings = settings;
        saveData(data);
        res.json({ ok: true });
    } catch { res.status(400).json({ error: 'Invalid' }); }
});

app.post('/api/clear', authMiddleware, (req, res) => {
    const data = loadData();
    const pwd = data.settings?.adminPassword || '';
    saveData({ templates: [], subscriptions: [], settings: { ...getDefaultSettings(), adminPassword: pwd }, logs: [] });
    res.json({ ok: true });
});

// ===== MTPROXY MANAGER =====

// Get all MTProxy configs
app.get('/api/mtproxy', authMiddleware, (req, res) => {
    const data = loadData();
    res.json(data.mtproxies || []);
});

// Create MTProxy
app.post('/api/mtproxy', authMiddleware, (req, res) => {
    const data = loadData();
    if (!data.mtproxies) data.mtproxies = [];
    const { name, host, port, socksPort, secret, adTag, vlessUri, enabled } = req.body;
    if (!name || !host) return res.status(400).json({ error: 'Name and host required' });
    const finalSecret = secret || crypto.randomBytes(16).toString('hex');
    const mtp = {
        id: generateId(),
        name: name.trim(),
        host: host.trim(),
        port: parseInt(port) || 443,
        socksPort: parseInt(socksPort) || 1080,
        secret: finalSecret,
        adTag: (adTag || '').trim(),
        vlessUri: (vlessUri || '').trim(),
        enabled: enabled !== false,
        createdAt: Date.now()
    };
    data.mtproxies.push(mtp);
    saveData(data);
    res.json(mtp);
});

// Update MTProxy
app.put('/api/mtproxy/:id', authMiddleware, (req, res) => {
    const data = loadData();
    const mtp = (data.mtproxies || []).find(m => m.id === req.params.id);
    if (!mtp) return res.status(404).json({ error: 'Not found' });
    const { name, host, port, socksPort, secret, adTag, vlessUri, enabled } = req.body;
    if (name !== undefined) mtp.name = name.trim();
    if (host !== undefined) mtp.host = host.trim();
    if (port !== undefined) mtp.port = parseInt(port) || 443;
    if (socksPort !== undefined) mtp.socksPort = parseInt(socksPort) || 1080;
    if (secret !== undefined) mtp.secret = secret;
    if (adTag !== undefined) mtp.adTag = adTag.trim();
    if (vlessUri !== undefined) mtp.vlessUri = vlessUri.trim();
    if (enabled !== undefined) mtp.enabled = enabled;
    mtp.updatedAt = Date.now();
    saveData(data);
    res.json(mtp);
});

// Delete MTProxy
app.delete('/api/mtproxy/:id', authMiddleware, (req, res) => {
    const data = loadData();
    data.mtproxies = (data.mtproxies || []).filter(m => m.id !== req.params.id);
    saveData(data);
    res.json({ ok: true });
});

// Generate tg:// link for MTProxy
app.get('/api/mtproxy/:id/link', authMiddleware, (req, res) => {
    const data = loadData();
    const mtp = (data.mtproxies || []).find(m => m.id === req.params.id);
    if (!mtp) return res.status(404).json({ error: 'Not found' });
    // For fake-tls (dd prefix), the secret needs 'dd' + hex domain
    // For basic ee prefix, just use secret directly
    const secretHex = mtp.secret;
    const link = `tg://proxy?server=${mtp.host}&port=${mtp.port}&secret=${secretHex}`;
    const httpsLink = `https://t.me/proxy?server=${mtp.host}&port=${mtp.port}&secret=${secretHex}`;
    res.json({ link, httpsLink, host: mtp.host, port: mtp.port, secret: secretHex });
});

// Callback from setup script — updates secret on the server (no auth, uses proxy ID as token)
app.post('/api/mtproxy/:id/callback', (req, res) => {
    const data = loadData();
    const mtp = (data.mtproxies || []).find(m => m.id === req.params.id);
    if (!mtp) return res.status(404).json({ error: 'Not found' });
    const { secret, status } = req.body;
    if (secret) mtp.secret = secret;
    if (status) mtp.status = status;
    mtp.installedAt = Date.now();
    saveData(data);
    res.json({ ok: true });
});

// Generate setup script for a specific MTProxy
app.get('/api/mtproxy/:id/setup-script', (req, res) => {
    const data = loadData();
    const mtp = (data.mtproxies || []).find(m => m.id === req.params.id);
    if (!mtp) return res.status(404).send('# Error: MTProxy not found');
    const p = mtp.vlessUri ? parseVlessUri(mtp.vlessUri) : null;
    const panelUrl = (data.settings?.serverUrl || 'https://' + mtp.host).replace(/\/$/, '');
    const callbackUrl = panelUrl + '/api/mtproxy/' + mtp.id + '/callback';

    const lines = [];
    lines.push('#!/bin/bash');
    lines.push('# ==========================================');
    lines.push('# HappVPN MTProxy Auto-Setup: ' + mtp.name);
    lines.push('# ==========================================');
    lines.push('set -e');
    lines.push('');
    lines.push('PANEL_CALLBACK="' + callbackUrl + '"');
    lines.push('MTP_PORT=' + mtp.port);
    lines.push('SOCKS_PORT=' + mtp.socksPort);
    lines.push('AD_TAG="' + (mtp.adTag || '') + '"');
    lines.push('');
    lines.push('echo ""');
    lines.push('echo "========================================"');
    lines.push('echo "  HappVPN MTProxy Auto-Installer"');
    lines.push('echo "  ' + mtp.name + '"');
    lines.push('echo "========================================"');
    lines.push('echo ""');
    lines.push('');
    lines.push('# --- Install dependencies ---');
    lines.push('echo "[1/6] Installing dependencies..."');
    lines.push('apt update -y && apt install -y curl wget jq unzip tar >/dev/null 2>&1');
    lines.push('echo "  OK"');
    lines.push('');
    lines.push('# --- Install mtg ---');
    lines.push('echo "[2/6] Installing mtg..."');
    lines.push('MTG_TAG=$(curl -sL https://api.github.com/repos/9seconds/mtg/releases/latest | jq -r .tag_name)');
    lines.push('MTG_VER=${MTG_TAG#v}');
    lines.push('cd /tmp');
    lines.push('wget -qO mtg.tar.gz "https://github.com/9seconds/mtg/releases/download/${MTG_TAG}/mtg-${MTG_VER}-linux-amd64.tar.gz"');
    lines.push('tar xzf mtg.tar.gz');
    lines.push('find /tmp -name "mtg" -type f -executable -exec cp {} /usr/local/bin/mtg \\;');
    lines.push('chmod +x /usr/local/bin/mtg');
    lines.push('rm -rf /tmp/mtg.tar.gz /tmp/mtg-*');
    lines.push('echo "  mtg $(/usr/local/bin/mtg --version 2>&1 || echo ok)"');
    lines.push('');
    lines.push('# --- Auto-generate secret ---');
    lines.push('echo "[3/6] Generating secret..."');
    lines.push('SECRET=$(/usr/local/bin/mtg generate-secret --hex google.com)');
    lines.push('echo "  Secret: ${SECRET}"');
    lines.push('');
    lines.push('# --- Send secret back to admin panel ---');
    lines.push('echo "[4/6] Registering in panel..."');
    lines.push('curl -sL -X POST "${PANEL_CALLBACK}" \\');
    lines.push('  -H "Content-Type: application/json" \\');
    lines.push('  -d "{\\"secret\\":\\"${SECRET}\\",\\"status\\":\\"installed\\"}" >/dev/null 2>&1 || echo "  Warning: could not reach panel"');
    lines.push('echo "  OK"');
    lines.push('');

    // Install Xray if VLESS configured
    if (p) {
        lines.push('# --- Install Xray ---');
        lines.push('if ! command -v xray &>/dev/null && [ ! -f /usr/local/bin/xray ]; then');
        lines.push('  echo "[5/6] Installing Xray..."');
        lines.push('  bash <(curl -sL https://github.com/XTLS/Xray-install/raw/main/install-release.sh) install >/dev/null 2>&1');
        lines.push('  echo "  Xray installed"');
        lines.push('else');
        lines.push('  echo "[5/6] Xray already installed"');
        lines.push('fi');
    } else {
        lines.push('echo "[5/6] Xray skipped (no VLESS configured)"');
    }
    lines.push('');

    // MTG config
    lines.push('# --- Configure mtg ---');
    lines.push('echo "[6/6] Configuring services..."');
    lines.push('mkdir -p /etc/mtg');
    lines.push('cat > /etc/mtg/config.toml << MTGEOF');
    lines.push('secret = "${SECRET}"');
    lines.push('bind-to = "0.0.0.0:${MTP_PORT}"');
    if (mtp.adTag) {
        lines.push('ad-tag = "${AD_TAG}"');
    } else {
        lines.push('# ad-tag = "" # add later from @MTProxybot');
    }
    lines.push('');
    if (p) {
        lines.push('[network]');
        lines.push('proxies = ["socks5://127.0.0.1:${SOCKS_PORT}"]');
    }
    lines.push('MTGEOF');
    lines.push('');

    // Xray SOCKS5 -> VLESS config
    if (p) {
        const streamObj = buildStream(p);
        const xrayConfig = {
            log: { loglevel: "warning" },
            inbounds: [{
                tag: "socks-in", listen: "127.0.0.1", port: mtp.socksPort,
                protocol: "socks", settings: { auth: "noauth", udp: true }
            }],
            outbounds: [{
                tag: "vless-out", protocol: "vless",
                settings: {
                    vnext: [{
                        address: p.address, port: parseInt(p.port),
                        users: [Object.assign({ id: p.uuid, encryption: "none" }, p.flow ? { flow: p.flow } : {})]
                    }]
                },
                streamSettings: streamObj
            }]
        };
        lines.push('mkdir -p /usr/local/etc/xray');
        lines.push("cat > /usr/local/etc/xray/config-mtproxy.json << 'XRAYEOF'");
        lines.push(JSON.stringify(xrayConfig, null, 2));
        lines.push('XRAYEOF');
        lines.push('');

        // Xray service
        lines.push("cat > /etc/systemd/system/xray-mtproxy.service << 'SVCEOF2'");
        lines.push('[Unit]');
        lines.push('Description=Xray SOCKS5 for MTProxy');
        lines.push('After=network.target');
        lines.push('[Service]');
        lines.push('Type=simple');
        lines.push('ExecStart=/usr/local/bin/xray run -config /usr/local/etc/xray/config-mtproxy.json');
        lines.push('Restart=always');
        lines.push('RestartSec=3');
        lines.push('[Install]');
        lines.push('WantedBy=multi-user.target');
        lines.push('SVCEOF2');
        lines.push('systemctl daemon-reload');
        lines.push('systemctl enable xray-mtproxy');
        lines.push('systemctl restart xray-mtproxy');
        lines.push('');
    }

    // MTG service
    lines.push("cat > /etc/systemd/system/mtg.service << 'SVCEOF'");
    lines.push('[Unit]');
    lines.push('Description=MTProxy (mtg) - ' + mtp.name);
    lines.push('After=network.target');
    lines.push('[Service]');
    lines.push('Type=simple');
    lines.push('ExecStart=/usr/local/bin/mtg run /etc/mtg/config.toml');
    lines.push('Restart=always');
    lines.push('RestartSec=3');
    lines.push('[Install]');
    lines.push('WantedBy=multi-user.target');
    lines.push('SVCEOF');
    lines.push('systemctl daemon-reload');
    lines.push('systemctl enable mtg');
    lines.push('systemctl restart mtg');
    lines.push('');

    // Firewall
    lines.push('if command -v ufw &>/dev/null; then');
    lines.push('  ufw allow ${MTP_PORT}/tcp >/dev/null 2>&1');
    lines.push('fi');
    lines.push('');

    // Done
    lines.push('echo ""');
    lines.push('echo "========================================"');
    lines.push('echo "  MTProxy Ready!"');
    lines.push('echo "  Server: ' + mtp.host + ':${MTP_PORT}"');
    lines.push('echo "  Secret: ${SECRET}"');
    lines.push('echo "========================================"');
    lines.push('echo ""');
    lines.push('echo "  Link: tg://proxy?server=' + mtp.host + '&port=${MTP_PORT}&secret=${SECRET}"');
    lines.push('echo ""');
    lines.push('echo "  Secret sent to admin panel automatically!"');
    lines.push('echo "  Refresh MTProxy tab to see the updated link."');
    lines.push('echo ""');

    res.setHeader('Content-Type', 'text/plain');
    res.send(lines.join('\n'));
});

// Generic setup script (no specific proxy)
app.get('/api/mtproxy/setup-script', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send('#!/bin/bash\necho "Use the specific proxy setup script from the admin panel."\necho "MTProxy tab -> click proxy -> copy setup command."\n');
});


// ==========================================
// WhatsApp Proxy API
// ==========================================
app.get('/api/waproxy', authMiddleware, (req, res) => {
    const data = loadData();
    res.json(data.waproxies || []);
});

app.post('/api/waproxy', authMiddleware, (req, res) => {
    const data = loadData();
    if (!data.waproxies) data.waproxies = [];
    const wp = {
        id: require('crypto').randomBytes(8).toString('hex'),
        name: req.body.name || 'WhatsApp Proxy',
        host: req.body.host || '',
        port: req.body.port || 443,
        socksPort: req.body.socksPort || 1090,
        vlessUri: req.body.vlessUri || '',
        enabled: req.body.enabled !== false,
        createdAt: Date.now()
    };
    data.waproxies.push(wp);
    saveData(data);
    res.json(wp);
});

app.put('/api/waproxy/:id', authMiddleware, (req, res) => {
    const data = loadData();
    const wp = (data.waproxies || []).find(w => w.id === req.params.id);
    if (!wp) return res.status(404).json({ error: 'Not found' });
    Object.assign(wp, req.body, { id: wp.id });
    saveData(data);
    res.json(wp);
});

app.delete('/api/waproxy/:id', authMiddleware, (req, res) => {
    const data = loadData();
    data.waproxies = (data.waproxies || []).filter(w => w.id !== req.params.id);
    saveData(data);
    res.json({ ok: true });
});

// Callback from WhatsApp proxy setup script
app.post('/api/waproxy/:id/callback', (req, res) => {
    const data = loadData();
    const wp = (data.waproxies || []).find(w => w.id === req.params.id);
    if (!wp) return res.status(404).json({ error: 'Not found' });
    if (req.body.status) wp.status = req.body.status;
    wp.installedAt = Date.now();
    saveData(data);
    res.json({ ok: true });
});

// WhatsApp Proxy setup script
app.get('/api/waproxy/:id/setup-script', (req, res) => {
    const data = loadData();
    const wp = (data.waproxies || []).find(w => w.id === req.params.id);
    if (!wp) return res.status(404).send('# Error: WhatsApp Proxy not found');
    const p = wp.vlessUri ? parseVlessUri(wp.vlessUri) : null;
    const panelUrl = (data.settings?.serverUrl || 'https://' + wp.host).replace(/\/$/, '');
    const callbackUrl = panelUrl + '/api/waproxy/' + wp.id + '/callback';

    const lines = [];
    lines.push('#!/bin/bash');
    lines.push('# ==========================================');
    lines.push('# HappVPN WhatsApp Proxy Setup: ' + wp.name);
    lines.push('# Xray dokodemo-door -> VLESS');
    lines.push('# ==========================================');
    lines.push('set -e');
    lines.push('');
    lines.push('WA_PORT=' + wp.port);
    lines.push('SOCKS_PORT=' + wp.socksPort);
    lines.push('PANEL_CALLBACK="' + callbackUrl + '"');
    lines.push('');
    lines.push('echo ""');
    lines.push('echo "========================================"');
    lines.push('echo "  HappVPN WhatsApp Proxy Installer"');
    lines.push('echo "  ' + wp.name + '"');
    lines.push('echo "========================================"');
    lines.push('echo ""');
    lines.push('');
    lines.push('# --- Install dependencies ---');
    lines.push('echo "[1/4] Installing dependencies..."');
    lines.push('apt update -y && apt install -y curl wget jq unzip >/dev/null 2>&1');
    lines.push('echo "  OK"');
    lines.push('');
    lines.push('# --- Install Xray ---');
    lines.push('if ! command -v xray &>/dev/null && [ ! -f /usr/local/bin/xray ]; then');
    lines.push('  echo "[2/4] Installing Xray..."');
    lines.push('  bash <(curl -sL https://github.com/XTLS/Xray-install/raw/main/install-release.sh) install >/dev/null 2>&1');
    lines.push('  echo "  Xray installed"');
    lines.push('else');
    lines.push('  echo "[2/4] Xray already installed"');
    lines.push('fi');
    lines.push('');

    // Xray config for WhatsApp proxy
    if (p) {
        const streamObj = buildStream(p);
        // Build inbounds with unique ports for WhatsApp (443, 5222, 8443)
        const waInbounds = [];
        const usedPorts = new Set();
        const waPorts = [
            { tag: "wa-https", listenPort: wp.port, destPort: 443 },
            { tag: "wa-xmpp", listenPort: 5222, destPort: 5222 },
            { tag: "wa-alt", listenPort: 8443, destPort: 443 }
        ];
        for (const p of waPorts) {
            if (!usedPorts.has(p.listenPort)) {
                usedPorts.add(p.listenPort);
                waInbounds.push({
                    tag: p.tag, port: p.listenPort,
                    protocol: "dokodemo-door",
                    settings: { address: "g.whatsapp.net", port: p.destPort, network: "tcp" }
                });
            }
        }
        const xrayConfig = {
            log: { loglevel: "warning" },
            inbounds: waInbounds,
            outbounds: [{
                tag: "vless-out", protocol: "vless",
                settings: {
                    vnext: [{
                        address: p.address, port: parseInt(p.port),
                        users: [Object.assign({ id: p.uuid, encryption: "none" }, p.flow ? { flow: p.flow } : {})]
                    }]
                },
                streamSettings: streamObj
            }]
        };

        lines.push('# --- Configure Xray WhatsApp Proxy ---');
        lines.push('echo "[3/4] Configuring Xray..."');
        lines.push('mkdir -p /usr/local/etc/xray');
        lines.push("cat > /usr/local/etc/xray/config-waproxy.json << 'XRAYEOF'");
        lines.push(JSON.stringify(xrayConfig, null, 2));
        lines.push('XRAYEOF');
        lines.push('echo "  Xray WhatsApp config saved"');
    } else {
        lines.push('echo "[3/4] No VLESS configured - skipping Xray config"');
    }
    lines.push('');

    // Systemd service
    lines.push('echo "[4/4] Creating service..."');
    lines.push("cat > /etc/systemd/system/xray-waproxy.service << 'SVCEOF'");
    lines.push('[Unit]');
    lines.push('Description=Xray WhatsApp Proxy - ' + wp.name);
    lines.push('After=network.target');
    lines.push('[Service]');
    lines.push('Type=simple');
    lines.push('ExecStart=/usr/local/bin/xray run -config /usr/local/etc/xray/config-waproxy.json');
    lines.push('Restart=always');
    lines.push('RestartSec=3');
    lines.push('[Install]');
    lines.push('WantedBy=multi-user.target');
    lines.push('SVCEOF');
    lines.push('systemctl daemon-reload');
    lines.push('systemctl enable xray-waproxy');
    lines.push('systemctl restart xray-waproxy');
    lines.push('');

    // Firewall
    lines.push('if command -v ufw &>/dev/null; then');
    lines.push('  ufw allow ${WA_PORT}/tcp >/dev/null 2>&1');
    lines.push('  ufw allow 5222/tcp >/dev/null 2>&1');
    lines.push('  ufw allow 8443/tcp >/dev/null 2>&1');
    lines.push('fi');
    lines.push('');

    // Callback
    lines.push('curl -sL -X POST "${PANEL_CALLBACK}" \\');
    lines.push('  -H "Content-Type: application/json" \\');
    lines.push('  -d "{\\"status\\":\\"installed\\"}" >/dev/null 2>&1 || true');
    lines.push('');

    // Done
    lines.push('echo ""');
    lines.push('echo "========================================"');
    lines.push('echo "  WhatsApp Proxy Ready!"');
    lines.push('echo "  Server: ' + wp.host + '"');
    lines.push('echo "  Ports: ${WA_PORT}, 5222, 8443"');
    lines.push('echo "========================================"');
    lines.push('echo ""');
    lines.push('echo "  In WhatsApp: Settings -> Storage and Data -> Proxy"');
    lines.push('echo "  Enter: ' + wp.host + '"');
    lines.push('echo ""');

    res.setHeader('Content-Type', 'text/plain');
    res.send(lines.join('\n'));
});

// ===== START =====
const CERT_DIR = '/usr/local/etc/xray';
const certFile = path.join(CERT_DIR, 'fullchain.pem');
const keyFile = path.join(CERT_DIR, 'privkey.pem');

function startBot() {
    // Expose 3DH functions globally for user-bot.js
    global.createThreeDhDevice = createThreeDhDevice;
    global.deleteThreeDhDevice = deleteThreeDhDevice;

    try {
        const botModule = require('./bot.js');
        if (botModule.startBot) botModule.startBot();
    } catch (e) { console.log('  ⚠️  Админ-бот не запущен:', e.message); console.log(''); }
    // Start user (shop) bot
    try {
        const userBotModule = require('./user-bot.js');
        if (userBotModule.startUserBot) userBotModule.startUserBot();
    } catch (e) { console.log('  ⚠️  Клиентский бот не запущен:', e.message); console.log(''); }
}

if (!HTTP_ONLY && fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    // HTTPS on 443 + HTTP redirect on 80
    const sslOptions = {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile)
    };
    https.createServer(sslOptions, app).listen(443, () => {
        console.log('');
        console.log('  ╔══════════════════════════════════════╗');
        console.log('  ║   🛡️  HappVPN Subscription Manager   ║');
        console.log('  ╠══════════════════════════════════════╣');
        console.log('  ║   🔒 https://0.0.0.0:443             ║');
        console.log('  ╚══════════════════════════════════════╝');
        console.log('');
        console.log(`  🔑 Админка: /${ADMIN_PATH}`);
        console.log('');
        startBot();
        scheduleRelaySync(); // Sync Xray config on startup
    });
    // HTTP redirect to HTTPS
    const redirectApp = express();
    redirectApp.all('*', (req, res) => {
        res.redirect(301, `https://${req.headers.host}${req.url}`);
    });
    http.createServer(redirectApp).listen(80, () => {
        console.log('  ↪️  HTTP:80 → redirect to HTTPS');
    });
} else {
    // Dev/proxy mode — HTTP only
    app.listen(PORT, HTTP_HOST, () => {
        console.log('');
        console.log('  ╔══════════════════════════════════════╗');
        console.log('  ║   🛡️  HappVPN Subscription Manager   ║');
        console.log('  ╠══════════════════════════════════════╣');
        console.log(`  ║   http://${HTTP_HOST}:${PORT}              ║`);
        console.log('  ╚══════════════════════════════════════╝');
        console.log('');
        console.log(`  🔑 Админка: http://${HTTP_HOST}:${PORT}/${ADMIN_PATH}`);
        if (HTTP_ONLY) console.log('  🌐 HTTP-only mode: use a reverse proxy for public HTTPS');
        console.log('');
        startBot();
    });
}
