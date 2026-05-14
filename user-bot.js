// ===== HappVPN User Bot — Mini Web App =====
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) { console.error('UserBot data read error:', e.message); }
    return { templates: [], subscriptions: [], settings: {}, plans: [], orders: [] };
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getSettings() { return loadData().settings || {}; }
function getUserBotToken() { return getSettings().userBotToken || ''; }
function getAdminIds() { return (getSettings().adminIds || '').split(',').map(id => parseInt(id.trim())).filter(Boolean); }
function getServerUrl() {
    const url = getSettings().serverUrl || '';
    if (!url) return '';
    return url.replace(/^http:\/\//, 'https://');
}
function generateToken() { return crypto.randomBytes(32).toString('base64url'); }
function generateId() { return crypto.randomBytes(8).toString('hex'); }
function getSubUrl(token) { return `${getServerUrl()}/sub?token=${token}`; }

function esc(text) {
    return String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

let userBot = null;
let currentUserBotToken = '';

// ===== SETUP BOT =====
function setupUserBotHandlers(bot) {
    const s = getSettings;
    const webAppUrl = () => {
        const base = getServerUrl();
        if (!base) return '';
        return `${base}/shop.html`;
    };

    // /start
    bot.onText(/\/start(.*)/, (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const param = (match[1] || '').trim();
        const cfg = getSettings();
        const shopName = cfg.shopName || cfg.title || 'HappVPN';

        // Deep-link: привязка подписки
        if (param.startsWith('sub_')) {
            const token = param.substring(4);
            const data = loadData();
            const sub = data.subscriptions.find(s => s.token === token);
            if (!sub) return bot.sendMessage(chatId, '❌ Подписка не найдена.');
            if (!sub.telegramUsers) sub.telegramUsers = [];
            if (!sub.telegramUsers.includes(userId)) {
                sub.telegramUsers.push(userId);
                saveData(data);
            }
            const url = getSubUrl(sub.token);
            const isExpired = sub.expiresAt && Date.now() > sub.expiresAt;
            const isDisabled = sub.enabled === false;
            const status = isDisabled ? '🔴 Отключена' : isExpired ? '🟡 Истекла' : '🟢 Активна';

            return bot.sendMessage(chatId,
                `📋 *${esc(sub.name)}*\n\nСтатус: ${esc(status)}\n\n🔗 URL подписки:\n\`${esc(url)}\`\n\nСкопируйте и добавьте в *Happ VPN*\\.`,
                { parse_mode: 'MarkdownV2' }
            );
        }
        // Deep-link: referral
        if (param.startsWith('ref_')) {
            const refCode = param.substring(4);
            const data = loadData();
            if (!data.shopUsers) data.shopUsers = [];
            const referrer = data.shopUsers.find(u => u.referralCode === refCode);
            let thisUser = data.shopUsers.find(u => u.userId === userId);
            if (!thisUser) {
                thisUser = { userId, balance: 0, referralCode: generateId().substring(0, 8), referredBy: null, referralCount: 0, referralInvited: 0, referralDaysBonus: 0, balanceHistory: [], createdAt: Date.now() };
                data.shopUsers.push(thisUser);
            }

            if (referrer && referrer.userId !== userId && !thisUser.referredBy) {
                thisUser.referredBy = referrer.userId;
                referrer.referralCount = (referrer.referralCount || 0) + 1;
                referrer.referralInvited = (referrer.referralInvited || 0) + 1;
                const bonusDays = parseInt((data.settings || {}).referralBonusDays) || 3;
                referrer.referralDaysBonus = (referrer.referralDaysBonus || 0) + bonusDays;

                // Add bonus days to referrer's subscription
                const referrerSubs = (data.subscriptions || []).filter(s => s.telegramUsers && s.telegramUsers.includes(referrer.userId));
                const activeSub = referrerSubs.find(s => s.enabled !== false && (!s.expiresAt || Date.now() < s.expiresAt));
                if (activeSub && activeSub.expiresAt) {
                    activeSub.expiresAt += bonusDays * 86400000;
                }

                saveData(data);
                bot.sendMessage(referrer.userId, `🎉 По вашей ссылке пришёл новый пользователь! +${bonusDays} дней к подписке!`).catch(() => { });
            } else {
                saveData(data);
            }
            // Continue to show standard start message (fall through)
        }

        // Стандартный /start — приветствие
        // Save/update user name in shopUsers
        {
            const data2 = loadData();
            if (!data2.shopUsers) data2.shopUsers = [];
            let su = data2.shopUsers.find(u => u.userId === userId);
            if (!su) {
                su = { userId, balance: 0, referralCode: generateId().substring(0, 8), balanceHistory: [], createdAt: Date.now() };
                data2.shopUsers.push(su);
            }
            if (msg.from.first_name) su.firstName = msg.from.first_name;
            if (msg.from.username) su.username = msg.from.username;
            saveData(data2);
        }
        const welcomeText = cfg.shopWelcome || 'Добро пожаловать!';
        const welcomeMsg = `🛡 *${esc(shopName)}*\n\n${esc(welcomeText)}\n\n🆔 Ваш ID: \`${userId}\`\n\nЧтобы продолжить — откройте магазин 👇`;
        const welcomePhoto = cfg.shopWelcomePhoto || '';

        if (welcomePhoto) {
            let photoSource = welcomePhoto;
            // If it's a local path (starts with /)
            if (welcomePhoto.startsWith('/uploads/')) {
                const localPath = path.join(__dirname, 'public', welcomePhoto);
                if (fs.existsSync(localPath)) {
                    photoSource = fs.createReadStream(localPath);
                } else {
                    // File missing — fallback to text
                    bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'MarkdownV2' }).catch(() => { });
                    return;
                }
            }
            bot.sendPhoto(chatId, photoSource, {
                caption: welcomeMsg,
                parse_mode: 'MarkdownV2'
            }).catch(() => {
                bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'MarkdownV2' }).catch(() => { });
            });
        } else {
            bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'MarkdownV2' }).catch(() => { });
        }
    });

    // /shop
    bot.onText(/\/shop/, (msg) => {
        bot.sendMessage(msg.chat.id, '🛒 Нажмите кнопку, чтобы открыть магазин:', {
            reply_markup: { inline_keyboard: [[{ text: '🛒 Открыть магазин', web_app: { url: webAppUrl() } }]] }
        });
    });

    // /my — мои подписки
    bot.onText(/\/my/, (msg) => {
        const userId = msg.from.id;
        const data = loadData();
        const mySubs = (data.subscriptions || []).filter(s => s.telegramUsers && s.telegramUsers.includes(userId));

        if (mySubs.length === 0) {
            return bot.sendMessage(msg.chat.id, '📭 У вас пока нет подписок\\.', {
                parse_mode: 'MarkdownV2',
                reply_markup: { inline_keyboard: [[{ text: '🛒 Купить VPN', web_app: { url: webAppUrl() } }]] }
            });
        }

        let text = `📋 *Мои подписки:*\n\n`;
        mySubs.forEach((sub, i) => {
            const isExpired = sub.expiresAt && Date.now() > sub.expiresAt;
            const isDisabled = sub.enabled === false;
            const status = isDisabled ? '🔴' : isExpired ? '🟡' : '🟢';
            const url = getSubUrl(sub.token);
            text += `${status} *${esc(sub.name)}*\n\`${esc(url)}\`\n\n`;
        });

        bot.sendMessage(msg.chat.id, text, {
            parse_mode: 'MarkdownV2',
            reply_markup: { inline_keyboard: [[{ text: '🛒 Магазин', web_app: { url: webAppUrl() } }]] }
        });
    });

    // Получаем данные из Mini App
    bot.on('web_app_data', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        try {
            const payload = JSON.parse(msg.web_app_data.data);

            if (payload.action === 'create_order') {
                const data = loadData();
                const plan = (data.plans || []).find(p => p.id === payload.planId);
                if (!plan) return bot.sendMessage(chatId, '❌ Тариф не найден.');

                const order = {
                    id: generateId(),
                    planId: plan.id,
                    planName: plan.name,
                    price: plan.price,
                    userId,
                    chatId,
                    username: msg.from.username || '',
                    firstName: msg.from.first_name || '',
                    status: 'pending_review',
                    createdAt: Date.now(),
                    paymentProof: payload.paymentNote || ''
                };

                if (!data.orders) data.orders = [];
                data.orders.push(order);
                if (data.orders.length > 500) data.orders = data.orders.slice(-500);
                saveData(data);

                const cfg = getSettings();

                bot.sendMessage(chatId,
                    `✅ *Заказ создан\\!*\n\n📦 Тариф: *${esc(plan.name)}*\n💰 Сумма: *${esc(String(plan.price))} ${esc(cfg.currency || '₽')}*\n\n⏳ Ожидайте подтверждения от администратора\\.`,
                    { parse_mode: 'MarkdownV2' }
                );

                // Notify admins
                notifyAdminsNewOrder(bot, order, data, msg.from);
            }
        } catch (e) {
            console.log('  ⚠️  WebApp data error:', e.message);
        }
    });

    // Обработка фото (скриншот оплаты)
    bot.on('message', (msg) => {
        if (!msg.photo && !msg.document) return;
        // Проверяем, есть ли активный заказ awaiting_payment
        const userId = msg.from.id;
        const data = loadData();
        const pendingOrder = (data.orders || []).reverse().find(o =>
            o.userId === userId && (o.status === 'awaiting_payment' || o.status === 'pending_review')
        );

        if (!pendingOrder) return;

        if (msg.photo) {
            pendingOrder.paymentProof = msg.photo[msg.photo.length - 1].file_id;
            pendingOrder.paymentProofType = 'photo';
        } else if (msg.document) {
            pendingOrder.paymentProof = msg.document.file_id;
            pendingOrder.paymentProofType = 'document';
        }
        pendingOrder.status = 'pending_review';
        pendingOrder.paymentAt = Date.now();
        saveData(data);

        bot.sendMessage(msg.chat.id, '📸 Скриншот получен! ⏳ Ожидайте проверки.');
        notifyAdminsNewOrder(bot, pendingOrder, data, msg.from);
    });

    // ===== ADMIN CALLBACKS =====
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const userId = query.from.id;
        const cb = query.data;

        if (cb.startsWith('approve_order:')) {
            if (!getAdminIds().includes(userId)) return bot.answerCallbackQuery(query.id, { text: '⛔' });
            const orderId = cb.split(':')[1];
            await approveOrder(bot, chatId, msgId, orderId, query);
            return;
        }

        if (cb.startsWith('reject_order:')) {
            if (!getAdminIds().includes(userId)) return bot.answerCallbackQuery(query.id, { text: '⛔' });
            const orderId = cb.split(':')[1];
            await rejectOrder(bot, chatId, msgId, orderId, query);
            return;
        }

        // Top-up approve
        if (cb.startsWith('approve_topup:')) {
            if (!getAdminIds().includes(userId)) return bot.answerCallbackQuery(query.id, { text: '⛔' });
            const reqId = cb.split(':')[1];
            const data = loadData();
            const request = (data.topUpRequests || []).find(r => r.id === reqId);
            if (!request) return bot.answerCallbackQuery(query.id, { text: '❌ Не найдено' });
            if (request.status === 'approved') return bot.answerCallbackQuery(query.id, { text: '✅ Уже одобрено' });
            request.status = 'approved'; request.approvedAt = Date.now();
            if (!data.shopUsers) data.shopUsers = [];
            let user = data.shopUsers.find(u => u.userId === request.userId);
            if (!user) { user = { userId: request.userId, balance: 0, referralCode: generateId().substring(0, 8), balanceHistory: [] }; data.shopUsers.push(user); }
            user.balance = (user.balance || 0) + request.amount;
            if (!user.balanceHistory) user.balanceHistory = [];
            user.balanceHistory.push({ amount: request.amount, description: 'Пополнение баланса', date: Date.now() });
            saveData(data);
            const cur = (data.settings || {}).currency || '₽';
            bot.sendMessage(request.userId, `✅ Баланс пополнен на ${request.amount} ${cur}!\nТекущий баланс: ${user.balance} ${cur}`).catch(() => { });
            bot.editMessageText(`✅ Пополнение одобрено: ${request.amount} ${cur} → User ${request.userId}`, { chat_id: chatId, message_id: msgId });
            return bot.answerCallbackQuery(query.id, { text: '✅ Одобрено!' });
        }

        if (cb.startsWith('reject_topup:')) {
            if (!getAdminIds().includes(userId)) return bot.answerCallbackQuery(query.id, { text: '⛔' });
            const reqId = cb.split(':')[1];
            const data = loadData();
            const request = (data.topUpRequests || []).find(r => r.id === reqId);
            if (!request) return bot.answerCallbackQuery(query.id, { text: '❌ Не найдено' });
            request.status = 'rejected'; saveData(data);
            bot.editMessageText(`❌ Пополнение отклонено`, { chat_id: chatId, message_id: msgId });
            bot.sendMessage(request.userId, `❌ Заявка на пополнение отклонена.`).catch(() => { });
            return bot.answerCallbackQuery(query.id, { text: '❌ Отклонено' });
        }

        // Ticket reply (admin enters reply mode)
        if (cb.startsWith('reply_ticket:')) {
            if (!getAdminIds().includes(userId)) return bot.answerCallbackQuery(query.id, { text: '⛔' });
            const ticketId = cb.split(':')[1];
            bot.sendMessage(chatId, `💬 Ответьте на тикет #${ticketId.substring(0, 8)}\nОтправьте следующее сообщение как ответ:`);
            // Set admin state
            if (!global.adminReplyState) global.adminReplyState = {};
            global.adminReplyState[userId] = { ticketId, chatId };
            return bot.answerCallbackQuery(query.id, { text: '✏️ Введите ответ' });
        }

        // Ticket close
        if (cb.startsWith('close_ticket:')) {
            if (!getAdminIds().includes(userId)) return bot.answerCallbackQuery(query.id, { text: '⛔' });
            const ticketId = cb.split(':')[1];
            const data = loadData();
            const ticket = (data.tickets || []).find(t => t.id === ticketId);
            if (!ticket) return bot.answerCallbackQuery(query.id, { text: '❌ Не найдено' });
            ticket.status = 'closed'; ticket.closedAt = Date.now(); saveData(data);
            bot.editMessageText(`🔒 Тикет #${ticketId.substring(0, 8)} закрыт`, { chat_id: chatId, message_id: msgId });
            bot.sendMessage(ticket.userId, `🔒 Ваше обращение "${ticket.subject}" закрыто.`).catch(() => { });
            return bot.answerCallbackQuery(query.id, { text: '🔒 Закрыто' });
        }

        bot.answerCallbackQuery(query.id);
    });

    // Admin text reply to tickets
    bot.on('message', (msg) => {
        if (msg.photo || msg.document || msg.web_app_data) return;
        if (!msg.text) return;
        const userId = msg.from.id;
        if (!getAdminIds().includes(userId)) return;
        if (!global.adminReplyState || !global.adminReplyState[userId]) return;

        const state = global.adminReplyState[userId];
        delete global.adminReplyState[userId];

        const data = loadData();
        const ticket = (data.tickets || []).find(t => t.id === state.ticketId);
        if (!ticket) return bot.sendMessage(msg.chat.id, '❌ Тикет не найден');

        if (!ticket.messages) ticket.messages = [];
        ticket.messages.push({ from: 'admin', text: msg.text, date: Date.now() });
        ticket.updatedAt = Date.now();
        saveData(data);

        bot.sendMessage(msg.chat.id, `✅ Ответ отправлен в тикет #${ticket.id.substring(0, 8)}`);
        bot.sendMessage(ticket.userId, `💬 Ответ поддержки:\n\n📋 ${ticket.subject}\n\n${msg.text}`).catch(() => { });
    });
}

