// ===== HappVPN Telegram Bot =====
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data.json');

// ===== DYNAMIC CONFIG =====
// Read settings fresh every time (not cached as const)
function getSettings() {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).settings || {}; } catch { return {}; }
}

function getBotToken() {
    const cfg = getSettings();
    return cfg.botToken || process.env.BOT_TOKEN || '';
}

function getAdminIds() {
    const cfg = getSettings();
    return (cfg.adminIds || process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);
}

function getServerUrl() {
    const cfg = getSettings();
    return cfg.serverUrl || process.env.SERVER_URL || 'http://localhost:3000';
}

// ===== DATA =====
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) { console.error('Data read error:', e.message); }
    return { templates: [], subscriptions: [], settings: {} };
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function generateToken() { return crypto.randomBytes(32).toString('base64url'); }
function generateId() { return crypto.randomBytes(8).toString('hex'); }
function isAdmin(userId) { return getAdminIds().includes(userId); }
function getSubUrl(token) { return `${getServerUrl()}/sub?token=${token}`; }

function esc(text) {
    return String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

// ===== PENDING SUBS STATE =====
const pendingSubs = {};

// ===== ADMIN STATES =====
const adminStates = {}; // { chatId: { action, targetUserId, ... } }

function buildTplKeyboard(chatId) {
    const data = loadData();
    const tpls = data.templates || [];
    const pending = pendingSubs[chatId];
    if (!pending) return [];

    const buttons = tpls.map(t => {
        const selected = pending.templateIds.includes(t.id);
        const icon = selected ? '✅' : '⬜';
        const count = (t.uris || []).length;
        return [{ text: `${icon} ${t.name} (${count} серв.)`, callback_data: `tpl_tog:${t.id}` }];
    });

    const sel = pending.templateIds.length;
    buttons.push([{ text: sel > 0 ? `▶️ Далее (выбрано: ${sel})` : '⚠️ Выберите хотя бы 1', callback_data: sel > 0 ? 'ns_devices' : 'ns_noop' }]);
    buttons.push([{ text: '❌ Отмена', callback_data: 'ns_cancel' }]);
    return buttons;
}

// ===== BOT INSTANCE MANAGEMENT =====
let bot = null;
let currentToken = '';

function setupBotHandlers(botInstance) {
    // ===== /start =====
    botInstance.onText(/\/start(.*)/, (msg, match) => {
        const chatId = msg.chat.id;
        const param = (match[1] || '').trim();

        if (param.startsWith('sub_')) {
            const token = param.substring(4);
            const data = loadData();
            const sub = data.subscriptions.find(s => s.token === token);
            if (!sub) return botInstance.sendMessage(chatId, '❌ Подписка не найдена.');

            if (!sub.telegramUsers) sub.telegramUsers = [];
            if (!sub.telegramUsers.includes(chatId)) {
                sub.telegramUsers.push(chatId);
                saveData(data);
            }

            const url = getSubUrl(sub.token);
            const devInfo = sub.maxDevices > 0 ? `${(sub.devices || []).length}/${sub.maxDevices}` : `${(sub.devices || []).length}/∞`;

            return botInstance.sendMessage(chatId,
                `✅ *Подписка: ${esc(sub.name)}*\n\n` +
                `📱 Устройства: ${devInfo}\n` +
                `👁 Обращений: ${sub.accessCount || 0}\n\n` +
                `🔗 *URL:*\n\`${esc(url)}\`\n\n` +
                `Скопируйте и добавьте в *Happ* как подписку\\.`,
                {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📋 Копировать URL', callback_data: `copy:${sub.id}` }],
                            [{ text: '📱 Устройства', callback_data: `devs:${sub.id}` }],
                            [{ text: '🔄 Обновить', callback_data: `refresh:${sub.id}` }]
                        ]
                    }
                }
            );
        }

        const isAdm = isAdmin(msg.from.id);
        let text = `🛡 *HappVPN*\n\nДобро пожаловать\\! `;

        if (isAdm) {
            text += `Вы — *администратор*\\.\n\n`;
            text += `📋 /subs — подписки\n`;
            text += `➕ /newsub — создать подписку\n`;
            text += `📦 /templates — шаблоны\n`;
            text += `👥 /users — пользователи\n`;
            text += `📢 /broadcast — рассылка\n`;
            text += `📊 /stats — статистика`;
        } else {
            text += `\n\nЕсли у вас есть ссылка — нажмите на неё\\.`;
        }

        botInstance.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' });
    });

    // ===== /subs =====
    botInstance.onText(/\/subs/, (msg) => {
        if (!isAdmin(msg.from.id)) return;
        sendSubsList(botInstance, msg.chat.id);
    });

    // ===== /templates =====
    botInstance.onText(/\/templates/, (msg) => {
        if (!isAdmin(msg.from.id)) return;
        const data = loadData();
        const tpls = data.templates || [];

        if (tpls.length === 0) return botInstance.sendMessage(msg.chat.id, '📭 Нет шаблонов\\. Добавьте через веб\\-панель\\.', { parse_mode: 'MarkdownV2' });

        let text = `📦 *Шаблоны:*\n\n`;
        tpls.forEach((t, i) => {
            text += `${i + 1}\\. *${esc(t.name)}* — ${(t.uris || []).length} серверов\n`;
        });

        botInstance.sendMessage(msg.chat.id, text, { parse_mode: 'MarkdownV2' });
    });

    // ===== /stats =====
    botInstance.onText(/\/stats/, (msg) => {
        if (!isAdmin(msg.from.id)) return;
        const data = loadData();
        const tpls = data.templates || [];
        const subsList = data.subscriptions || [];
        const shopUsers = data.shopUsers || [];
        const orders = data.orders || [];
        const cfg = data.settings || {};
        const cur = cfg.currency || '₽';
        const totalBalance = shopUsers.reduce((s, u) => s + (u.balance || 0), 0);
        const completedOrders = orders.filter(o => o.status === 'completed').length;
        const pendingOrders = orders.filter(o => o.status === 'pending_review').length;

        botInstance.sendMessage(msg.chat.id,
            `📊 *Статистика*\n\n` +
            `📦 Шаблонов: ${tpls.length}\n` +
            `🔗 Серверов: ${tpls.reduce((s, t) => s + (t.uris || []).length, 0)}\n` +
            `📋 Подписок: ${subsList.length}\n` +
            `📱 Устройств: ${subsList.reduce((s, sub) => s + (sub.devices || []).length, 0)}\n` +
            `👁 Обращений: ${subsList.reduce((s, sub) => s + (sub.accessCount || 0), 0)}\n\n` +
            `👥 *Пользователи*\n` +
            `├ Всего: ${shopUsers.length}\n` +
            `├ Общий баланс: ${totalBalance} ${esc(cur)}\n` +
            `├ Заказов выполнено: ${completedOrders}\n` +
            `└ Ожидают: ${pendingOrders}`,
            { parse_mode: 'MarkdownV2' }
        );
    });

    // ===== /users — список пользователей бота =====
    botInstance.onText(/\/users/, (msg) => {
        if (!isAdmin(msg.from.id)) return;
        sendUsersList(botInstance, msg.chat.id, 0);
    });

    // ===== /broadcast — рассылка =====
    botInstance.onText(/\/broadcast/, (msg) => {
        if (!isAdmin(msg.from.id)) return;
        const data = loadData();
        const shopUsers = data.shopUsers || [];
        const subUsers = new Set();
        (data.subscriptions || []).forEach(s => (s.telegramUsers || []).forEach(u => subUsers.add(u)));
        shopUsers.forEach(u => subUsers.add(u.userId));
        const totalRecipients = subUsers.size;

        if (totalRecipients === 0) {
            return botInstance.sendMessage(msg.chat.id, '📭 Нет пользователей для рассылки\\.', { parse_mode: 'MarkdownV2' });
        }

        adminStates[msg.chat.id] = { action: 'broadcast_text' };
        botInstance.sendMessage(msg.chat.id,
            `📢 *Рассылка*\n\n` +
            `Получателей: *${totalRecipients}*\n\n` +
            `Отправьте текст сообщения для рассылки\\. ` +
            `Вы можете также отправить фото с подписью\\.\n\n` +
            `Для отмены отправьте /cancel`,
            { parse_mode: 'MarkdownV2' }
        );
    });

    // ===== /cancel =====
    botInstance.onText(/\/cancel/, (msg) => {
        if (adminStates[msg.chat.id]) {
            delete adminStates[msg.chat.id];
            botInstance.sendMessage(msg.chat.id, '❌ Действие отменено.');
        }
    });

    // ===== /newsub =====
    botInstance.onText(/\/newsub/, (msg) => {
        if (!isAdmin(msg.from.id)) return;
        const data = loadData();
        if ((data.templates || []).length === 0) {
            return botInstance.sendMessage(msg.chat.id, '❌ Сначала добавьте шаблоны через веб\\-панель\\.', { parse_mode: 'MarkdownV2' });
        }
        pendingSubs[msg.chat.id] = { step: 'name', templateIds: [] };
        botInstance.sendMessage(msg.chat.id, '✏️ Введите *название* подписки:', { parse_mode: 'MarkdownV2' });
    });

    // Text input handler
    botInstance.on('message', (msg) => {
        const chatId = msg.chat.id;
        if (!msg.text && !msg.photo && !msg.document) return;
        if (msg.text && msg.text.startsWith('/')) return;

        // --- Admin state handlers ---
        const state = adminStates[chatId];
        if (state && isAdmin(msg.from.id)) {
            // Broadcast text message
            if (state.action === 'broadcast_text') {
                delete adminStates[chatId];
                executeBroadcast(botInstance, chatId, msg);
                return;
            }
            // Set balance
            if (state.action === 'set_balance') {
                delete adminStates[chatId];
                if (!msg.text) return;
                const amount = parseFloat(msg.text.trim());
                if (isNaN(amount)) return botInstance.sendMessage(chatId, '❌ Введите число.');
                const data = loadData();
                if (!data.shopUsers) data.shopUsers = [];
                let user = data.shopUsers.find(u => u.userId === state.targetUserId);
                if (!user) {
                    user = { userId: state.targetUserId, balance: 0, referralCode: crypto.randomBytes(4).toString('hex'), balanceHistory: [], createdAt: Date.now() };
                    data.shopUsers.push(user);
                }
                user.balance = (user.balance || 0) + amount;
                if (!user.balanceHistory) user.balanceHistory = [];
                user.balanceHistory.push({ amount, description: state.description || 'Корректировка админом', date: Date.now() });
                saveData(data);
                const cur = (data.settings || {}).currency || '₽';
                botInstance.sendMessage(chatId, `✅ Баланс пользователя *${esc(String(state.targetUserId))}* изменён на *${amount > 0 ? '+' : ''}${amount} ${esc(cur)}*\nТекущий баланс: *${user.balance} ${esc(cur)}*`, { parse_mode: 'MarkdownV2' });
                // Notify user
                if (global.happUserBot) {
                    const txt = amount > 0
                        ? `💰 Ваш баланс пополнен на ${amount} ${cur}!\nТекущий баланс: ${user.balance} ${cur}`
                        : `💸 С вашего баланса списано ${Math.abs(amount)} ${cur}.\nТекущий баланс: ${user.balance} ${cur}`;
                    global.happUserBot.sendMessage(state.targetUserId, txt).catch(() => { });
                }
                return;
            }
            // Assign subscription days
            if (state.action === 'assign_sub_days') {
                delete adminStates[chatId];
                if (!msg.text) return;
                const days = parseInt(msg.text.trim());
                if (isNaN(days) || days <= 0) return botInstance.sendMessage(chatId, '❌ Введите положительное число дней.');
                const data = loadData();
                const tplIds = (data.templates || []).filter(t => t.enabled !== false).map(t => t.id);
                if (tplIds.length === 0) return botInstance.sendMessage(chatId, '❌ Нет активных шаблонов.');

                // Check if user has existing sub — extend it
                if (!data.subscriptions) data.subscriptions = [];
                const existing = data.subscriptions.find(s =>
                    s.telegramUsers && s.telegramUsers.includes(state.targetUserId) && s.enabled !== false
                );

                let sub;
                if (existing) {
                    const base = (existing.expiresAt && existing.expiresAt > Date.now()) ? existing.expiresAt : Date.now();
                    existing.expiresAt = base + (days * 86400000);
                    existing.notes = (existing.notes || '') + ` | +${days}д (admin)`;
                    sub = existing;
                    botInstance.sendMessage(chatId, `✅ Подписка *${esc(sub.name)}* продлена на *${days}* дней\nДо: *${esc(new Date(sub.expiresAt).toLocaleDateString('ru-RU'))}*`, { parse_mode: 'MarkdownV2' });
                } else {
                    sub = {
                        id: generateId(),
                        name: `Подписка — User ${state.targetUserId}`,
                        trafficTotal: 0, trafficUsed: 0, maxDevices: 0,
                        token: generateToken(), templateIds: tplIds, enabled: true,
                        expiresAt: Date.now() + (days * 86400000),
                        notes: `Назначена админом | User ${state.targetUserId}`,
                        devices: [], telegramUsers: [state.targetUserId],
                        createdAt: Date.now(), accessCount: 0
                    };
                    data.subscriptions.push(sub);
                    botInstance.sendMessage(chatId, `✅ Подписка создана для *${esc(String(state.targetUserId))}* на *${days}* дней\nДо: *${esc(new Date(sub.expiresAt).toLocaleDateString('ru-RU'))}*`, { parse_mode: 'MarkdownV2' });
                }
                saveData(data);

                // Notify user
                if (global.happUserBot) {
                    const url = getSubUrl(sub.token);
                    const txt = existing
                        ? `✅ Ваша подписка продлена на ${days} дней!\nДо: ${new Date(sub.expiresAt).toLocaleDateString('ru-RU')}\n🔗 ${url}`
                        : `🎉 Вам назначена подписка на ${days} дней!\n🔗 ${url}\n\nСкопируйте и добавьте в Happ VPN.`;
                    global.happUserBot.sendMessage(state.targetUserId, txt).catch(() => { });
                }
                if (global.scheduleRelaySync) global.scheduleRelaySync();
                return;
            }
            // Send direct message to user
            if (state.action === 'send_dm') {
                delete adminStates[chatId];
                if (msg.text) {
                    if (global.happUserBot) {
                        global.happUserBot.sendMessage(state.targetUserId, msg.text).then(() => {
                            botInstance.sendMessage(chatId, '✅ Сообщение отправлено.');
                        }).catch(() => botInstance.sendMessage(chatId, '❌ Не удалось отправить.'));
                    } else {
                        botInstance.sendMessage(chatId, '❌ Клиентский бот не запущен.');
                    }
                }
                return;
            }
        }

        // --- Newsub: name input ---
        const pending = pendingSubs[chatId];
        if (!pending || !msg.text) return;

        if (pending.step === 'name') {
            pending.name = msg.text.trim();
            pending.step = 'templates';
            botInstance.sendMessage(chatId, '📦 *Выберите шаблоны:*', {
                parse_mode: 'MarkdownV2',
                reply_markup: { inline_keyboard: buildTplKeyboard(chatId) }
            });
        }
    });

    // ===== CALLBACKS =====
    botInstance.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const cb = query.data;

        // --- Toggle template ---
        if (cb.startsWith('tpl_tog:')) {
            const tplId = cb.split(':')[1];
            const pending = pendingSubs[chatId];
            if (!pending) return botInstance.answerCallbackQuery(query.id, { text: 'Сессия истекла' });

            const idx = pending.templateIds.indexOf(tplId);
            if (idx >= 0) pending.templateIds.splice(idx, 1);
            else pending.templateIds.push(tplId);

            botInstance.editMessageReplyMarkup(
                { inline_keyboard: buildTplKeyboard(chatId) },
                { chat_id: chatId, message_id: msgId }
            );
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- No-op (nothing selected yet) ---
        if (cb === 'ns_noop') {
            return botInstance.answerCallbackQuery(query.id, { text: '⚠️ Выберите хотя бы 1 шаблон' });
        }

        // --- Next: choose devices ---
        if (cb === 'ns_devices') {
            const pending = pendingSubs[chatId];
            if (!pending) return botInstance.answerCallbackQuery(query.id, { text: 'Сессия истекла' });
            pending.step = 'devices';

            botInstance.editMessageText('📱 *Лимит устройств:*', {
                chat_id: chatId, message_id: msgId,
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '1', callback_data: 'ns_dev:1' },
                            { text: '2', callback_data: 'ns_dev:2' },
                            { text: '3', callback_data: 'ns_dev:3' },
                            { text: '5', callback_data: 'ns_dev:5' }
                        ],
                        [
                            { text: '10', callback_data: 'ns_dev:10' },
                            { text: '∞ Безлимит', callback_data: 'ns_dev:0' }
                        ],
                        [{ text: '🔙 Назад к шаблонам', callback_data: 'ns_back_tpl' }],
                        [{ text: '❌ Отмена', callback_data: 'ns_cancel' }]
                    ]
                }
            });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Back to template select ---
        if (cb === 'ns_back_tpl') {
            const pending = pendingSubs[chatId];
            if (!pending) return botInstance.answerCallbackQuery(query.id, { text: 'Сессия истекла' });
            pending.step = 'templates';

            botInstance.editMessageText('📦 *Выберите шаблоны:*', {
                chat_id: chatId, message_id: msgId,
                parse_mode: 'MarkdownV2',
                reply_markup: { inline_keyboard: buildTplKeyboard(chatId) }
            });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Device count selected -> confirm ---
        if (cb.startsWith('ns_dev:')) {
            const pending = pendingSubs[chatId];
            if (!pending) return botInstance.answerCallbackQuery(query.id, { text: 'Сессия истекла' });
            pending.maxDevices = parseInt(cb.split(':')[1]) || 0;
            pending.step = 'plan';

            const data = loadData();
            const plans = (data.plans || []).filter(p => p.enabled !== false);
            const planBtns = plans.map(p => [{ text: `${p.name} — ${p.price} ${(data.settings || {}).currency || '₽'}`, callback_data: `ns_plan:${p.id}` }]);
            planBtns.push([{ text: '⏭ Без тарифа', callback_data: 'ns_plan:none' }]);
            planBtns.push([{ text: '🔙 Назад', callback_data: 'ns_devices' }]);
            planBtns.push([{ text: '❌ Отмена', callback_data: 'ns_cancel' }]);

            botInstance.editMessageText('📦 *Выберите тариф:*', {
                chat_id: chatId, message_id: msgId,
                parse_mode: 'MarkdownV2',
                reply_markup: { inline_keyboard: planBtns }
            });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Plan selected -> confirm ---
        if (cb.startsWith('ns_plan:')) {
            const pending = pendingSubs[chatId];
            if (!pending) return botInstance.answerCallbackQuery(query.id, { text: 'Сессия истекла' });
            const planId = cb.split(':')[1];
            const data = loadData();
            if (planId !== 'none') {
                const plan = (data.plans || []).find(p => p.id === planId);
                if (plan) {
                    pending.planId = plan.id;
                    pending.planName = plan.name;
                    pending.expiresAt = plan.duration > 0 ? Date.now() + (plan.duration * 86400000) : 0;
                    pending.trafficTotal = plan.traffic || 0;
                }
            }
            pending.step = 'confirm';

            const tplNames = pending.templateIds.map(id => {
                const t = (data.templates || []).find(x => x.id === id);
                return t ? t.name : '?';
            }).join(', ');

            let confirmText = `✅ *Подтвердите создание:*\n\n` +
                `📋 Название: *${esc(pending.name)}*\n` +
                `📱 Устройств: ${pending.maxDevices || '∞'}\n` +
                `📦 Шаблоны: ${esc(tplNames)}`;
            if (pending.planName) confirmText += `\n💳 Тариф: *${esc(pending.planName)}*`;
            if (pending.expiresAt) confirmText += `\n📅 До: ${esc(new Date(pending.expiresAt).toLocaleDateString('ru-RU'))}`;

            botInstance.editMessageText(confirmText, {
                chat_id: chatId, message_id: msgId,
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Создать', callback_data: 'ns_confirm' }],
                        [{ text: '🔙 Назад', callback_data: 'ns_devices' }],
                        [{ text: '❌ Отмена', callback_data: 'ns_cancel' }]
                    ]
                }
            });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Confirm create ---
        if (cb === 'ns_confirm') {
            const pending = pendingSubs[chatId];
            if (!pending) return botInstance.answerCallbackQuery(query.id, { text: 'Сессия истекла' });

            const data = loadData();
            const sub = {
                id: generateId(),
                name: pending.name,
                trafficTotal: pending.trafficTotal || 0,
                trafficUsed: 0,
                maxDevices: pending.maxDevices,
                expiresAt: pending.expiresAt || 0,
                token: generateToken(),
                templateIds: pending.templateIds,
                devices: [],
                telegramUsers: [],
                createdAt: Date.now(),
                accessCount: 0
            };

            if (!data.subscriptions) data.subscriptions = [];
            data.subscriptions.push(sub);
            saveData(data);
            delete pendingSubs[chatId];

            const url = getSubUrl(sub.token);
            const userBotLink = data.settings?.userBotLink || `https://t.me/${(await botInstance.getMe()).username}`;
            const deepLink = `${userBotLink}?start=sub_${sub.token}`;

            botInstance.editMessageText(
                `✅ *Подписка создана\\!*\n\n` +
                `📋 ${esc(sub.name)}\n` +
                `📱 Лимит: ${sub.maxDevices || '∞'} устр\\.\n\n` +
                `🔗 *URL подписки:*\n\`${esc(url)}\`\n\n` +
                `🤖 *Ссылка для клиента:*\n${esc(deepLink)}\n\n` +
                `Отправьте ссылку клиенту — он получит подписку через бота\\.`,
                {
                    chat_id: chatId, message_id: msgId,
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📋 К подпискам', callback_data: 'back_subs' }]
                        ]
                    }
                }
            );
            return botInstance.answerCallbackQuery(query.id, { text: '✅ Создано!' });
        }

        // --- Cancel ---
        if (cb === 'ns_cancel') {
            delete pendingSubs[chatId];
            botInstance.editMessageText('❌ Создание отменено\\.', { chat_id: chatId, message_id: msgId, parse_mode: 'MarkdownV2' });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Start newsub from inline ---
        if (cb === 'ns_start') {
            const data = loadData();
            if ((data.templates || []).length === 0) {
                botInstance.answerCallbackQuery(query.id, { text: '❌ Нет шаблонов' });
                return botInstance.sendMessage(chatId, '❌ Сначала добавьте шаблоны через веб\\-панель\\.', { parse_mode: 'MarkdownV2' });
            }
            pendingSubs[chatId] = { step: 'name', templateIds: [] };
            botInstance.sendMessage(chatId, '✏️ Введите *название* подписки:', { parse_mode: 'MarkdownV2' });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Back to subs list ---
        if (cb === 'back_subs') {
            sendSubsList(botInstance, chatId, msgId);
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- View sub (admin) ---
        if (cb.startsWith('asub:')) {
            const subId = cb.split(':')[1];
            const data = loadData();
            const sub = (data.subscriptions || []).find(s => s.id === subId);
            if (!sub) return botInstance.answerCallbackQuery(query.id, { text: 'Не найдена' });

            const url = getSubUrl(sub.token);
            const devCount = (sub.devices || []).length;
            const maxDev = sub.maxDevices || 0;
            const created = sub.createdAt ? new Date(sub.createdAt).toLocaleDateString('ru-RU') : '—';

            let devText = '';
            if (devCount > 0) {
                devText = '\n📱 *Устройства:*\n';
                (sub.devices || []).forEach((d, i) => {
                    const hw = d.hwid.length > 12 ? d.hwid.substring(0, 12) + '...' : d.hwid;
                    const last = new Date(d.lastSeen).toLocaleString('ru-RU');
                    devText += `  ${i + 1}\\. \`${esc(hw)}\` — ${esc(last)}\n`;
                });
            }

            botInstance.editMessageText(
                `📋 *${esc(sub.name)}*\n\n` +
                `🔗 \`${esc(url)}\`\n` +
                `📱 Устройства: ${devCount}${maxDev > 0 ? '/' + maxDev : '/∞'}\n` +
                `👁 Обращений: ${sub.accessCount || 0}\n` +
                `📅 Создана: ${esc(created)}\n` + devText,
                {
                    chat_id: chatId, message_id: msgId,
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📋 Скопировать URL', callback_data: `copy:${sub.id}` }],
                            [
                                { text: '🔄 Сбросить устр.', callback_data: `clrdev:${sub.id}` },
                                { text: '🗑 Удалить', callback_data: `delsub:${sub.id}` }
                            ],
                            [{ text: '🔙 Назад', callback_data: 'back_subs' }]
                        ]
                    }
                }
            );
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Copy URL ---
        if (cb.startsWith('copy:')) {
            const subId = cb.split(':')[1];
            const data = loadData();
            const sub = (data.subscriptions || []).find(s => s.id === subId);
            if (!sub) return botInstance.answerCallbackQuery(query.id, { text: 'Не найдена' });
            botInstance.sendMessage(chatId, getSubUrl(sub.token));
            return botInstance.answerCallbackQuery(query.id, { text: '📋 URL отправлен' });
        }

        // --- Clear devices ---
        if (cb.startsWith('clrdev:')) {
            const subId = cb.split(':')[1];
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const data = loadData();
            const sub = (data.subscriptions || []).find(s => s.id === subId);
            if (!sub) return botInstance.answerCallbackQuery(query.id, { text: 'Не найдена' });
            sub.devices = [];
            saveData(data);
            botInstance.answerCallbackQuery(query.id, { text: '✅ Устройства сброшены' });
            // Refresh
            query.data = `asub:${subId}`;
            return botInstance.emit('callback_query', query);
        }

        // --- Delete sub ---
        if (cb.startsWith('delsub:')) {
            const subId = cb.split(':')[1];
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            botInstance.editMessageText('⚠️ *Точно удалить подписку?*', {
                chat_id: chatId, message_id: msgId,
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Да', callback_data: `cfmdel:${subId}` },
                            { text: '❌ Нет', callback_data: `asub:${subId}` }
                        ]
                    ]
                }
            });
            return botInstance.answerCallbackQuery(query.id);
        }

        if (cb.startsWith('cfmdel:')) {
            const subId = cb.split(':')[1];
            const data = loadData();
            const idx = (data.subscriptions || []).findIndex(s => s.id === subId);
            if (idx === -1) return botInstance.answerCallbackQuery(query.id, { text: 'Не найдена' });
            data.subscriptions.splice(idx, 1);
            saveData(data);
            botInstance.editMessageText('🗑 Подписка удалена\\.', {
                chat_id: chatId, message_id: msgId,
                parse_mode: 'MarkdownV2',
                reply_markup: { inline_keyboard: [[{ text: '📋 К подпискам', callback_data: 'back_subs' }]] }
            });
            return botInstance.answerCallbackQuery(query.id, { text: '✅ Удалено' });
        }

        // --- Client: devices ---
        if (cb.startsWith('devs:')) {
            const subId = cb.split(':')[1];
            const data = loadData();
            const sub = (data.subscriptions || []).find(s => s.id === subId);
            if (!sub) return botInstance.answerCallbackQuery(query.id, { text: 'Не найдена' });

            const devs = sub.devices || [];
            if (devs.length === 0) return botInstance.answerCallbackQuery(query.id, { text: 'Нет устройств' });

            let text = `📱 *Устройства:*\n\n`;
            devs.forEach((d, i) => {
                const last = new Date(d.lastSeen).toLocaleString('ru-RU');
                text += `${i + 1}\\. *${esc(d.name || 'Устройство')}*\n   ${esc(last)}\n\n`;
            });
            text += `Всего: ${devs.length}${sub.maxDevices > 0 ? '/' + sub.maxDevices : '/∞'}`;

            botInstance.editMessageText(text, {
                chat_id: chatId, message_id: msgId,
                parse_mode: 'MarkdownV2',
                reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `refresh:${subId}` }]] }
            });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Client: refresh ---
        if (cb.startsWith('refresh:')) {
            const subId = cb.split(':')[1];
            const data = loadData();
            const sub = (data.subscriptions || []).find(s => s.id === subId);
            if (!sub) return botInstance.answerCallbackQuery(query.id, { text: 'Не найдена' });

            const url = getSubUrl(sub.token);
            const devInfo = sub.maxDevices > 0 ? `${(sub.devices || []).length}/${sub.maxDevices}` : `${(sub.devices || []).length}/∞`;

            botInstance.editMessageText(
                `✅ *Подписка: ${esc(sub.name)}*\n\n` +
                `📱 Устройства: ${devInfo}\n` +
                `👁 Обращений: ${sub.accessCount || 0}\n\n` +
                `🔗 *URL:*\n\`${esc(url)}\`\n\n` +
                `Скопируйте и добавьте в *Happ*\\.`,
                {
                    chat_id: chatId, message_id: msgId,
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📋 Копировать URL', callback_data: `copy:${sub.id}` }],
                            [{ text: '📱 Устройства', callback_data: `devs:${sub.id}` }],
                            [{ text: '🔄 Обновить', callback_data: `refresh:${sub.id}` }]
                        ]
                    }
                }
            );
            return botInstance.answerCallbackQuery(query.id, { text: '✅' });
        }

        // ===== SHOP CALLBACKS (orders, top-ups, tickets) =====
        if (cb.startsWith('approve_order:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const orderId = cb.split(':')[1];
            const data = loadData();
            const order = (data.orders || []).find(o => o.id === orderId);
            if (!order) return botInstance.answerCallbackQuery(query.id, { text: '❌ Не найден' });
            if (order.paymentProvider === 'yookassa') return botInstance.answerCallbackQuery(query.id, { text: '💳 YooKassa проверяется автоматически' });
            if (order.status === 'completed') return botInstance.answerCallbackQuery(query.id, { text: '✅ Уже выполнен' });
            const plan = (data.plans || []).find(p => p.id === order.planId);
            if (!plan) return botInstance.answerCallbackQuery(query.id, { text: '❌ Тариф не найден' });

            const activated = global.activateOrder
                ? global.activateOrder(data, order, { source: 'Ручное подтверждение' })
                : null;
            if (!activated) return botInstance.answerCallbackQuery(query.id, { text: '❌ Сервер не готов' });
            saveData(data);
            botInstance.editMessageText(`✅ Заказ одобрен!\n📦 ${plan.name}\n👤 ${order.firstName || 'User'} @${order.username || ''}`, { chat_id: chatId, message_id: msgId });
            return botInstance.answerCallbackQuery(query.id, { text: activated.action === 'extended' ? '✅ Продлена!' : '✅ Создана!' });
        }

        if (cb.startsWith('reject_order:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const orderId = cb.split(':')[1];
            const data = loadData();
            const order = (data.orders || []).find(o => o.id === orderId);
            if (!order) return botInstance.answerCallbackQuery(query.id, { text: '❌ Не найден' });
            if (order.paymentProvider === 'yookassa') return botInstance.answerCallbackQuery(query.id, { text: '💳 YooKassa проверяется автоматически' });
            order.status = 'rejected'; order.rejectedAt = Date.now(); saveData(data);
            botInstance.editMessageText(`❌ Отклонён: ${order.planName} | ${order.firstName || ''} @${order.username || ''}`, { chat_id: chatId, message_id: msgId });
            if (global.happUserBot) {
                global.happUserBot.sendMessage(order.chatId, `❌ Заказ отклонён. Обратитесь в поддержку.`).catch(() => { });
            }
            return botInstance.answerCallbackQuery(query.id, { text: '❌ Отклонено' });
        }

        if (cb.startsWith('approve_topup:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const reqId = cb.split(':')[1];
            const data = loadData();
            const request = (data.topUpRequests || []).find(r => r.id === reqId);
            if (!request) return botInstance.answerCallbackQuery(query.id, { text: '❌ Не найдено' });
            if (request.status === 'approved') return botInstance.answerCallbackQuery(query.id, { text: '✅ Уже одобрено' });
            request.status = 'approved'; request.approvedAt = Date.now();
            if (!data.shopUsers) data.shopUsers = [];
            let user = data.shopUsers.find(u => u.userId === request.userId);
            if (!user) { user = { userId: request.userId, balance: 0, referralCode: generateId().substring(0, 8), balanceHistory: [] }; data.shopUsers.push(user); }
            user.balance = (user.balance || 0) + request.amount;
            if (!user.balanceHistory) user.balanceHistory = [];
            user.balanceHistory.push({ amount: request.amount, description: 'Пополнение баланса', date: Date.now() });
            saveData(data);
            const cur = (data.settings || {}).currency || '₽';
            botInstance.editMessageText(`✅ Пополнение одобрено: ${request.amount} ${cur} → User ${request.userId}`, { chat_id: chatId, message_id: msgId });
            if (global.happUserBot) {
                global.happUserBot.sendMessage(request.userId, `✅ Баланс пополнен на ${request.amount} ${cur}!`).catch(() => { });
            }
            return botInstance.answerCallbackQuery(query.id, { text: '✅ Одобрено!' });
        }

        if (cb.startsWith('reject_topup:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const reqId = cb.split(':')[1];
            const data = loadData();
            const request = (data.topUpRequests || []).find(r => r.id === reqId);
            if (!request) return botInstance.answerCallbackQuery(query.id, { text: '❌ Не найдено' });
            request.status = 'rejected'; saveData(data);
            botInstance.editMessageText(`❌ Пополнение отклонено`, { chat_id: chatId, message_id: msgId });
            return botInstance.answerCallbackQuery(query.id, { text: '❌ Отклонено' });
        }

        if (cb.startsWith('reply_ticket:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const ticketId = cb.split(':')[1];
            botInstance.sendMessage(chatId, `💬 Ответьте на тикет #${ticketId.substring(0, 8)}\nОтправьте следующее сообщение как ответ:`);
            if (!global.adminReplyState) global.adminReplyState = {};
            global.adminReplyState[query.from.id] = { ticketId, chatId };
            return botInstance.answerCallbackQuery(query.id, { text: '✏️ Введите ответ' });
        }

        if (cb.startsWith('close_ticket:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const ticketId = cb.split(':')[1];
            const data = loadData();
            const ticket = (data.tickets || []).find(t => t.id === ticketId);
            if (!ticket) return botInstance.answerCallbackQuery(query.id, { text: '❌ Не найдено' });
            ticket.status = 'closed'; ticket.closedAt = Date.now(); saveData(data);
            botInstance.editMessageText(`🔒 Тикет #${ticketId.substring(0, 8)} закрыт`, { chat_id: chatId, message_id: msgId });
            if (global.happUserBot) {
                global.happUserBot.sendMessage(ticket.userId, `🔒 Ваше обращение "${ticket.subject}" закрыто.`).catch(() => { });
            }
            return botInstance.answerCallbackQuery(query.id, { text: '🔒 Закрыто' });
        }

        // ===== USER MANAGEMENT CALLBACKS =====

        // --- Users list page ---
        if (cb.startsWith('usr_page:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const page = parseInt(cb.split(':')[1]) || 0;
            sendUsersList(botInstance, chatId, page, msgId);
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- View user profile ---
        if (cb.startsWith('usr_view:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const userId = parseInt(cb.split(':')[1]);
            sendUserProfile(botInstance, chatId, userId, msgId);
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Add balance ---
        if (cb.startsWith('usr_bal:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const userId = parseInt(cb.split(':')[1]);
            adminStates[chatId] = { action: 'set_balance', targetUserId: userId, description: 'Начислено админом' };
            botInstance.sendMessage(chatId, `💰 Введите сумму для начисления пользователю *${esc(String(userId))}*\n\nПоложительное число \\= пополнение, отрицательное \\= списание\\.\n\nДля отмены: /cancel`, { parse_mode: 'MarkdownV2' });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Assign/extend subscription ---
        if (cb.startsWith('usr_sub:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const userId = parseInt(cb.split(':')[1]);
            adminStates[chatId] = { action: 'assign_sub_days', targetUserId: userId };
            botInstance.sendMessage(chatId, `📋 Введите количество *дней* подписки для пользователя *${esc(String(userId))}*\n\nЕсли подписка уже есть — она будет *продлена*\\.\nЕсли нет — будет создана новая\\.\n\nДля отмены: /cancel`, { parse_mode: 'MarkdownV2' });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Send direct message ---
        if (cb.startsWith('usr_dm:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const userId = parseInt(cb.split(':')[1]);
            adminStates[chatId] = { action: 'send_dm', targetUserId: userId };
            botInstance.sendMessage(chatId, `✉️ Введите сообщение для пользователя *${esc(String(userId))}*\n\nДля отмены: /cancel`, { parse_mode: 'MarkdownV2' });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Block/unblock user ---
        if (cb.startsWith('usr_block:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const userId = parseInt(cb.split(':')[1]);
            const data = loadData();
            if (!data.shopUsers) data.shopUsers = [];
            let user = data.shopUsers.find(u => u.userId === userId);
            if (!user) {
                user = { userId, balance: 0, referralCode: crypto.randomBytes(4).toString('hex'), balanceHistory: [], createdAt: Date.now() };
                data.shopUsers.push(user);
            }
            user.blocked = !user.blocked;
            saveData(data);

            // If blocking — disable all user subscriptions
            if (user.blocked) {
                (data.subscriptions || []).forEach(sub => {
                    if (sub.telegramUsers && sub.telegramUsers.includes(userId) && sub.enabled !== false) {
                        sub.enabled = false;
                        sub.notes = (sub.notes || '') + ' | blocked by admin';
                    }
                });
                saveData(data);
                if (global.happUserBot) {
                    global.happUserBot.sendMessage(userId, '⛔ Ваш аккаунт заблокирован. Обратитесь в поддержку.').catch(() => { });
                }
            } else {
                if (global.happUserBot) {
                    global.happUserBot.sendMessage(userId, '✅ Ваш аккаунт разблокирован!').catch(() => { });
                }
            }

            sendUserProfile(botInstance, chatId, userId, msgId);
            return botInstance.answerCallbackQuery(query.id, { text: user.blocked ? '🔴 Заблокирован' : '🟢 Разблокирован' });
        }

        // --- View user's subscriptions ---
        if (cb.startsWith('usr_subs:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const userId = parseInt(cb.split(':')[1]);
            const data = loadData();
            const userSubs = (data.subscriptions || []).filter(s => s.telegramUsers && s.telegramUsers.includes(userId));

            if (userSubs.length === 0) {
                botInstance.answerCallbackQuery(query.id, { text: '📭 Нет подписок' });
                return;
            }

            let text = `📋 *Подписки пользователя ${esc(String(userId))}:*\n\n`;
            userSubs.forEach((sub, i) => {
                const isExpired = sub.expiresAt && Date.now() > sub.expiresAt;
                const isDisabled = sub.enabled === false;
                const status = isDisabled ? '🔴' : isExpired ? '🟡' : '🟢';
                const exp = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ru-RU') : '∞';
                text += `${status} *${esc(sub.name)}*\n   До: ${esc(exp)} | Устр: ${(sub.devices || []).length}\n\n`;
            });

            const buttons = userSubs.map(s => [{ text: `${s.enabled !== false ? '🟢' : '🔴'} ${s.name}`, callback_data: `asub:${s.id}` }]);
            buttons.push([{ text: '🔙 Назад', callback_data: `usr_view:${userId}` }]);

            botInstance.editMessageText(text, {
                chat_id: chatId, message_id: msgId,
                parse_mode: 'MarkdownV2',
                reply_markup: { inline_keyboard: buttons }
            });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- View user's orders ---
        if (cb.startsWith('usr_orders:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const userId = parseInt(cb.split(':')[1]);
            const data = loadData();
            const userOrders = (data.orders || []).filter(o => o.userId === userId).reverse().slice(0, 10);

            if (userOrders.length === 0) {
                botInstance.answerCallbackQuery(query.id, { text: '📭 Нет заказов' });
                return;
            }

            const cfg = data.settings || {};
            const cur = cfg.currency || '₽';
            let text = `🛒 *Заказы пользователя ${esc(String(userId))}:*\n\n`;
            userOrders.forEach((o, i) => {
                const statusIcons = { 'pending_review': '⏳', 'completed': '✅', 'rejected': '❌', 'awaiting_payment': '💳' };
                const icon = statusIcons[o.status] || '❓';
                const date = new Date(o.createdAt).toLocaleDateString('ru-RU');
                text += `${icon} *${esc(o.planName)}* — ${o.price} ${esc(cur)}\n   ${esc(date)} | ${esc(o.status)}\n\n`;
            });

            botInstance.editMessageText(text, {
                chat_id: chatId, message_id: msgId,
                parse_mode: 'MarkdownV2',
                reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `usr_view:${userId}` }]] }
            });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- View balance history ---
        if (cb.startsWith('usr_bhist:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const userId = parseInt(cb.split(':')[1]);
            const data = loadData();
            const user = (data.shopUsers || []).find(u => u.userId === userId);
            const history = user ? (user.balanceHistory || []).slice(-10).reverse() : [];

            if (history.length === 0) {
                botInstance.answerCallbackQuery(query.id, { text: '📭 История пуста' });
                return;
            }

            const cfg = data.settings || {};
            const cur = cfg.currency || '₽';
            let text = `💰 *История баланса ${esc(String(userId))}:*\n\n`;
            history.forEach(h => {
                const date = new Date(h.date).toLocaleDateString('ru-RU');
                const sign = h.amount > 0 ? '+' : '';
                text += `${sign}${h.amount} ${esc(cur)} — ${esc(h.description || '—')}\n   ${esc(date)}\n\n`;
            });

            botInstance.editMessageText(text, {
                chat_id: chatId, message_id: msgId,
                parse_mode: 'MarkdownV2',
                reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `usr_view:${userId}` }]] }
            });
            return botInstance.answerCallbackQuery(query.id);
        }

        // --- Quick balance buttons ---
        if (cb.startsWith('usr_qbal:')) {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            const parts = cb.split(':');
            const userId = parseInt(parts[1]);
            const amount = parseInt(parts[2]);
            const data = loadData();
            if (!data.shopUsers) data.shopUsers = [];
            let user = data.shopUsers.find(u => u.userId === userId);
            if (!user) {
                user = { userId, balance: 0, referralCode: crypto.randomBytes(4).toString('hex'), balanceHistory: [], createdAt: Date.now() };
                data.shopUsers.push(user);
            }
            user.balance = (user.balance || 0) + amount;
            if (!user.balanceHistory) user.balanceHistory = [];
            user.balanceHistory.push({ amount, description: 'Быстрое начисление', date: Date.now() });
            saveData(data);
            const cur = (data.settings || {}).currency || '₽';
            if (global.happUserBot) {
                global.happUserBot.sendMessage(userId, `💰 Ваш баланс пополнен на ${amount} ${cur}!\nТекущий баланс: ${user.balance} ${cur}`).catch(() => { });
            }
            sendUserProfile(botInstance, chatId, userId, msgId);
            return botInstance.answerCallbackQuery(query.id, { text: `✅ +${amount} ${cur}` });
        }

        // --- Back to users list ---
        if (cb === 'usr_back') {
            if (!isAdmin(query.from.id)) return botInstance.answerCallbackQuery(query.id, { text: '⛔' });
            sendUsersList(botInstance, chatId, 0, msgId);
            return botInstance.answerCallbackQuery(query.id);
        }

        botInstance.answerCallbackQuery(query.id);
    });

    // Admin text reply to tickets
    botInstance.on('message', (msg) => {
        if (!msg.text || msg.text.startsWith('/')) return;
        const userId = msg.from.id;
        if (!isAdmin(userId)) return;
        if (!global.adminReplyState || !global.adminReplyState[userId]) return;

        const state = global.adminReplyState[userId];
        delete global.adminReplyState[userId];

        const data = loadData();
        const ticket = (data.tickets || []).find(t => t.id === state.ticketId);
        if (!ticket) return botInstance.sendMessage(msg.chat.id, '❌ Тикет не найден');

        if (!ticket.messages) ticket.messages = [];
        ticket.messages.push({ from: 'admin', text: msg.text, date: Date.now() });
        ticket.updatedAt = Date.now();
        saveData(data);

        botInstance.sendMessage(msg.chat.id, `✅ Ответ отправлен в тикет #${ticket.id.substring(0, 8)}`);
        if (global.happUserBot) {
            global.happUserBot.sendMessage(ticket.userId, `💬 Ответ поддержки:\n\n📋 ${ticket.subject}\n\n${msg.text}`).catch(() => { });
        }
    });
}

function sendSubsList(botInstance, chatId, messageId) {
    const data = loadData();
    const subsList = data.subscriptions || [];

    if (subsList.length === 0 && !messageId) {
        return botInstance.sendMessage(chatId, '📭 Нет подписок\\. Создайте: /newsub', { parse_mode: 'MarkdownV2' });
    }

    const buttons = subsList.map(s => {
        const devCount = (s.devices || []).length;
        const maxDev = s.maxDevices || 0;
        const devStr = maxDev > 0 ? `${devCount}/${maxDev}` : `${devCount}`;
        return [{ text: `${s.name} | 📱${devStr} | 👁${s.accessCount || 0}`, callback_data: `asub:${s.id}` }];
    });
    buttons.push([{ text: '➕ Создать подписку', callback_data: 'ns_start' }]);

    const text = `📋 *Подписки \\(${subsList.length}\\):*`;
    const opts = { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: buttons } };

    if (messageId) {
        botInstance.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    } else {
        botInstance.sendMessage(chatId, text, opts);
    }
}

// ===== USERS LIST =====
function sendUsersList(botInstance, chatId, page = 0, messageId = null) {
    const data = loadData();
    const allUsers = collectAllUsers(data);
    const PAGE_SIZE = 8;
    const totalPages = Math.max(1, Math.ceil(allUsers.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages - 1);
    const pageUsers = allUsers.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
    const cfg = data.settings || {};
    const cur = cfg.currency || '₽';

    if (allUsers.length === 0) {
        const text = '📭 *Пользователей пока нет\\.*';
        if (messageId) {
            botInstance.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'MarkdownV2' });
        } else {
            botInstance.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' });
        }
        return;
    }

    let text = `👥 *Пользователи \\(${allUsers.length}\\):*\n` +
        `📄 Страница ${currentPage + 1}/${totalPages}\n\n`;

    pageUsers.forEach((u, i) => {
        const num = currentPage * PAGE_SIZE + i + 1;
        const blocked = u.blocked ? '🔴' : '🟢';
        const bal = u.balance || 0;
        const subsCount = u.subsCount || 0;
        const name = u.firstName || u.username || `User`;
        text += `${blocked} *${num}\.* ${esc(name)}\n`;
        text += `   ID: \`${u.userId}\` | 💰 ${bal} ${esc(cur)} | 📋 ${subsCount}\n\n`;
    });

    const buttons = pageUsers.map(u => {
        const name = u.firstName || u.username || `User ${u.userId}`;
        const shortName = name.length > 20 ? name.substring(0, 20) + '…' : name;
        return [{ text: `${u.blocked ? '🔴' : '👤'} ${shortName} (${u.userId})`, callback_data: `usr_view:${u.userId}` }];
    });

    // Pagination
    const navRow = [];
    if (currentPage > 0) navRow.push({ text: '◀️ Назад', callback_data: `usr_page:${currentPage - 1}` });
    if (currentPage < totalPages - 1) navRow.push({ text: 'Вперёд ▶️', callback_data: `usr_page:${currentPage + 1}` });
    if (navRow.length > 0) buttons.push(navRow);

    const opts = { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: buttons } };

    if (messageId) {
        botInstance.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    } else {
        botInstance.sendMessage(chatId, text, opts);
    }
}

// ===== USER PROFILE =====
function sendUserProfile(botInstance, chatId, userId, messageId = null) {
    const data = loadData();
    const cfg = data.settings || {};
    const cur = cfg.currency || '₽';

    // Find shop user
    const shopUser = (data.shopUsers || []).find(u => u.userId === userId);
    const balance = shopUser ? (shopUser.balance || 0) : 0;
    const blocked = shopUser ? !!shopUser.blocked : false;
    const referralCode = shopUser ? shopUser.referralCode || '' : '';
    const referralCount = shopUser ? (shopUser.referralCount || 0) : 0;
    const createdAt = shopUser && shopUser.createdAt ? new Date(shopUser.createdAt).toLocaleDateString('ru-RU') : '—';

    // Find user info from orders / subscriptions
    const userOrders = (data.orders || []).filter(o => o.userId === userId);
    const userSubs = (data.subscriptions || []).filter(s => s.telegramUsers && s.telegramUsers.includes(userId));
    const activeSubs = userSubs.filter(s => s.enabled !== false && (!s.expiresAt || Date.now() < s.expiresAt));

    let firstName = '—';
    let username = '';
    if (userOrders.length > 0) {
        const last = userOrders[userOrders.length - 1];
        firstName = last.firstName || firstName;
        username = last.username || username;
    }

    const completedOrders = userOrders.filter(o => o.status === 'completed').length;
    const pendingOrders = userOrders.filter(o => o.status === 'pending_review').length;
    const totalSpent = userOrders.filter(o => o.status === 'completed').reduce((s, o) => s + (o.price || 0), 0);

    let text = `👤 *Профиль пользователя*\n\n`;
    text += `🆔 ID: \`${userId}\`\n`;
    text += `📝 Имя: *${esc(firstName)}*${username ? ` \\(@${esc(username)}\\)` : ''}\n`;
    text += `${blocked ? '🔴 *ЗАБЛОКИРОВАН*' : '🟢 Активен'}\n\n`;
    text += `💰 Баланс: *${balance} ${esc(cur)}*\n`;
    text += `📋 Подписок: ${userSubs.length} \\(активных: ${activeSubs.length}\\)\n`;
    text += `🛒 Заказов: ${userOrders.length} \\(✅${completedOrders} ⏳${pendingOrders}\\)\n`;
    text += `💸 Потрачено: ${totalSpent} ${esc(cur)}\n`;
    if (referralCode) text += `🔗 Реферал: \`${esc(referralCode)}\` \\(${referralCount} чел\\.\\)\n`;
    text += `📅 Регистрация: ${esc(createdAt)}\n`;

    const buttons = [
        [
            { text: '💰 Начислить баланс', callback_data: `usr_bal:${userId}` },
            { text: '📋 Подписка', callback_data: `usr_sub:${userId}` }
        ],
        [
            { text: `+100 ${cur}`, callback_data: `usr_qbal:${userId}:100` },
            { text: `+500 ${cur}`, callback_data: `usr_qbal:${userId}:500` },
            { text: `+1000 ${cur}`, callback_data: `usr_qbal:${userId}:1000` }
        ],
        [
            { text: '📋 Подписки', callback_data: `usr_subs:${userId}` },
            { text: '🛒 Заказы', callback_data: `usr_orders:${userId}` }
        ],
        [
            { text: '💰 История', callback_data: `usr_bhist:${userId}` },
            { text: '✉️ Написать', callback_data: `usr_dm:${userId}` }
        ],
        [{ text: blocked ? '🟢 Разблокировать' : '🔴 Заблокировать', callback_data: `usr_block:${userId}` }],
        [{ text: '🔙 К списку', callback_data: 'usr_back' }]
    ];

    const opts = { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: buttons } };

    if (messageId) {
        botInstance.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    } else {
        botInstance.sendMessage(chatId, text, opts);
    }
}

// ===== COLLECT ALL USERS =====
function collectAllUsers(data) {
    const usersMap = {};

    // From shopUsers
    (data.shopUsers || []).forEach(u => {
        usersMap[u.userId] = {
            userId: u.userId,
            balance: u.balance || 0,
            blocked: !!u.blocked,
            referralCode: u.referralCode || '',
            referralCount: u.referralCount || 0,
            createdAt: u.createdAt || 0,
            firstName: '',
            username: '',
            subsCount: 0
        };
    });

    // From subscriptions (telegramUsers)
    (data.subscriptions || []).forEach(sub => {
        (sub.telegramUsers || []).forEach(uid => {
            if (!usersMap[uid]) {
                usersMap[uid] = { userId: uid, balance: 0, blocked: false, firstName: '', username: '', subsCount: 0, createdAt: 0 };
            }
            usersMap[uid].subsCount++;
        });
    });

    // From orders — get names
    (data.orders || []).forEach(o => {
        if (usersMap[o.userId]) {
            if (o.firstName) usersMap[o.userId].firstName = o.firstName;
            if (o.username) usersMap[o.userId].username = o.username;
        } else {
            usersMap[o.userId] = {
                userId: o.userId, balance: 0, blocked: false,
                firstName: o.firstName || '', username: o.username || '',
                subsCount: 0, createdAt: o.createdAt || 0
            };
        }
    });

    // Sort: blocked first, then by most recent
    return Object.values(usersMap).sort((a, b) => {
        if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });
}

// ===== BROADCAST =====
async function executeBroadcast(botInstance, chatId, msg) {
    const data = loadData();
    const allUserIds = new Set();
    (data.shopUsers || []).forEach(u => { if (!u.blocked) allUserIds.add(u.userId); });
    (data.subscriptions || []).forEach(s => (s.telegramUsers || []).forEach(u => allUserIds.add(u)));

    const recipients = [...allUserIds];
    if (recipients.length === 0) {
        return botInstance.sendMessage(chatId, '📭 Нет получателей.');
    }

    const statusMsg = await botInstance.sendMessage(chatId, `📢 Рассылка запущена... 0/${recipients.length}`);
    let sent = 0, failed = 0;

    const userBotToUse = global.happUserBot || botInstance;

    for (const uid of recipients) {
        try {
            if (msg.photo) {
                const photo = msg.photo[msg.photo.length - 1].file_id;
                await userBotToUse.sendPhoto(uid, photo, { caption: msg.caption || '' });
            } else if (msg.text) {
                await userBotToUse.sendMessage(uid, msg.text);
            }
            sent++;
        } catch {
            failed++;
        }

        // Update status every 10 messages
        if ((sent + failed) % 10 === 0) {
            try {
                await botInstance.editMessageText(
                    `📢 Рассылка... ${sent + failed}/${recipients.length}\n✅ ${sent} | ❌ ${failed}`,
                    { chat_id: chatId, message_id: statusMsg.message_id }
                );
            } catch { }
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 50));
    }

    try {
        await botInstance.editMessageText(
            `✅ Рассылка завершена!\n\n📨 Всего: ${recipients.length}\n✅ Доставлено: ${sent}\n❌ Ошибок: ${failed}`,
            { chat_id: chatId, message_id: statusMsg.message_id }
        );
    } catch { }
}

// ===== START / RESTART BOT =====
function startBot() {
    const token = getBotToken();

    if (!token) {
        console.log('  ⚠️  BOT_TOKEN не установлен — бот не запущен');
        console.log('');
        return;
    }

    // If already running with same token, skip
    if (bot && currentToken === token) {
        console.log('  ℹ️  Бот уже работает с этим токеном');
        return;
    }

    // Stop existing bot
    if (bot) {
        try {
            bot.stopPolling();
            bot.removeAllListeners();
            console.log('  🔄 Остановка предыдущего бота...');
        } catch (e) { }
    }

    currentToken = token;
    bot = new TelegramBot(token, { polling: true });
    global.happBot = bot;

    setupBotHandlers(bot);

    bot.on('polling_error', (err) => {
        // Only log actual errors, not expected ones during restart
        if (err.code !== 'ETELEGRAM' || !err.message.includes('terminated')) {
            console.log(`  ⚠️  Bot polling error: ${err.message}`);
        }
    });

    const adminIds = getAdminIds();
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║   🤖 HappVPN Telegram Bot            ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║   Admins: ${adminIds.length ? adminIds.join(', ') : 'NOT SET'}${' '.repeat(Math.max(0, 27 - (adminIds.length ? adminIds.join(', ').length : 7)))}║`);
    console.log(`  ║   Polling: ACTIVE                    ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
}

function restartBot() {
    console.log('  🔄 Перезапуск бота (настройки обновлены)...');
    startBot();
}

// Export for server.js
module.exports = { startBot, restartBot };