// ===== ADMIN NOTIFICATIONS =====
function notifyAdminsNewOrder(bot, order, data, fromUser) {
    const adminIds = getAdminIds();
    if (adminIds.length === 0) return;
    const cfg = data.settings || {};

    const text = `🆕 *Новый заказ\\!*\n\n` +
        `👤 ${esc(fromUser.first_name || '')} ${fromUser.username ? `\\(@${esc(fromUser.username)}\\)` : ''}\n` +
        `📦 Тариф: *${esc(order.planName)}*\n` +
        `💰 Сумма: *${esc(String(order.price))} ${esc(cfg.currency || '₽')}*\n` +
        `📋 Заказ: \\#${esc(order.id.substring(0, 8))}\n` +
        `⏰ ${esc(new Date().toLocaleString('ru-RU'))}`;

    adminIds.forEach(adminId => {
        // Send payment proof if available
        if (order.paymentProof && order.paymentProofType === 'photo') {
            bot.sendPhoto(adminId, order.paymentProof, {
                caption: `📸 Оплата | ${fromUser.first_name || ''} @${fromUser.username || 'n/a'} | ${order.planName} | ${order.price} ${cfg.currency || '₽'}`
            }).catch(() => { });
        } else if (order.paymentProof && order.paymentProofType === 'document') {
            bot.sendDocument(adminId, order.paymentProof, {
                caption: `📎 Оплата | ${fromUser.first_name || ''} @${fromUser.username || 'n/a'} | ${order.planName}`
            }).catch(() => { });
        }

        bot.sendMessage(adminId, text, {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Подтвердить', callback_data: `approve_order:${order.id}` },
                    { text: '❌ Отклонить', callback_data: `reject_order:${order.id}` }
                ]]
            }
        }).catch(() => { });
    });
}

// ===== APPROVE =====
async function approveOrder(bot, chatId, msgId, orderId, query) {
    const data = loadData();
    const order = (data.orders || []).find(o => o.id === orderId);
    if (!order) return bot.answerCallbackQuery(query.id, { text: '❌ Не найден' });
    if (order.status === 'completed') return bot.answerCallbackQuery(query.id, { text: '✅ Уже выполнен' });

    const plan = (data.plans || []).find(p => p.id === order.planId);
    if (!plan) return bot.answerCallbackQuery(query.id, { text: '❌ Тариф не найден' });

    const sub = {
        id: generateId(),
        name: `${plan.name} — ${order.firstName || 'User'}`,
        trafficTotal: plan.traffic || 0,
        trafficUsed: 0,
        maxDevices: plan.maxDevices || 0,
        token: generateToken(),
        templateIds: plan.templateIds || [],
        enabled: true,
        expiresAt: plan.duration > 0 ? Date.now() + (plan.duration * 86400000) : 0,
        notes: `Заказ #${order.id.substring(0, 8)} | @${order.username || 'n/a'} | ${order.planName}`,
        devices: [],
        telegramUsers: [order.userId],
        createdAt: Date.now(),
        accessCount: 0,
        orderId: order.id
    };

    if (!data.subscriptions) data.subscriptions = [];
    data.subscriptions.push(sub);
    order.status = 'completed';
    order.completedAt = Date.now();
    order.subscriptionId = sub.id;
    saveData(data);

    bot.editMessageText(
        `✅ *Заказ одобрен\\!*\n\n📦 ${esc(plan.name)}\n👤 ${esc(order.firstName || 'User')} ${order.username ? `\\(@${esc(order.username)}\\)` : ''}`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'MarkdownV2' }
    );

    // Notify user
    const url = getSubUrl(sub.token);
    const cfg = getSettings();

    bot.sendMessage(order.chatId,
        `🎉 *Подписка активирована\\!*\n\n` +
        `📦 Тариф: *${esc(plan.name)}*\n` +
        (sub.expiresAt ? `📅 До: *${esc(new Date(sub.expiresAt).toLocaleDateString('ru-RU'))}*\n` : '') +
        `\n🔗 *URL подписки:*\n\`${esc(url)}\`\n\n` +
        `📲 Скопируйте и добавьте в *Happ VPN*\\.`,
        { parse_mode: 'MarkdownV2' }
    ).catch(() => { });

    if (global.scheduleRelaySync) global.scheduleRelaySync();
    return bot.answerCallbackQuery(query.id, { text: '✅ Подписка создана!' });
}

// ===== REJECT =====
async function rejectOrder(bot, chatId, msgId, orderId, query) {
    const data = loadData();
    const order = (data.orders || []).find(o => o.id === orderId);
    if (!order) return bot.answerCallbackQuery(query.id, { text: '❌ Не найден' });

    order.status = 'rejected';
    order.rejectedAt = Date.now();
    saveData(data);

    bot.editMessageText(
        `❌ *Отклонён*\n\n📦 ${esc(order.planName)}\n👤 ${esc(order.firstName || '')} ${order.username ? `\\(@${esc(order.username)}\\)` : ''}`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'MarkdownV2' }
    );

    const cfg = getSettings();
    bot.sendMessage(order.chatId,
        `❌ *Заказ отклонён*\n\nОплата не подтверждена\\. Обратитесь в поддержку\\.`,
        {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    ...(cfg.supportUrl ? [[{ text: '💬 Поддержка', url: cfg.supportUrl }]] : []),
                    [{ text: '🛒 Магазин', web_app: { url: `${getServerUrl()}/shop.html` } }]
                ]
            }
        }
    ).catch(() => { });

    return bot.answerCallbackQuery(query.id, { text: '❌ Отклонено' });
}

// ===== START / RESTART =====
function startUserBot() {
    const token = getUserBotToken();
    if (!token) { console.log('  ⚠️  USER_BOT_TOKEN не установлен — клиентский бот не запущен'); return; }
    if (userBot && currentUserBotToken === token) { console.log('  ℹ️  Клиентский бот уже работает'); return; }

    if (userBot) { try { userBot.stopPolling(); userBot.removeAllListeners(); } catch { } }

    currentUserBotToken = token;
    userBot = new TelegramBot(token, { polling: true });
    global.happUserBot = userBot;

    setupUserBotHandlers(userBot);

    userBot.on('polling_error', (err) => {
        if (err.code !== 'ETELEGRAM' || !err.message.includes('terminated'))
            console.log(`  ⚠️  UserBot polling error: ${err.message}`);
    });

    // Auto-detect bot username and save userBotLink
    userBot.getMe().then(me => {
        if (me.username) {
            const link = `https://t.me/${me.username}`;
            const data = loadData();
            if (!data.settings) data.settings = {};
            if (data.settings.userBotLink !== link) {
                data.settings.userBotLink = link;
                saveData(data);
            }
            console.log(`  🔗 Client bot: @${me.username}`);
        }
    }).catch(() => { });

    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║   🛒 HappVPN Mini App Bot            ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log('  ║   Polling: ACTIVE                    ║');
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
}

function restartUserBot() {
    console.log('  🔄 Перезапуск клиентского бота...');
    if (userBot) { try { userBot.stopPolling(); userBot.removeAllListeners(); } catch { } userBot = null; currentUserBotToken = ''; }
    startUserBot();
}

module.exports = { startUserBot, restartUserBot };
