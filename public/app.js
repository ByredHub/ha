// ===== HappVPN v3.1 =====
(
    
    
    function () {    'use strict';
    let templates = [], subs = [], settings = {}, plans = [], currentSub = null, shopUsers = [], currentUserId = null, mtproxies = [], waproxies = [];
    const $ = sel => document.querySelector(sel);
    const $$ = sel => document.querySelectorAll(sel);
    const PAYMENT_PROVIDER_PRESETS = [
        { id: 'telegram_stars', name: 'Telegram Stars', methods: 'Звёзды Telegram', currency: 'XTR', hint: 'Оплата звёздами Telegram. Укажите инструкцию или ссылку на бота.' },
        { id: 'yookassa', name: 'YooKassa', methods: 'Карты, СБП', currency: 'RUB', hint: 'YooKassa: ссылка на оплату или инструкция для ручной проверки.' },
        { id: 'yookassa_sbp', name: 'YooKassa СБП', methods: 'Система быстрых платежей', currency: 'RUB', hint: 'СБП через YooKassa: укажите ссылку/QR или инструкцию.' },
        { id: 'cryptobot', name: 'CryptoBot', methods: 'USDT, TON, BTC, ETH', currency: 'Crypto', hint: 'CryptoBot: укажите ссылку на invoice/бота и комментарий к платежу.' },
        { id: 'heleket', name: 'Heleket', methods: 'USDT, мульти-сеть', currency: 'Crypto', hint: 'Heleket: укажите сеть, адрес или ссылку на оплату.' },
        { id: 'cloudpayments', name: 'CloudPayments', methods: 'Карты, 3D-Secure', currency: 'RUB', hint: 'CloudPayments: укажите ссылку на платежную форму.' },
        { id: 'freekassa', name: 'Freekassa', methods: 'NSPK СБП, карты', currency: 'RUB', hint: 'FreeKassa: укажите платежную ссылку или инструкцию.' },
        { id: 'kassa_ai', name: 'Kassa AI', methods: 'СБП, карты, SberPay', currency: 'RUB', hint: 'Kassa AI: укажите ссылку/инструкцию.' },
        { id: 'paypalych', name: 'PayPalych (Pal24)', methods: 'Карты, СБП', currency: 'RUB', hint: 'PayPalych: укажите ссылку/инструкцию.' },
        { id: 'platega', name: 'Platega', methods: 'Карты, СБП, крипто', currency: 'RUB', hint: 'Platega: укажите ссылку/инструкцию.' },
        { id: 'wata', name: 'WATA', methods: 'СБП, карты', currency: 'RUB', hint: 'WATA: укажите ссылку/инструкцию.' },
        { id: 'mulenpay', name: 'MulenPay', methods: 'Карты', currency: 'RUB', hint: 'MulenPay: укажите ссылку/инструкцию.' },
        { id: 'riopay', name: 'RioPay', methods: 'Карты', currency: 'RUB', hint: 'RioPay: укажите ссылку/инструкцию.' },
        { id: 'severpay', name: 'SeverPay', methods: 'СБП, карты', currency: 'RUB', hint: 'SeverPay: укажите ссылку/инструкцию.' },
        { id: 'paypear', name: 'PayPear', methods: 'Карты, СБП, SberPay, T-Pay', currency: 'RUB', hint: 'PayPear: укажите ссылку/инструкцию.' },
        { id: 'rollypay', name: 'RollyPay', methods: 'СБП, карты, крипто', currency: 'RUB → USDT', hint: 'RollyPay: укажите ссылку/инструкцию.' },
        { id: 'aurapay', name: 'AuraPay', methods: 'Карты, СБП', currency: 'RUB', hint: 'AuraPay: укажите ссылку/инструкцию.' },
        { id: 'overpay', name: 'Overpay', methods: 'Карты, СБП', currency: 'RUB', hint: 'Overpay: укажите ссылку/инструкцию.' },
        { id: 'antilopay', name: 'Antilopay', methods: 'Карты, СБП, SberPay', currency: 'RUB', hint: 'Antilopay: укажите ссылку/инструкцию.' },
        { id: 'etoplatezhi', name: 'Etoplatezhi', methods: 'Карты, СБП', currency: 'RUB', hint: 'Etoplatezhi: укажите ссылку/инструкцию.' },
        { id: 'jupiter', name: 'Jupiter', methods: 'СБП через QR', currency: 'RUB', hint: 'Jupiter: укажите QR/ссылку и инструкцию.' },
        { id: 'donut', name: 'Donut', methods: 'Карты, СБП по телефону, СБП QR', currency: 'RUB', hint: 'Donut: укажите ссылку/инструкцию.' },
        { id: 'lava_business', name: 'Lava Business', methods: 'Карты, СБП', currency: 'RUB', hint: 'Lava Business: укажите gate.lava.ru ссылку или инструкцию.' },
        { id: 'apple_iap', name: 'Apple In-App Purchase', methods: 'Покупки через iOS App Store', currency: 'USD', hint: 'Apple IAP: укажите инструкцию для iOS-покупки.' },
        { id: 'tribute', name: 'Tribute', methods: 'Telegram-платежи', currency: 'RUB', hint: 'Tribute: укажите ссылку на оплату.' },
        { id: 'manual_card', name: 'Перевод на карту', methods: 'Карта, СБП', currency: 'RUB', hint: '💳 Банк: 2202 XXXX XXXX XXXX\nИмя получателя: Иванов И.И.\nКомментарий: ваш Telegram username' }
    ];

    // ===== API =====
    async function api(method, url, body = null) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        if (res.status === 401) { showLogin(); throw new Error('Unauthorized'); }
        if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || 'Error'); }
        return res.json();
    }

    function getSubUrl(token) {
        const base = settings.serverUrl || window.location.origin;
        return `${base}/sub?token=${token}`;
    }

    // ===== AUTH =====
    async function checkAuth() {
        try {
            const r = await fetch('/api/auth-check');
            const d = await r.json();
            if (d.needAuth) { showLogin(); } else { showApp(); }
        } catch { showApp(); }
    }

    function showLogin() {
        $('#loginOverlay').style.display = 'flex';
        $('#appWrapper').style.display = 'none';
        $('#loginPassword').focus();
    }

    function showApp() {
        $('#loginOverlay').style.display = 'none';
        $('#appWrapper').style.display = '';
        loadAll();
    }

    async function handleLogin() {
        const pw = $('#loginPassword').value;
        try {
            const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
            const d = await r.json();
            if (d.ok) { showApp(); $('#loginError').textContent = ''; }
            else { $('#loginError').textContent = 'Неверный пароль'; }
        } catch { $('#loginError').textContent = 'Ошибка подключения'; }
    }

    // ===== LOAD ALL =====
    async function loadAll() {
        try { [templates, subs, settings, plans, shopUsers, mtproxies, waproxies] = await Promise.all([api('GET', '/api/templates'), api('GET', '/api/subs'), api('GET', '/api/settings'), api('GET', '/api/plans').catch(() => []), api('GET', '/api/shop-users').catch(() => []), api('GET', '/api/mtproxy').catch(() => []), api('GET', '/api/waproxy').catch(() => [])]); }
        catch (e) { if (e.message !== 'Unauthorized') showToast('Ошибка: ' + e.message, 'error'); }
        renderTemplates(); renderSubs(); renderServers(); updateStats(); loadSettingsUI(); renderPlans(); renderMtproxies(); renderWaProxies();
        if (document.querySelector('#tab-users.active')) renderUsers();
    }

    // ===== TOAST =====
    function showToast(msg, type = 'info') {
        const c = $('#toastContainer'), t = document.createElement('div');
        t.className = `toast ${type}`; t.textContent = msg; c.appendChild(t);
        setTimeout(() => { if (t.parentNode) t.remove(); }, 3000);
    }

    function showConfirm(title, message, confirmText) {
        const btnText = confirmText || (title.includes('далить') || title.includes('чистить') || title.includes('бросить') ? 'Удалить' : 'Подтвердить');
        const btnClass = btnText === 'Удалить' ? 'btn-confirm-danger' : 'btn-confirm-ok';
        return new Promise(resolve => {
            const o = document.createElement('div'); o.className = 'confirm-overlay';
            o.innerHTML = `<div class="confirm-dialog"><h3>${title}</h3><p>${message}</p><div class="confirm-actions"><button class="btn-cancel">Отмена</button><button class="${btnClass}">${btnText}</button></div></div>`;
            document.body.appendChild(o);
            o.querySelector('.btn-cancel').onclick = () => { o.remove(); resolve(false); };
            o.querySelector('.confirm-actions button:last-child').onclick = () => { o.remove(); resolve(true); };
            o.addEventListener('click', e => { if (e.target === o) { o.remove(); resolve(false); } });
        });
    }

    // ===== TABS & MODALS =====
    function initTabs() { $$('.tab-btn').forEach(b => b.addEventListener('click', () => { $$('.tab-btn').forEach(x => x.classList.remove('active')); $$('.tab-panel').forEach(x => x.classList.remove('active')); b.classList.add('active'); $(`#tab-${b.dataset.tab}`).classList.add('active'); if (b.dataset.tab === 'servers') renderServers(); })); }
    function openModal(id) { $(`#${id}`).classList.add('visible'); document.body.style.overflow = 'hidden'; }
    function closeModal(id) { $(`#${id}`).classList.remove('visible'); document.body.style.overflow = ''; }
    function initModals() { $$('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close))); $$('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); })); }

    // ===== HELPERS =====
    function parseVlessName(uri) { if (!uri) return '—'; const h = uri.lastIndexOf('#'); if (h === -1) return '—'; try { return decodeURIComponent(uri.substring(h + 1)) || '—'; } catch { return uri.substring(h + 1) || '—'; } }
    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function uploadPreviewUrl(url) { return url ? `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}` : ''; }
    function copyToClipboard(text) { if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => fallbackCopy(text)); else fallbackCopy(text); }
    window.copyToClipboard = copyToClipboard;
    function fallbackCopy(text) { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { } document.body.removeChild(ta); }
    window.showToast = showToast;

    // ===== STATS =====
    function updateStats() {
        $('#statTotal').textContent = templates.length;
        $('#statActive').textContent = templates.reduce((s, t) => s + (t.uris || []).length, 0);
        $('#statSubs').textContent = subs.length;
        loadDashboard();
    }

    // ===== QR =====
    function generateQR(text, container) {
        container.innerHTML = '';
        try {
            const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
            container.innerHTML = qr.createSvgTag({ scalable: true });
            container.querySelector('svg').style.cssText = 'width:100%;max-width:200px;height:auto;border-radius:12px;';
        } catch { container.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.8rem">QR слишком длинный</p>'; }
    }

    // ===== RENDER TEMPLATES =====
    function renderTemplates(filter = '') {
        const list = $('#templatesList'), empty = $('#emptyTemplates');
        const search = filter.toLowerCase().trim();
        const filtered = templates.filter(t => !search || (t.name || '').toLowerCase().includes(search) || (t.uris || []).some(u => u.toLowerCase().includes(search)));
        if (filtered.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
        empty.style.display = 'none';

        list.innerHTML = filtered.map((tpl, i) => {
            const c = (tpl.uris || []).length;
            const syncBadge = tpl.syncUrl ? ' <span style="font-size:0.65rem;color:var(--accent-secondary);vertical-align:middle">🔄 авто</span>' : '';
            return `<div class="template-card" style="animation-delay:${i * 0.04}s">
                <div class="template-header" data-toggle-tpl="${tpl.id}">
                    <div class="template-status ${tpl.enabled === false ? 'disabled' : ''}"></div>
                    <div class="template-info"><div class="template-name">${escapeHtml(tpl.name)}${syncBadge}</div><div class="template-count">${c} ${c === 1 ? 'сервер' : c < 5 ? 'сервера' : 'серверов'}</div></div>
                    <div class="template-actions">
                        <button class="btn-icon" data-direct-all="${tpl.id}" title="Все по прямой / через relay" style="font-size:13px">📡</button>
                        <button class="btn-icon" data-apply-all="${tpl.id}" title="Применить ко всем подпискам" style="font-size:13px">📌</button>
                        <button class="btn-icon" data-remove-all="${tpl.id}" title="Убрать из всех подписок" style="font-size:13px">🚫</button>
                        ${tpl.syncUrl ? `<button class="btn-icon btn-sync" data-sync-tpl="${tpl.id}" title="Синхронизировать">🔄</button>` : ''}
                        <button class="btn-icon btn-edit" data-edit-tpl="${tpl.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button class="btn-icon btn-delete" data-del-tpl="${tpl.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
                        <button class="btn-icon btn-toggle" data-toggle-btn="${tpl.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
                    </div>
                </div>
                <div class="template-uris collapsed" id="tpl-uris-${tpl.id}">${(tpl.uris || []).map((uri, ui) => {
                const isDirect = (tpl.uriDirect || [])[ui];
                return `<div class="template-uri-item"><span class="uri-dot${isDirect ? ' uri-direct' : ''}"></span><span class="uri-name" id="uri-n-${tpl.id}-${ui}">${escapeHtml(parseVlessName(uri))}</span><span class="uri-ping-result" id="uri-ping-${tpl.id}-${ui}"></span><button class="btn-icon btn-ping" data-ping-tpl="${tpl.id}" data-ping-idx="${ui}" title="Пинг сервера">⚡</button><button class="btn-icon btn-direct ${isDirect ? 'active' : ''}" data-direct-tpl="${tpl.id}" data-direct-idx="${ui}" title="${isDirect ? 'Прямой (без relay)' : 'Через relay'}">${isDirect ? '📡' : '🔗'}</button><button class="btn-icon btn-rename" data-rename-tpl="${tpl.id}" data-rename-idx="${ui}" title="Переименовать"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></div>`;
            }).join('')}</div>
            </div>`;
        }).join('');

        // Toggle all direct
        list.querySelectorAll('[data-direct-all]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation();
            const id = b.dataset.directAll;
            const t = templates.find(x => x.id === id);
            if (!t || !(t.uris || []).length) return;
            const allDirect = (t.uriDirect || []).every(d => d === true);
            const newVal = !allDirect;
            const label = newVal ? 'по прямой' : 'через relay';
            if (await showConfirm(newVal ? '📡 Все по прямой?' : '🔗 Все через relay?', `Все ${(t.uris || []).length} серверов в "${escapeHtml(t.name)}" будут ${label}.`)) {
                t.uriDirect = new Array(t.uris.length).fill(newVal);
                try {
                    await api('PUT', `/api/templates/${id}`, { name: t.name, uris: t.uris, uriDirect: t.uriDirect });
                    showToast(`✅ Все серверы ${label}`, 'success');
                    await loadAll();
                } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
            }
        }));
        // Apply to all subscriptions
        list.querySelectorAll('[data-apply-all]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation();
            const id = b.dataset.applyAll;
            const t = templates.find(x => x.id === id);
            if (t && await showConfirm('Применить ко всем?', `Шаблон "${escapeHtml(t.name)}" будет добавлен ко всем подпискам.`)) {
                try {
                    const r = await api('POST', `/api/templates/${id}/apply-all`);
                    showToast(`✅ Применён к ${r.count} из ${r.total} подписок`, 'success');
                    await loadAll();
                } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
            }
        }));
        // Remove from all subscriptions
        list.querySelectorAll('[data-remove-all]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation();
            const id = b.dataset.removeAll;
            const t = templates.find(x => x.id === id);
            if (t && await showConfirm('Убрать из всех?', `Шаблон "${escapeHtml(t.name)}" будет убран из всех подписок.`)) {
                try {
                    const r = await api('POST', `/api/templates/${id}/remove-all`);
                    showToast(`✅ Убран из ${r.count} подписок`, 'success');
                    await loadAll();
                } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
            }
        }));
        list.querySelectorAll('[data-sync-tpl]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation();
            b.style.animation = 'spin 1s linear infinite';
            try {
                const res = await api('POST', `/api/templates/${b.dataset.syncTpl}/sync`);
                showToast(res.changed ? `🔄 Обновлено: ${res.count} серверов` : `✅ Без изменений (${res.count})`, 'success');
                await loadAll();
            } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
            b.style.animation = '';
        }));
        list.querySelectorAll('[data-edit-tpl]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); editTemplate(b.dataset.editTpl); }));
        list.querySelectorAll('[data-del-tpl]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation();
            const t = templates.find(x => x.id === b.dataset.delTpl);
            if (t && await showConfirm('Удалить шаблон?', `"${escapeHtml(t.name)}" будет удалён.`)) {
                await api('DELETE', `/api/templates/${t.id}`); await loadAll(); showToast('Удалён', 'success');
            }
        }));
        list.querySelectorAll('[data-toggle-btn]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); toggleTpl(b.dataset.toggleBtn); }));
        list.querySelectorAll('[data-toggle-tpl]').forEach(h => h.addEventListener('click', e => { if (!e.target.closest('.btn-icon')) toggleTpl(h.dataset.toggleTpl); }));
        list.querySelectorAll('[data-rename-tpl]').forEach(b => b.addEventListener('click', e => {
            e.stopPropagation();
            renameUri(b.dataset.renameTpl, parseInt(b.dataset.renameIdx));
        }));
        list.querySelectorAll('[data-direct-tpl]').forEach(b => b.addEventListener('click', e => {
            e.stopPropagation();
            toggleDirect(b.dataset.directTpl, parseInt(b.dataset.directIdx));
        }));
        // Ping buttons logic was moved to pingServer for shared usage
        list.querySelectorAll('[data-ping-tpl]').forEach(b => b.addEventListener('click', e => {
            e.stopPropagation();
            pingServer(b.dataset.pingTpl, parseInt(b.dataset.pingIdx));
        }));
    }

    async function pingUri(tplId, idx) {
        const tpl = templates.find(t => t.id === tplId);
        if (!tpl || !tpl.uris[idx]) return;
        const uri = tpl.uris[idx];
        const resEl = document.getElementById(`uri-ping-${tplId}-${idx}`);
        // very basic parse
        let address = '';
        let port = '';
        try {
            const urlMatch = uri.match(/@([^:]+):(\d+)/);
            if (urlMatch) { address = urlMatch[1]; port = urlMatch[2]; }
        } catch { }
        if (!address || !port) { if (resEl) resEl.innerHTML = '<span style="color:var(--danger)">err</span>'; return; }

        if (resEl) resEl.innerHTML = '<span class="pinging">...</span>';
        try {
            const res = await api('POST', '/api/ping', { address, port });
            if (res.ok) {
                const ms = res.ms;
                const color = ms < 100 ? 'var(--success)' : ms < 300 ? 'var(--warning)' : 'var(--danger)';
                if (resEl) resEl.innerHTML = `<span style="color:${color}">${ms}ms</span>`;
            } else {
                if (resEl) resEl.innerHTML = '<span style="color:var(--danger)">err</span>';
            }
        } catch {
            if (resEl) resEl.innerHTML = '<span style="color:var(--danger)">err</span>';
        }
    }

    async function toggleDirect(tplId, idx) {
        const tpl = templates.find(t => t.id === tplId);
        if (!tpl) return;
        if (!tpl.uriDirect) tpl.uriDirect = new Array(tpl.uris.length).fill(false);
        tpl.uriDirect[idx] = !tpl.uriDirect[idx];
        try {
            await api('PUT', `/api/templates/${tplId}`, { name: tpl.name, uris: tpl.uris, uriDirect: tpl.uriDirect });
            await loadAll();
            toggleTpl(tplId); // keep expanded
            showToast(tpl.uriDirect[idx] ? '📡 Прямой' : '🔗 Через relay', 'success');
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function renameUri(tplId, idx) {
        const tpl = templates.find(t => t.id === tplId);
        if (!tpl || !tpl.uris[idx]) return;
        const nameEl = document.getElementById(`uri-n-${tplId}-${idx}`);
        if (!nameEl) return;
        const oldName = parseVlessName(tpl.uris[idx]);
        nameEl.innerHTML = `<input class="uri-rename-input" type="text" value="${escapeHtml(oldName)}" />`;
        const input = nameEl.querySelector('input');
        input.focus();
        input.select();
        const save = async () => {
            const newName = input.value.trim();
            if (!newName || newName === oldName) { nameEl.textContent = oldName; return; }
            // Update URI fragment
            const uri = tpl.uris[idx];
            const hashIdx = uri.lastIndexOf('#');
            tpl.uris[idx] = (hashIdx > -1 ? uri.substring(0, hashIdx) : uri) + '#' + encodeURIComponent(newName);
            // Also save to uriNames for sync persistence
            if (!tpl.uriNames) tpl.uriNames = [];
            tpl.uriNames[idx] = newName;
            try {
                await api('PUT', `/api/templates/${tplId}`, { name: tpl.name, uris: tpl.uris, uriNames: tpl.uriNames });
                await loadAll();
                toggleTpl(tplId); // keep expanded
                showToast('Переименован', 'success');
            } catch (e) { showToast(e.message, 'error'); nameEl.textContent = oldName; }
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { nameEl.textContent = oldName; } });
        input.addEventListener('blur', save);
    }

    function toggleTpl(id) {
        const el = document.getElementById(`tpl-uris-${id}`);
        const btn = document.querySelector(`[data-toggle-btn="${id}"]`);
        if (el) el.classList.toggle('collapsed');
        if (btn) btn.classList.toggle('rotated', el && !el.classList.contains('collapsed'));
    }

    function editTemplate(id) {
        const t = templates.find(x => x.id === id);
        if (!t) return;
        $('#tplName').value = t.name || '';
        $('#tplUris').value = (t.uris || []).join('\n');
        $('#tplEditId').value = t.id;
        $('#tplSyncUrl').value = t.syncUrl || '';
        $('#tplSyncInterval').value = t.syncInterval || 12;
        $('#tplSyncHwid').value = t.syncHwid || '';
        $('#tplSyncFields').style.display = t.syncUrl ? '' : 'none';
        if (t.lastSynced) {
            $('#tplSyncStatus').textContent = `Последняя синхронизация: ${new Date(t.lastSynced).toLocaleString('ru-RU')}`;
        } else {
            $('#tplSyncStatus').textContent = '';
        }
        $('#modalTplTitle').textContent = 'Редактировать шаблон';
        openModal('modalAddTpl');
    }

    async function handleSaveTemplate() {
        const name = $('#tplName').value.trim(), urisText = $('#tplUris').value.trim(), editId = $('#tplEditId').value;
        if (!name) { showToast('Введите название', 'error'); return; }
        const syncUrl = $('#tplSyncUrl').value.trim();
        const syncInterval = parseInt($('#tplSyncInterval').value) || 12;
        const syncHwid = $('#tplSyncHwid').value.trim();

        // If syncUrl is provided but no URIs yet — that's ok, we'll fetch them
        if (!urisText && !syncUrl) { showToast('Добавьте URI или URL подписки', 'error'); return; }
        const uris = urisText ? urisText.split('\n').map(u => u.trim()).filter(Boolean) : [];
        const body = { name, uris, syncUrl, syncInterval, syncHwid };

        try {
            if (editId) { await api('PUT', `/api/templates/${editId}`, body); showToast('Обновлён', 'success'); }
            else { await api('POST', '/api/templates', body); showToast('Создан', 'success'); }
            closeModal('modalAddTpl'); resetTplForm(); await loadAll();
        } catch (e) { showToast(e.message, 'error'); }
    }

    function resetTplForm() {
        $('#tplName').value = ''; $('#tplUris').value = ''; $('#tplEditId').value = '';
        $('#tplSyncUrl').value = ''; $('#tplSyncInterval').value = '12'; $('#tplSyncHwid').value = '';
        $('#tplSyncFields').style.display = 'none'; $('#tplSyncStatus').textContent = '';
        $('#modalTplTitle').textContent = 'Добавить шаблон';
    }

    // Show/hide sync fields when URL is typed
    if ($('#tplSyncUrl')) {
        $('#tplSyncUrl').addEventListener('input', () => {
            $('#tplSyncFields').style.display = $('#tplSyncUrl').value.trim() ? '' : 'none';
        });
    }

    // ===== RENDER SERVERS (PING TAB) =====
    function renderServers() {
        const list = $('#serversList'), empty = $('#emptyServers');
        let allServers = [];
        templates.forEach(t => {
            (t.uris || []).forEach((uri, i) => {
                allServers.push({ tplId: t.id, tplName: t.name, idx: i, uri, isDirect: (t.uriDirect || [])[i] });
            });
        });

        if (allServers.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
        empty.style.display = 'none';

        list.innerHTML = allServers.map((s, i) => {
            return `<div class="template-uri-item server-item" style="animation-delay:${i * 0.02}s">
                <span class="uri-dot${s.isDirect ? ' uri-direct' : ''}"></span>
                <div style="flex:1; display:flex; flex-direction:column; min-width:0;">
                    <span class="uri-name">${escapeHtml(parseVlessName(s.uri))}</span>
                    <span style="font-size:0.7rem; color:var(--text-tertiary)">${escapeHtml(s.tplName)}</span>
                </div>
                <span class="uri-ping-result server-ping-res" id="serv-ping-${s.tplId}-${s.idx}"></span>
                <button class="btn-icon btn-ping serv-ping-btn" data-s-tpl="${s.tplId}" data-s-idx="${s.idx}" title="Пинг">⚡</button>
            </div>`;
        }).join('');

        list.querySelectorAll('.serv-ping-btn').forEach(b => b.addEventListener('click', () => {
            pingServer(b.dataset.sTpl, parseInt(b.dataset.sIdx));
        }));
    }

    async function pingServer(tplId, idx) {
        const tpl = templates.find(t => t.id === tplId);
        if (!tpl || !tpl.uris[idx]) return;
        const uri = tpl.uris[idx];
        const resEl1 = document.getElementById(`uri-ping-${tplId}-${idx}`); // original list
        const resEl2 = document.getElementById(`serv-ping-${tplId}-${idx}`); // servers list

        let address = '', port = '';
        try { const urlMatch = uri.match(/@([^:]+):(\d+)/); if (urlMatch) { address = urlMatch[1]; port = urlMatch[2]; } } catch { }
        if (!address || !port) {
            if (resEl1) resEl1.innerHTML = '<span style="color:var(--danger)">err</span>';
            if (resEl2) resEl2.innerHTML = '<span style="color:var(--danger)">err</span>';
            return;
        }

        const loader = '<span class="pinging">...</span>';
        if (resEl1) resEl1.innerHTML = loader;
        if (resEl2) resEl2.innerHTML = loader;

        try {
            const res = await api('POST', '/api/ping', { address, port });
            const html = res.ok
                ? `<span style="color:${res.ms < 100 ? 'var(--success)' : res.ms < 300 ? 'var(--warning)' : 'var(--danger)'}">${res.ms}ms</span>`
                : '<span style="color:var(--danger)">err</span>';
            if (resEl1) resEl1.innerHTML = html;
            if (resEl2) resEl2.innerHTML = html;
        } catch {
            const errHtml = '<span style="color:var(--danger)">err</span>';
            if (resEl1) resEl1.innerHTML = errHtml;
            if (resEl2) resEl2.innerHTML = errHtml;
        }
    }

    if ($('#btnPingAll')) {
        $('#btnPingAll').addEventListener('click', async () => {
            const btns = document.querySelectorAll('#serversList .serv-ping-btn');
            if (btns.length === 0) return;
            const btnAll = $('#btnPingAll');
            btnAll.disabled = true;
            btnAll.innerHTML = '<span class="pinging">...</span>';
            for (const b of btns) {
                if (window.getComputedStyle(b).display !== 'none') {
                    await pingServer(b.dataset.sTpl, parseInt(b.dataset.sIdx));
                    await new Promise(r => setTimeout(r, 100)); // small delay to not spam
                }
            }
            btnAll.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg><span>Пинг всех</span>';
            btnAll.disabled = false;
        });
    }

    // ===== RENDER SUBS =====
    function renderSubs(filter = '') {
        const list = $('#subsList'), empty = $('#emptySubs');
        const search = filter.toLowerCase().trim();
        const filtered = subs.filter(s => !search || (s.name || '').toLowerCase().includes(search) || (s.notes || '').toLowerCase().includes(search));
        if (filtered.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
        empty.style.display = 'none';

        list.innerHTML = filtered.map((sub, i) => {
            const devCount = (sub.devices || []).length, maxDev = sub.maxDevices || 0;
            const isExpired = sub.expiresAt && Date.now() > sub.expiresAt;
            const isDisabled = sub.enabled === false;
            const statusClass = isDisabled ? 'disabled' : isExpired ? 'expired' : 'active';
            const isTrial = sub.isTrial;
            const is3dh = sub.threeDhDeviceId;

            return `<div class="sub-card ${statusClass}" style="animation-delay:${i * 0.04}s">
                <div class="sub-card-top">
                    <div class="sub-status-dot ${statusClass}"></div>
                    <div class="sub-card-name">${escapeHtml(sub.name || '—')} ${isTrial ? '<span class="trial-badge">🧪 TRIAL</span>' : ''}</div>
                    <div class="sub-card-actions">
                        ${isTrial ? `
                            <button class="btn-icon" data-switch-template="${sub.id}" title="Switch template"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg></button>
                        ` : ''}
                        <button class="btn-icon" data-toggle-sub="${sub.id}" title="${isDisabled ? 'Вкл' : 'Выкл'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/></svg></button>
                        <button class="btn-icon" data-edit-sub="${sub.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button class="btn-icon" data-del-sub="${sub.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
                    </div>
                </div>
                <div class="sub-card-meta">
                    <span>📱 ${devCount}${maxDev > 0 ? '/' + maxDev : ''}</span>
                    <span>👁 ${sub.accessCount || 0}</span>
                    ${sub.expiresAt ? `<span class="${isExpired ? 'expired-text' : ''}">📅 ${new Date(sub.expiresAt).toLocaleDateString('ru-RU')}</span>` : ''}
                </div>
                ${sub.notes ? `<div class="sub-card-notes">${escapeHtml(sub.notes.substring(0, 80))}</div>` : ''}
                ${sub.trafficTotal > 0 ? (() => {
                    const used = sub.trafficUsed || 0;
                    const total = sub.trafficTotal;
                    const pct = Math.min(100, (used / total) * 100);
                    const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#10b981';
                    const usedStr = used < 1 ? (used * 1024).toFixed(0) + 'MB' : used.toFixed(2) + 'GB';
                    const totalStr = total + 'GB';
                    return `<div class="sub-traffic-bar">
                        <div class="sub-traffic-track">
                            <div class="sub-traffic-fill" style="width:${pct}%;background:${barColor}"></div>
                        </div>
                        <span class="sub-traffic-label">${usedStr} / ${totalStr}</span>
                    </div>`;
                })() : ''}
                <div class="sub-card-footer">
                    <button data-view-sub="${sub.id}">Открыть</button>
                    <button data-copy-url="${sub.id}">Копировать URL</button>
                    <button data-happ-link="${sub.id}" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff">🔐 Happ</button>
                </div>
            </div>`;
        }).join('');

        list.querySelectorAll('[data-view-sub]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); viewSub(b.dataset.viewSub); }));
        list.querySelectorAll('[data-copy-url]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const s = subs.find(x => x.id === b.dataset.copyUrl); if (s) { copyToClipboard(getSubUrl(s.token)); showToast('URL скопирован', 'success'); } }));
        list.querySelectorAll('[data-edit-sub]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); editSub(b.dataset.editSub); }));
        list.querySelectorAll('[data-del-sub]').forEach(b => b.addEventListener('click', async e => { e.stopPropagation(); const s = subs.find(x => x.id === b.dataset.delSub); if (s && await showConfirm('Удалить?', `"${escapeHtml(s.name)}"`)) { await api('DELETE', `/api/subs/${s.id}`); await loadAll(); showToast('Удалена', 'success'); } }));
        list.querySelectorAll('[data-toggle-sub]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation(); const s = subs.find(x => x.id === b.dataset.toggleSub); if (!s) return;
            await api('PUT', `/api/subs/${s.id}`, { enabled: s.enabled === false ? true : false });
            await loadAll(); showToast(s.enabled === false ? 'Включена' : 'Выключена', 'success');
        }));
        list.querySelectorAll('[data-switch-template]').forEach(b => b.addEventListener('click', async e => { e.stopPropagation(); switchTrialTemplate(b.dataset.switchTemplate); }));
        list.querySelectorAll('[data-happ-link]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); getHappLink(b.dataset.happLink); }));
        
        // Show/hide delete trials button
        const hasTrials = subs.some(sub => sub.isTrial);
        const deleteBtn = $('#btnDeleteTrials');
        if (deleteBtn) {
            deleteBtn.style.display = hasTrials ? 'flex' : 'none';
        }
    }

    // Delete all trial subscriptions
    async function deleteAllTrials() {
        const trialCount = subs.filter(sub => sub.isTrial).length;
        if (trialCount === 0) {
            showToast('Нет пробных подписок для удаления', 'info');
            return;
        }

        const confirmed = await showConfirm(
            `Удалить все пробные подписки?`,
            `Будет удалено ${trialCount} пробных подписок и связанные шаблоны. Это действие нельзя отменить.`
        );

        if (!confirmed) return;

        try {
            const btn = $('#btnDeleteTrials');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg><span>Удаление...</span>';

            const res = await api('DELETE', '/api/trials');
            
            showToast(res.message || 'Пробные подписки удалены', 'success');
            await loadAll();
            
        } catch (error) {
            showToast('Ошибка: ' + error.message, 'error');
            const btn = $('#btnDeleteTrials');
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    // ===== SUB CRUD =====
    function viewSub(id) {
        const sub = subs.find(s => s.id === id); if (!sub) return;
        currentSub = sub;
        const url = getSubUrl(sub.token);

        $('#subDetailTitle').textContent = sub.name || 'Подписка';
        $('#subUrlText').textContent = url;
        $('#subAccessCount').textContent = sub.accessCount || 0;
        $('#subCreatedAt').textContent = sub.createdAt ? new Date(sub.createdAt).toLocaleDateString('ru-RU') : '—';

        // Badges
        const badges = [];
        if (sub.enabled === false) badges.push('<span class="badge badge-warn">⏸ Выключена</span>');
        else if (sub.expiresAt && Date.now() > sub.expiresAt) badges.push('<span class="badge badge-danger">⏰ Истекла</span>');
        else badges.push('<span class="badge badge-ok">🟢 Активна</span>');
        if (sub.expiresAt) badges.push(`<span class="badge">${new Date(sub.expiresAt).toLocaleDateString('ru-RU')}</span>`);
        $('#subBadges').innerHTML = badges.join('');

        // QR
        generateQR(url, $('#subQrCode'));

        // Bot deep-link (client bot)
        const deepLink = settings.userBotLink || settings.botDeepLink;
        if (deepLink) {
            $('#subBotLinkSection').style.display = '';
            const botLink = `${deepLink}?start=sub_${sub.token}`;
            $('#subBotLink').textContent = botLink;
        } else {
            $('#subBotLinkSection').style.display = 'none';
        }

        // Notes
        if (sub.notes) { $('#subNotesSection').style.display = ''; $('#subNotesText').textContent = sub.notes; }
        else { $('#subNotesSection').style.display = 'none'; }

        // Templates
        const subTpls = (sub.templateIds || []).map(id => templates.find(t => t.id === id)).filter(Boolean);
        $('#subTplCount').textContent = subTpls.length;
        $('#subTplsPreview').innerHTML = subTpls.map(t => `<div class="sub-key-item"><div class="sub-key-dot" style="${t.enabled === false ? 'background:var(--text-tertiary)' : ''}"></div><span class="sub-key-name">${escapeHtml(t.name)} <span style="color:var(--text-tertiary)">(${(t.uris || []).length})</span></span></div>`).join('');

        openModal('modalSubDetail');
        loadDevices(sub);
    }

    // ===== HAPP LINK =====
    async function getHappLink(subId) {
        const sub = subs.find(s => s.id === subId);
        if (!sub) return;
        showToast('Generating happ:// link...', 'info');
        try {
            const res = await api('GET', `/api/subs/${subId}/happ-link`);
            const link = res.link;
            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = `<div class="confirm-dialog" style="max-width:480px">
                <h3>🔐 Happ Encrypted Link</h3>
                <div style="text-align:center;padding:8px 0">
                    <div style="font-size:1rem;font-weight:600;margin-bottom:10px">${escapeHtml(sub.name)}</div>
                    <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:12px;margin-bottom:16px;word-break:break-all;font-family:monospace;font-size:0.72rem;max-height:120px;overflow-y:auto;text-align:left">${escapeHtml(link)}</div>
                    <div style="font-size:0.7rem;color:var(--text-tertiary);margin-bottom:12px;word-break:break-all">URL: ${escapeHtml(res.subUrl || '?')}</div>
                    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                        <button class="btn-confirm-ok" id="btnCopyHappLink" style="flex:1;min-width:100px">📋 Копировать</button>
                        <button class="btn-confirm-ok" id="btnCopyHappQr" style="flex:1;min-width:100px;background:linear-gradient(135deg,#10b981,#059669)">QR</button>
                        <button class="btn-confirm-ok" id="btnRefreshHappLink" style="flex:1;min-width:100px;background:linear-gradient(135deg,#f59e0b,#d97706)">🔄 Обновить</button>
                    </div>
                    <div id="happQrContainer" style="margin-top:16px"></div>
                    ${res.cached ? '<div style="margin-top:8px;color:var(--text-tertiary);font-size:0.7rem">из кэша</div>' : ''}
                </div>
                <div class="confirm-actions"><button class="btn-cancel" style="width:100%">Закрыть</button></div>
            </div>`;
            document.body.appendChild(overlay);
            // Close handlers
            overlay.querySelector('.btn-cancel').onclick = () => overlay.remove();
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
            // Bind buttons
            const btnCopy = overlay.querySelector('#btnCopyHappLink');
            const btnQr = overlay.querySelector('#btnCopyHappQr');
            const btnRefresh = overlay.querySelector('#btnRefreshHappLink');
            if (btnCopy) btnCopy.addEventListener('click', () => { copyToClipboard(link); showToast('Happ ссылка скопирована!', 'success'); });
            if (btnQr) btnQr.addEventListener('click', () => { generateQR(link, overlay.querySelector('#happQrContainer')); });
            if (btnRefresh) btnRefresh.addEventListener('click', async () => {
                btnRefresh.disabled = true; btnRefresh.textContent = '...';
                try {
                    await api('POST', `/api/subs/${subId}/happ-link/refresh`);
                    overlay.remove();
                    showToast('Ссылка обновлена!', 'success');
                    setTimeout(() => getHappLink(subId), 300);
                } catch (err) { showToast(err.message, 'error'); btnRefresh.disabled = false; btnRefresh.textContent = '🔄 Обновить'; }
            });
        } catch (e) {
            showToast('Ошибка: ' + e.message, 'error');
        }
    }

    function openCreateSub() {
        if (templates.length === 0) { showToast('Сначала добавьте шаблоны', 'error'); return; }
        $('#tplSelectList').innerHTML = templates.map(t => `<label class="key-select-item"><input type="checkbox" value="${t.id}" checked><span class="select-name">${escapeHtml(t.name)} (${(t.uris || []).length})</span></label>`).join('');
        $('#subName').value = ''; $('#subTraffic').value = ''; $('#subMaxDevices').value = ''; $('#subExpires').value = ''; $('#subNotes').value = '';
        $('#subEditId').value = ''; $('#modalSubTitle').textContent = 'Создать подписку'; $('#btnSaveSub').textContent = 'Создать';
        openModal('modalAddSub');
    }

    function editSub(id) {
        const sub = subs.find(s => s.id === id); if (!sub) return;
        $('#tplSelectList').innerHTML = templates.map(t => `<label class="key-select-item"><input type="checkbox" value="${t.id}" ${(sub.templateIds || []).includes(t.id) ? 'checked' : ''}><span class="select-name">${escapeHtml(t.name)} (${(t.uris || []).length})</span></label>`).join('');
        $('#subName').value = sub.name || ''; $('#subTraffic').value = sub.trafficTotal || ''; $('#subMaxDevices').value = sub.maxDevices || '';
        $('#subExpires').value = sub.expiresAt ? new Date(sub.expiresAt).toISOString().split('T')[0] : '';
        $('#subNotes').value = sub.notes || '';
        $('#subEditId').value = sub.id; $('#modalSubTitle').textContent = 'Редактировать'; $('#btnSaveSub').textContent = 'Сохранить';

    async function switchTrialTemplate(subId) {
        const sub = subs.find(s => s.id === subId);
        if (!sub || !sub.isTrial) {
            showToast('Только для пробных подписок', 'error');
            return;
        }

        const is3dh = sub.threeDhDeviceId;
        const non3dhTemplates = templates.filter(t => !t.threeDh && t.enabled !== false);
        
        let options = '';
        if (!is3dh) {
            options += `<button class="template-option" data-type="3dh">🔐 Переключить на 3DH</button>`;
        }
        if (non3dhTemplates.length > 0) {
            options += `<button class="template-option" data-type="custom">📋 Использовать мой шаблон</button>`;
        }
        options += `<button class="template-option" data-type="default">🔄 Вернуть к стандартным</button>`;

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog" style="max-width:400px">
                <div class="confirm-header">
                    <h3>Переключить шаблон пробной подписки</h3>
                    <p>Текущий: ${is3dh ? '🔐 3DH' : '📋 Стандартный'}</p>
                </div>
                <div class="confirm-content">
                    <div style="display:flex;flex-direction:column;gap:8px">
                        ${options}
                    </div>
                    <div id="customTemplateSelect" style="display:none;margin-top:12px">
                        <label style="font-size:0.9rem;color:var(--text-secondary)">Выберите шаблон:</label>
                        <select id="customTemplateDropdown" style="width:100%;margin-top:4px;padding:8px;border-radius:6px;border:1px solid var(--border)">
                            ${non3dhTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="confirm-actions">
                    <button class="btn-cancel" style="width:100%">Отмена</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Close handlers
        overlay.querySelector('.btn-cancel').onclick = () => overlay.remove();
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        // Template option handlers
        overlay.querySelectorAll('.template-option').forEach(btn => {
            btn.addEventListener('click', async () => {
                const type = btn.dataset.type;
                let templateId = null;

                if (type === 'custom') {
                    const selectDiv = overlay.querySelector('#customTemplateSelect');
                    if (selectDiv.style.display === 'none') {
                        selectDiv.style.display = 'block';
                        return;
                    }
                    templateId = overlay.querySelector('#customTemplateDropdown').value;
                }

                try {
                    btn.disabled = true;
                    btn.textContent = '...';
                    
                    const res = await api('POST', `/api/subs/${subId}/switch-template`, { templateType: type, templateId });
                    
                    showToast(res.message || 'Шаблон изменен', 'success');
                    overlay.remove();
                    await loadAll();
                } catch (err) {
                    showToast(err.message, 'error');
                    btn.disabled = false;
                    btn.textContent = btn.dataset.type === '3dh' ? '🔐 Переключить на 3DH' : 
                                   btn.dataset.type === 'custom' ? '📋 Использовать мой шаблон' : '🔄 Вернуть к стандартным';
                }
            });
        });
    }

    async function handleSaveSub() {
        const name = $('#subName').value.trim(), editId = $('#subEditId').value;
        if (!name) { showToast('Введите название', 'error'); return; }
        const templateIds = Array.from($$('#tplSelectList input:checked')).map(c => c.value);
        if (templateIds.length === 0) { showToast('Выберите шаблоны', 'error'); return; }
        const body = { name, templateIds, trafficTotal: parseFloat($('#subTraffic').value) || 0, maxDevices: parseInt($('#subMaxDevices').value) || 0, expiresAt: $('#subExpires').value || '', notes: $('#subNotes').value.trim() };
        try {
            if (editId) { await api('PUT', `/api/subs/${editId}`, body); showToast('Обновлена', 'success'); }
            else { await api('POST', '/api/subs', body); showToast('Создана', 'success'); }
            closeModal('modalAddSub'); await loadAll();
        } catch (e) { showToast(e.message, 'error'); }
    }

    // ===== DEVICES =====
    async function loadDevices(sub) {
        try {
            const devices = await api('GET', `/api/subs/${sub.id}/devices`);
            const limit = sub.maxDevices || 0;
            $('#subDeviceCount').textContent = devices.length;
            $('#subDeviceLimit').textContent = limit > 0 ? ` / ${limit}` : ' / ∞';
            if (devices.length === 0) { $('#subDevicesList').innerHTML = '<div class="empty-hint">Нет устройств</div>'; return; }
            $('#subDevicesList').innerHTML = devices.map(d => {
                const last = new Date(d.lastSeen).toLocaleString('ru-RU');
                const hw = d.hwid.length > 16 ? d.hwid.substring(0, 16) + '...' : d.hwid;
                return `<div class="device-item"><div class="device-info"><div class="device-name">${escapeHtml(d.name || 'Устройство')}</div><div class="device-meta"><span>HWID: ${escapeHtml(hw)}</span><span>${last}</span></div></div><button class="btn-icon btn-delete btn-del-device" data-del-hwid="${d.hwid}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button></div>`;
            }).join('');
            $('#subDevicesList').querySelectorAll('.btn-del-device').forEach(btn => btn.addEventListener('click', async () => {
                if (await showConfirm('Удалить устройство?', '')) { await api('DELETE', `/api/subs/${sub.id}/devices/${btn.dataset.delHwid}`); showToast('Удалено', 'success'); loadDevices(sub); }
            }));
        } catch { $('#subDevicesList').innerHTML = '<div class="empty-hint">Ошибка</div>'; }
    }

    // ===== PAYMENT METHODS =====
    function getPaymentMethodsForSettings() {
        if (Array.isArray(settings.paymentMethods) && settings.paymentMethods.length) {
            return settings.paymentMethods.map((m, i) => ({
                id: m.id || `method_${i}`,
                provider: m.provider || m.id || 'custom',
                name: m.name || m.title || 'Способ оплаты',
                methods: m.methods || '',
                currency: m.currency || settings.currency || '₽',
                info: m.info || '',
                enabled: m.enabled !== false
            }));
        }
        if (settings.paymentMethod || settings.paymentInfo) {
            return [{
                id: 'manual_card',
                provider: 'manual_card',
                name: settings.paymentMethod || 'Перевод на карту',
                methods: 'Карта, СБП',
                currency: settings.currency || '₽',
                info: settings.paymentInfo || '',
                enabled: true
            }];
        }
        return [];
    }

    function renderPaymentMethodsSettings() {
        const list = $('#paymentMethodsList');
        const select = $('#paymentPresetSelect');
        if (!list) return;
        if (select && !select.dataset.ready) {
            select.innerHTML = '<option value="">Выбрать из списка...</option>' + PAYMENT_PROVIDER_PRESETS.map(p =>
                `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.methods)} (${escapeHtml(p.currency)})</option>`
            ).join('');
            select.dataset.ready = '1';
        }
        const methods = getPaymentMethodsForSettings();
        list.innerHTML = methods.length ? methods.map((m, i) => `
            <div class="payment-method-item" data-pay-idx="${i}">
                <div class="payment-method-head">
                    <label class="payment-method-enabled">
                        <input type="checkbox" class="pay-enabled" ${m.enabled ? 'checked' : ''}> Вкл.
                    </label>
                    <div class="payment-method-title">${escapeHtml(m.name)}</div>
                    <button type="button" class="btn-outline btn-sm btn-danger pay-remove" data-pay-remove="${i}">Удалить</button>
                </div>
                <div class="payment-method-grid">
                    <input type="text" class="form-input pay-name" value="${escapeHtml(m.name)}" placeholder="Название">
                    <input type="text" class="form-input pay-methods" value="${escapeHtml(m.methods)}" placeholder="Методы: карты, СБП">
                    <input type="text" class="form-input pay-currency" value="${escapeHtml(m.currency)}" placeholder="Валюта">
                </div>
                <textarea class="form-input form-textarea pay-info" rows="3" placeholder="Реквизиты, ссылка или инструкция">${escapeHtml(m.info)}</textarea>
                <input type="hidden" class="pay-provider" value="${escapeHtml(m.provider)}">
            </div>
        `).join('') : '<div class="empty-hint" style="padding:12px">Способы оплаты не добавлены. Старые реквизиты ниже продолжат работать как fallback.</div>';

        list.querySelectorAll('[data-pay-remove]').forEach(btn => btn.addEventListener('click', () => {
            const next = collectPaymentMethodsFromUI();
            next.splice(parseInt(btn.dataset.payRemove), 1);
            settings.paymentMethods = next;
            renderPaymentMethodsSettings();
        }));
    }

    function collectPaymentMethodsFromUI() {
        const list = $('#paymentMethodsList');
        if (!list) return getPaymentMethodsForSettings();
        return [...list.querySelectorAll('.payment-method-item')].map((el, i) => ({
            id: el.querySelector('.pay-provider')?.value || `custom_${i}`,
            provider: el.querySelector('.pay-provider')?.value || 'custom',
            name: el.querySelector('.pay-name')?.value.trim() || 'Способ оплаты',
            methods: el.querySelector('.pay-methods')?.value.trim() || '',
            currency: el.querySelector('.pay-currency')?.value.trim() || '',
            info: el.querySelector('.pay-info')?.value.trim() || '',
            enabled: !!el.querySelector('.pay-enabled')?.checked
        })).filter(m => m.name || m.info);
    }

    function addPaymentMethodFromPreset() {
        const select = $('#paymentPresetSelect');
        if (!select || !select.value) return;
        const preset = PAYMENT_PROVIDER_PRESETS.find(p => p.id === select.value);
        if (!preset) return;
        const methods = collectPaymentMethodsFromUI();
        methods.push({
            id: preset.id,
            provider: preset.id,
            name: preset.name,
            methods: preset.methods,
            currency: preset.currency,
            info: preset.hint,
            enabled: true
        });
        settings.paymentMethods = methods;
        select.value = '';
        renderPaymentMethodsSettings();
    }

    // ===== SETTINGS =====
    function loadSettingsUI() {
        $('#settingTitle').value = settings.title || ''; $('#settingDesc').value = settings.description || '';
        $('#settingSupportUrl').value = settings.supportUrl || ''; $('#settingWebsite').value = settings.website || '';
        $('#settingUpdateInterval').value = settings.updateInterval || 12;
        if ($('#settingVlessNameTemplate')) $('#settingVlessNameTemplate').value = settings.vlessNameTemplate || '{server}';
        $('#settingServerUrl').value = settings.serverUrl || ''; $('#settingBotLink').value = settings.botDeepLink || '';
        $('#settingRelayDomain').value = settings.relayDomain || '';
        $('#settingRelayMainPort').value = settings.relayMainPort || '';
        $('#settingRelayBasePort').value = settings.relayBasePort || '';
        const relayOn = !!(settings.relayDomain);
        $('#settingRelayEnabled').checked = relayOn;
        $('#relayFields').style.display = relayOn ? '' : 'none';
        // Reality
        if ($('#settingRealitySni')) $('#settingRealitySni').value = settings.realitySni || 'www.gosuslugi.ru';
        if ($('#settingRealityPublicKey')) $('#settingRealityPublicKey').value = settings.realityPublicKey || '(будет сгенерирован при первом запуске)';
        // Stubs
        $('#settingStubTitle').value = settings.stubTitle || '';
        $('#settingStubDisabled').value = settings.stubDisabled || '';
        $('#settingStubExpired').value = settings.stubExpired || '';
        $('#settingStubDeviceLimit').value = settings.stubDeviceLimit || '';
        $('#settingStubNotFound').value = settings.stubNotFound || '';
        $('#settingStubNoToken').value = settings.stubNoToken || '';
        // Notifications & Bot
        $('#settingNotifySuspIp').checked = settings.notifySuspiciousIp !== false;
        $('#settingAdminChatId').value = settings.adminChatId || '';
        $('#settingBotToken').value = settings.botToken || '';
        $('#settingAdminIds').value = settings.adminIds || '';
        // User Bot
        if ($('#settingUserBotToken')) $('#settingUserBotToken').value = settings.userBotToken || '';
        if ($('#settingShopName')) $('#settingShopName').value = settings.shopName || '';
        if ($('#settingCurrency')) $('#settingCurrency').value = settings.currency || '';
        if ($('#settingDevicePrice')) $('#settingDevicePrice').value = settings.devicePrice || '';
        if ($('#settingPaymentMethod')) $('#settingPaymentMethod').value = settings.paymentMethod || '';
        if ($('#settingPaymentInfo')) $('#settingPaymentInfo').value = settings.paymentInfo || '';
        if ($('#settingYooKassaEnabled')) $('#settingYooKassaEnabled').checked = !!settings.yookassaEnabled;
        if ($('#settingYooKassaShopId')) $('#settingYooKassaShopId').value = settings.yookassaShopId || '';
        if ($('#settingYooKassaSecretKey')) {
            $('#settingYooKassaSecretKey').value = '';
            $('#settingYooKassaSecretKey').placeholder = settings.yookassaSecretKey ? 'Сохранён, введи новый для замены' : 'live_...';
        }
        if ($('#settingYooKassaDescription')) $('#settingYooKassaDescription').value = settings.yookassaDescription || '';
        if ($('#yookassaWebhookUrl')) {
            const base = (settings.serverUrl || window.location.origin).replace(/\/+$/, '');
            $('#yookassaWebhookUrl').textContent = `${base}/api/payments/yookassa/webhook`;
        }
        if ($('#settingPlategaEnabled')) $('#settingPlategaEnabled').checked = !!settings.plategaEnabled;
        if ($('#settingPlategaMerchantId')) $('#settingPlategaMerchantId').value = settings.plategaMerchantId || '';
        if ($('#settingPlategaSecretKey')) {
            $('#settingPlategaSecretKey').value = '';
            $('#settingPlategaSecretKey').placeholder = settings.plategaSecretKey ? 'Сохранён, введи новый для замены' : 'API key';
        }
        if ($('#settingPlategaPaymentMethod')) $('#settingPlategaPaymentMethod').value = String(settings.plategaPaymentMethod || 11);
        if ($('#settingPlategaDescription')) $('#settingPlategaDescription').value = settings.plategaDescription || '';
        if ($('#plategaWebhookUrl')) {
            const base = (settings.serverUrl || window.location.origin).replace(/\/+$/, '');
            $('#plategaWebhookUrl').textContent = `${base}/api/payments/platega/webhook`;
        }
        if ($('#settingThreeDhEnabled')) $('#settingThreeDhEnabled').checked = !!settings.threeDhEnabled;
        if ($('#settingThreeDhPin')) {
            $('#settingThreeDhPin').value = '';
            $('#settingThreeDhPin').placeholder = settings.threeDhPin ? 'Сохранён, введи новый для замены' : 'PIN';
        }
        if ($('#settingThreeDhMode')) $('#settingThreeDhMode').value = settings.threeDhMode || 7;
        if ($('#settingThreeDhDeviceType')) $('#settingThreeDhDeviceType').value = String(settings.threeDhDeviceType || 2);
        if ($('#settingThreeDhProtocol')) $('#settingThreeDhProtocol').value = settings.threeDhProtocol || 'vless';
        if ($('#settingThreeDhLocationId')) $('#settingThreeDhLocationId').value = settings.threeDhLocationId || '';
        if ($('#settingThreeDhNameTemplate')) $('#settingThreeDhNameTemplate').value = settings.threeDhNameTemplate || 'HappVPN-{userId}-{order}';
        if ($('#settingUserBotWelcome')) $('#settingUserBotWelcome').value = settings.userBotWelcome || '';
        if ($('#settingShopWelcomeShort')) $('#settingShopWelcomeShort').value = settings.shopWelcomeShort || '';
        if ($('#settingUserBotLink')) $('#settingUserBotLink').value = settings.userBotLink || '';
        if ($('#settingRequiredChannelsEnabled')) $('#settingRequiredChannelsEnabled').checked = !!settings.requiredChannelsEnabled;
        if ($('#settingRequiredChannels')) $('#settingRequiredChannels').value = settings.requiredChannels || '';
        if ($('#settingReferralBonusRub')) $('#settingReferralBonusRub').value = settings.referralBonusRub || 40;
        if ($('#settingTrialDays')) $('#settingTrialDays').value = settings.trialDays || 0;
        if ($('#settingExpireNotifyDays')) $('#settingExpireNotifyDays').value = (settings.expireNotifyDays || [3, 2, 1]).join(',');
        if ($('#settingExpireNotifyAfter')) $('#settingExpireNotifyAfter').checked = settings.expireNotifyAfter !== false;
        if ($('#settingAppLinkHappIos')) $('#settingAppLinkHappIos').value = settings.appLinks?.happIos || '';
        if ($('#settingAppLinkStreisandIos')) $('#settingAppLinkStreisandIos').value = settings.appLinks?.streisandIos || '';
        if ($('#settingAppLinkV2rayAndroid')) $('#settingAppLinkV2rayAndroid').value = settings.appLinks?.v2rayAndroid || '';
        if ($('#settingAppLinkNekorayDesktop')) $('#settingAppLinkNekorayDesktop').value = settings.appLinks?.nekorayDesktop || '';
        if ($('#settingShopWelcome')) $('#settingShopWelcome').value = settings.shopWelcome || '';
        // Welcome photo preview
        if ($('#welcomePhotoPreview')) {
            if (settings.shopWelcomePhoto) {
                $('#welcomePhotoPreview').src = uploadPreviewUrl(settings.shopWelcomePhoto);
                $('#welcomePhotoPreview').style.display = 'block';
                if ($('#btnRemoveWelcomePhoto')) $('#btnRemoveWelcomePhoto').style.display = '';
            } else {
                $('#welcomePhotoPreview').style.display = 'none';
                if ($('#btnRemoveWelcomePhoto')) $('#btnRemoveWelcomePhoto').style.display = 'none';
            }
        }
    }

    async function handleSaveSettings() {
        const body = {
            title: $('#settingTitle').value.trim(), description: $('#settingDesc').value.trim(),
            supportUrl: $('#settingSupportUrl').value.trim(), website: $('#settingWebsite').value.trim(),
            updateInterval: parseInt($('#settingUpdateInterval').value) || 12,
            vlessNameTemplate: $('#settingVlessNameTemplate') ? $('#settingVlessNameTemplate').value.trim() || '{server}' : '{server}',
            serverUrl: $('#settingServerUrl').value.trim(), botDeepLink: $('#settingBotLink').value.trim(),
            relayDomain: $('#settingRelayEnabled').checked ? $('#settingRelayDomain').value.trim() : '',
            relayMainPort: $('#settingRelayMainPort').value.trim(),
            relayBasePort: $('#settingRelayBasePort').value.trim(),
            realitySni: $('#settingRealitySni') ? $('#settingRealitySni').value : 'www.gosuslugi.ru',
            stubTitle: $('#settingStubTitle').value.trim(),
            stubDisabled: $('#settingStubDisabled').value.trim(),
            stubExpired: $('#settingStubExpired').value.trim(),
            stubDeviceLimit: $('#settingStubDeviceLimit').value.trim(),
            stubNotFound: $('#settingStubNotFound').value.trim(),
            stubNoToken: $('#settingStubNoToken').value.trim(),
            notifySuspiciousIp: $('#settingNotifySuspIp').checked,
            adminChatId: $('#settingAdminChatId').value.trim(),
            botToken: $('#settingBotToken').value.trim(),
            adminIds: $('#settingAdminIds').value.trim(),
            userBotToken: $('#settingUserBotToken') ? $('#settingUserBotToken').value.trim() : '',
            shopName: $('#settingShopName') ? $('#settingShopName').value.trim() : '',
            currency: $('#settingCurrency') ? $('#settingCurrency').value.trim() : '',
            devicePrice: $('#settingDevicePrice') ? parseFloat($('#settingDevicePrice').value) || 0 : 0,
            paymentMethod: $('#settingPaymentMethod') ? $('#settingPaymentMethod').value.trim() : '',
            paymentInfo: $('#settingPaymentInfo') ? $('#settingPaymentInfo').value.trim() : '',
            paymentMethods: [],
            yookassaEnabled: $('#settingYooKassaEnabled') ? $('#settingYooKassaEnabled').checked : false,
            yookassaShopId: $('#settingYooKassaShopId') ? $('#settingYooKassaShopId').value.trim() : '',
            yookassaDescription: $('#settingYooKassaDescription') ? $('#settingYooKassaDescription').value.trim() : '',
            plategaEnabled: $('#settingPlategaEnabled') ? $('#settingPlategaEnabled').checked : false,
            plategaMerchantId: $('#settingPlategaMerchantId') ? $('#settingPlategaMerchantId').value.trim() : '',
            plategaPaymentMethod: $('#settingPlategaPaymentMethod') ? parseInt($('#settingPlategaPaymentMethod').value) || 11 : 11,
            plategaDescription: $('#settingPlategaDescription') ? $('#settingPlategaDescription').value.trim() : '',
            threeDhEnabled: $('#settingThreeDhEnabled') ? $('#settingThreeDhEnabled').checked : false,
            threeDhMode: $('#settingThreeDhMode') ? parseInt($('#settingThreeDhMode').value) || 7 : 7,
            threeDhDeviceType: $('#settingThreeDhDeviceType') ? parseInt($('#settingThreeDhDeviceType').value) || 2 : 2,
            threeDhProtocol: $('#settingThreeDhProtocol') ? $('#settingThreeDhProtocol').value.trim() : '',
            threeDhLocationId: $('#settingThreeDhLocationId') ? $('#settingThreeDhLocationId').value.trim() : '',
            threeDhNameTemplate: $('#settingThreeDhNameTemplate') ? $('#settingThreeDhNameTemplate').value.trim() || 'HappVPN-{userId}-{order}' : 'HappVPN-{userId}-{order}',
            userBotWelcome: $('#settingUserBotWelcome') ? $('#settingUserBotWelcome').value.trim() : '',
            shopWelcomeShort: $('#settingShopWelcomeShort') ? $('#settingShopWelcomeShort').value.trim() : '',
            userBotLink: $('#settingUserBotLink') ? $('#settingUserBotLink').value.trim() : '',
            requiredChannelsEnabled: $('#settingRequiredChannelsEnabled') ? $('#settingRequiredChannelsEnabled').checked : false,
            requiredChannels: $('#settingRequiredChannels') ? $('#settingRequiredChannels').value.trim() : '',
            referralBonusRub: $('#settingReferralBonusRub') ? parseInt($('#settingReferralBonusRub').value) || 40 : 40,
            trialDays: $('#settingTrialDays') ? parseInt($('#settingTrialDays').value) || 0 : 0,
            expireNotifyDays: $('#settingExpireNotifyDays') ? $('#settingExpireNotifyDays').value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [3, 2, 1],
            expireNotifyAfter: $('#settingExpireNotifyAfter') ? $('#settingExpireNotifyAfter').checked : true,
            appLinks: {
                happIos: $('#settingAppLinkHappIos') ? $('#settingAppLinkHappIos').value.trim() : '',
                streisandIos: $('#settingAppLinkStreisandIos') ? $('#settingAppLinkStreisandIos').value.trim() : '',
                v2rayAndroid: $('#settingAppLinkV2rayAndroid') ? $('#settingAppLinkV2rayAndroid').value.trim() : '',
                nekorayDesktop: $('#settingAppLinkNekorayDesktop') ? $('#settingAppLinkNekorayDesktop').value.trim() : ''
            },
            shopWelcome: $('#settingShopWelcome') ? $('#settingShopWelcome').value.trim() : ''
        };
        const yookassaSecret = $('#settingYooKassaSecretKey') ? $('#settingYooKassaSecretKey').value.trim() : '';
        if (yookassaSecret) body.yookassaSecretKey = yookassaSecret;
        const plategaSecret = $('#settingPlategaSecretKey') ? $('#settingPlategaSecretKey').value.trim() : '';
        if (plategaSecret) body.plategaSecretKey = plategaSecret;
        const threeDhPin = $('#settingThreeDhPin') ? $('#settingThreeDhPin').value.trim() : '';
        if (threeDhPin) body.threeDhPin = threeDhPin;
        const pw = $('#settingPassword').value;
        if (pw) body.adminPassword = pw;
        try { settings = await api('POST', '/api/settings', body); showToast('Сохранено', 'success'); $('#settingPassword').value = ''; }
        catch (e) { showToast(e.message, 'error'); }
    }

    // ===== EXPORT / IMPORT =====
    async function exportAll() { try { const d = await api('GET', '/api/export'); const b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `happvpn-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(u); showToast('Экспорт готов', 'success'); } catch (e) { showToast(e.message, 'error'); } }
    function importData(file) { const r = new FileReader(); r.onload = async e => { try { await api('POST', '/api/import', JSON.parse(e.target.result)); await loadAll(); showToast('Импорт OK', 'success'); } catch { showToast('Ошибка', 'error'); } }; r.readAsText(file); }
    async function handleClearAll() { if (await showConfirm('Очистить?', 'Все данные удалятся.')) { await api('POST', '/api/clear'); await loadAll(); showToast('Очищено', 'success'); } }

    // ===== PLANS MANAGEMENT =====
    function renderPlans() {
        const list = $('#plansList'), empty = $('#emptyPlans');
        if (!list || !empty) return;
        if (plans.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
        empty.style.display = 'none';

        const cur = settings.currency || '₽';

        list.innerHTML = plans.map((p, i) => {
            const statusClass = p.enabled === false ? 'disabled' : 'active';
            const dur = p.duration <= 0 ? '∞' : p.duration + ' дн.';
            const traf = p.traffic > 0 ? p.traffic + ' GB' : '∞';
            const devs = p.maxDevices > 0 ? p.maxDevices : '∞';
            const tplNames = (p.templateIds || []).map(id => {
                const t = templates.find(x => x.id === id);
                return t ? t.name : '?';
            }).join(', ');
            const planSources = [tplNames, p.useThreeDh ? '3DH автоматом' : ''].filter(Boolean).join(', ');

            return `<div class="sub-card ${statusClass}" style="animation-delay:${i * 0.04}s">
                <div class="sub-card-top">
                    <div class="sub-status-dot ${statusClass}"></div>
                    <div class="sub-card-name">${p.popular ? '⭐ ' : ''}${escapeHtml(p.name)}</div>
                    <div class="sub-card-actions">
                        <button class="btn-icon" data-toggle-plan="${p.id}" title="${p.enabled === false ? 'Вкл' : 'Выкл'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/></svg></button>
                        <button class="btn-icon" data-edit-plan="${p.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button class="btn-icon" data-del-plan="${p.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
                    </div>
                </div>
                <div class="sub-card-meta">
                    <span>💰 ${p.price} ${escapeHtml(cur)}</span>
                    <span>⏱ ${dur}</span>
                    <span>📊 ${traf}</span>
                    <span>📱 ${devs}</span>
                </div>
                ${p.description ? `<div class="sub-card-notes">${escapeHtml(p.description)}</div>` : ''}
                ${planSources ? `<div class="sub-card-notes" style="font-size:0.7rem;margin-top:4px">📦 ${escapeHtml(planSources)}</div>` : ''}
            </div>`;
        }).join('');

        // Bind events
        list.querySelectorAll('[data-edit-plan]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); editPlan(b.dataset.editPlan); }));
        list.querySelectorAll('[data-del-plan]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation();
            const p = plans.find(x => x.id === b.dataset.delPlan);
            if (p && await showConfirm('Удалить тариф?', `"${escapeHtml(p.name)}"`)) {
                await api('DELETE', `/api/plans/${p.id}`);
                await loadAll();
                showToast('Удалён', 'success');
            }
        }));
        list.querySelectorAll('[data-toggle-plan]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation();
            const p = plans.find(x => x.id === b.dataset.togglePlan);
            if (!p) return;
            await api('PUT', `/api/plans/${p.id}`, { enabled: p.enabled === false ? true : false });
            await loadAll();
            showToast(p.enabled === false ? 'Включён' : 'Выключен', 'success');
        }));
    }

    function renderPlanTemplateSelect(selectedIds = []) {
        const regularTemplates = templates.filter(t => !t.threeDh);
        if (regularTemplates.length === 0) {
            $('#planTplSelectList').innerHTML = '<div class="empty-hint">Нет обычных шаблонов. Можно включить 3DH donor выше.</div>';
            return;
        }
        $('#planTplSelectList').innerHTML = regularTemplates.map(t => `<label class="key-select-item"><input type="checkbox" value="${t.id}" ${selectedIds.includes(t.id) ? 'checked' : ''}><span class="select-name">${escapeHtml(t.name)} (${(t.uris || []).length})</span></label>`).join('');
    }

    function openCreatePlan() {
        renderPlanTemplateSelect([]);
        $('#planName').value = ''; $('#planPrice').value = ''; $('#planDuration').value = '30';
        $('#planTraffic').value = ''; $('#planMaxDevices').value = ''; $('#planDescription').value = '';
        $('#planPopular').checked = false;
        if ($('#planUseThreeDh')) $('#planUseThreeDh').checked = false;
        $('#planEditId').value = ''; $('#modalPlanTitle').textContent = 'Добавить тариф'; $('#btnSavePlan').textContent = 'Создать';
        openModal('modalAddPlan');
    }

    function editPlan(id) {
        const p = plans.find(x => x.id === id); if (!p) return;
        renderPlanTemplateSelect(p.templateIds || []);
        $('#planName').value = p.name || ''; $('#planPrice').value = p.price || '';
        $('#planDuration').value = p.duration || 30;
        $('#planTraffic').value = p.traffic || ''; $('#planMaxDevices').value = p.maxDevices || '';
        $('#planDescription').value = p.description || '';
        $('#planPopular').checked = !!p.popular;
        if ($('#planUseThreeDh')) $('#planUseThreeDh').checked = !!p.useThreeDh;
        $('#planEditId').value = p.id; $('#modalPlanTitle').textContent = 'Редактировать тариф'; $('#btnSavePlan').textContent = 'Сохранить';
        openModal('modalAddPlan');
    }

    async function handleSavePlan() {
        const name = $('#planName').value.trim(), editId = $('#planEditId').value;
        if (!name) { showToast('Введите название', 'error'); return; }
        const templateIds = Array.from($$('#planTplSelectList input:checked')).map(c => c.value);
        const useThreeDh = $('#planUseThreeDh') ? $('#planUseThreeDh').checked : false;
        if (!useThreeDh && templateIds.length === 0) { showToast('Выберите шаблон или включите 3DH donor', 'error'); return; }
        const body = {
            name,
            price: parseFloat($('#planPrice').value) || 0,
            duration: parseInt($('#planDuration').value) || 30,
            traffic: parseFloat($('#planTraffic').value) || 0,
            maxDevices: parseInt($('#planMaxDevices').value) || 0,
            templateIds,
            useThreeDh,
            description: $('#planDescription').value.trim(),
            popular: $('#planPopular').checked
        };
        try {
            if (editId) { await api('PUT', `/api/plans/${editId}`, body); showToast('Обновлён', 'success'); }
            else { await api('POST', '/api/plans', body); showToast('Создан', 'success'); }
            closeModal('modalAddPlan'); await loadAll();
        } catch (e) { showToast(e.message, 'error'); }
    }

    // ===== ORDERS MANAGEMENT =====
    let ordersFilter = 'all';
    async function loadOrders(filter = 'all') {
        ordersFilter = filter;
        const list = $('#ordersList');
        if (!list) return;
        try {
            const url = filter === 'all' ? '/api/orders' : `/api/orders?status=${filter}`;
            const orders = await api('GET', url);
            if (orders.length === 0) {
                list.innerHTML = '<div class="mon-no-data">Нет заказов</div>';
                return;
            }
            list.innerHTML = orders.slice(0, 50).map(o => {
                const statusMap = { awaiting_payment: '💳 Ожид. оплаты', pending_review: '⏳ На проверке', completed: '✅ Выполнен', rejected: '❌ Отклонён', canceled: '🚫 Отменён', cancelled: '🚫 Отменён', failed: '⚠️ Ошибка' };
                const st = statusMap[o.status] || o.status;
                const date = new Date(o.createdAt).toLocaleString('ru-RU');
                return `<div class="log-item" style="margin-bottom:8px">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <span style="font-weight:600">${st}</span>
                        <span>${escapeHtml(o.planName || '?')}</span>
                        <span style="color:var(--primary)">${o.price || 0} ${escapeHtml(settings.currency || '₽')}</span>
                        ${o.paymentMethod ? `<span style="color:var(--text-tertiary);font-size:0.75rem">💳 ${escapeHtml(o.paymentMethod)}</span>` : ''}
                        <span style="color:var(--text-tertiary);font-size:0.75rem">@${escapeHtml(o.username || 'n/a')}</span>
                        <span style="color:var(--text-tertiary);font-size:0.75rem">${date}</span>
                    </div>
                </div>`;
            }).join('');
        } catch { list.innerHTML = '<div class="mon-no-data">Ошибка загрузки</div>'; }
    }

    // ===== INIT =====
    function init() {
        initTabs(); initModals(); checkAuth();

        // Auth
        $('#btnLogin').addEventListener('click', handleLogin);
        $('#loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

        // Templates
        $('#btnAddTpl').addEventListener('click', () => { resetTplForm(); openModal('modalAddTpl'); });
        $('#btnSaveTpl').addEventListener('click', handleSaveTemplate);
        $('#searchTemplates').addEventListener('input', e => renderTemplates(e.target.value));

        // Subs
        $('#btnAddSub').addEventListener('click', openCreateSub);
        $('#btnSaveSub').addEventListener('click', handleSaveSub);
        $('#btnDeleteTrials').addEventListener('click', deleteAllTrials);
        $('#searchSubs').addEventListener('input', e => renderSubs(e.target.value));

        // Detail
        $('#btnCopyUrl').addEventListener('click', () => { if (currentSub) { copyToClipboard(getSubUrl(currentSub.token)); showToast('Скопировано', 'success'); } });
        $('#btnCopyBotLink').addEventListener('click', () => { if (currentSub) { const dl = settings.userBotLink || settings.botDeepLink; if (dl) { copyToClipboard(`${dl}?start=sub_${currentSub.token}`); showToast('Скопировано', 'success'); } } });
        $('#btnRegenToken').addEventListener('click', async () => {
            if (!currentSub) return;
            if (await showConfirm('Новый токен?', 'Старый URL перестанет работать.')) {
                try { const u = await api('POST', `/api/subs/${currentSub.id}/regenerate`); currentSub = u; $('#subUrlText').textContent = getSubUrl(u.token); generateQR(getSubUrl(u.token), $('#subQrCode')); $('#subAccessCount').textContent = '0'; await loadAll(); showToast('Обновлён', 'success'); } catch (e) { showToast(e.message, 'error'); }
            }
        });
        $('#btnClearDevices').addEventListener('click', async () => { if (currentSub && await showConfirm('Сбросить устройства?', '')) { await api('DELETE', `/api/subs/${currentSub.id}/devices`); showToast('Сброшены', 'success'); loadDevices(currentSub); } });

        // Settings
        $('#btnSaveSettings').addEventListener('click', handleSaveSettings);
        $('#settingRelayEnabled').addEventListener('change', e => {
            $('#relayFields').style.display = e.target.checked ? '' : 'none';
        });
        $('#btnExport').addEventListener('click', exportAll);
        $('#btnExportAll').addEventListener('click', exportAll);
        $('#btnImport').addEventListener('click', () => $('#importFile').click());
        $('#importFile').addEventListener('change', e => { if (e.target.files.length > 0) { importData(e.target.files[0]); e.target.value = ''; } });
        $('#btnClearAll').addEventListener('click', handleClearAll);

        // Logs
        $('#btnClearLogs').addEventListener('click', async () => { if (await showConfirm('Очистить логи?', 'Вся история будет удалена.')) { await api('DELETE', '/api/logs'); showToast('Очищено', 'success'); loadLogs(true); } });
        $('#btnLoadMoreLogs').addEventListener('click', () => loadLogs(false));

        // Plans
        if ($('#btnAddPlan')) $('#btnAddPlan').addEventListener('click', openCreatePlan);
        if ($('#btnSavePlan')) $('#btnSavePlan').addEventListener('click', handleSavePlan);
        if ($('#btnAddPaymentMethod')) $('#btnAddPaymentMethod').addEventListener('click', addPaymentMethodFromPreset);

        // Welcome photo upload
        if ($('#settingShopWelcomePhoto')) $('#settingShopWelcomePhoto').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) { showToast('Выберите изображение', 'error'); e.target.value = ''; return; }
            if (file.size > 10 * 1024 * 1024) { showToast('Фото слишком большое, максимум 10 МБ', 'error'); e.target.value = ''; return; }
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const res = await api('POST', '/api/upload-photo', { image: reader.result, field: 'shopWelcomePhoto' });
                    if (res.url) {
                        settings.shopWelcomePhoto = res.url;
                        $('#welcomePhotoPreview').src = uploadPreviewUrl(res.url);
                        $('#welcomePhotoPreview').style.display = 'block';
                        if ($('#btnRemoveWelcomePhoto')) $('#btnRemoveWelcomePhoto').style.display = '';
                        showToast('Фото загружено', 'success');
                    }
                } catch (err) { showToast(err.message, 'error'); }
                e.target.value = '';
            };
            reader.onerror = () => { showToast('Не удалось прочитать фото', 'error'); e.target.value = ''; };
            reader.readAsDataURL(file);
        });
        if ($('#btnRemoveWelcomePhoto')) $('#btnRemoveWelcomePhoto').addEventListener('click', async () => {
            try {
                await api('DELETE', '/api/upload-photo', { field: 'shopWelcomePhoto' });
                settings.shopWelcomePhoto = '';
                $('#welcomePhotoPreview').style.display = 'none';
                $('#btnRemoveWelcomePhoto').style.display = 'none';
                showToast('Фото удалено', 'success');
            } catch (err) { showToast(err.message, 'error'); }
        });

        // Orders filter
        $$('[data-order-filter]').forEach(b => b.addEventListener('click', () => {
            $$('[data-order-filter]').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            loadOrders(b.dataset.orderFilter);
        }));

        // Tab change loads
        $$('.tab-btn').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.tab !== 'monitoring') stopOnlineTimer();
            if (b.dataset.tab === 'logs') loadLogs(true);
            if (b.dataset.tab === 'dashboard') loadDashboard();
            if (b.dataset.tab === 'monitoring') loadMonitoring();
            if (b.dataset.tab === 'shop') { renderPlans(); loadOrders(ordersFilter); }
            if (b.dataset.tab === 'users') renderUsers();
            if (b.dataset.tab === 'mtproxy') renderMtproxies();
        }));

        // Monitoring filters
        $$('[data-mon-filter]').forEach(b => b.addEventListener('click', () => {
            $$('[data-mon-filter]').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            renderMonitoring(b.dataset.monFilter);
        }));

        // Users
        if ($('#btnBroadcast')) $('#btnBroadcast').addEventListener('click', () => { $('#broadcastText').value = ''; $('#broadcastStatus').textContent = ''; openModal('modalBroadcast'); });
        if ($('#btnSendBroadcast')) $('#btnSendBroadcast').addEventListener('click', handleBroadcast);
        if ($('#searchUsers')) $('#searchUsers').addEventListener('input', e => renderUsers(e.target.value));

        // User profile actions
        if ($('#btnSetBalance')) $('#btnSetBalance').addEventListener('click', async () => {
            if (!currentUserId) return;
            const val = parseFloat($('#userBalanceInput').value);
            if (isNaN(val)) { showToast('Введите сумму', 'error'); return; }
            try { await api('PUT', `/api/shop-users/${currentUserId}`, { balance: val }); showToast(`Баланс: ${val}`, 'success'); await loadAll(); openUserProfile(currentUserId); } catch (e) { showToast(e.message, 'error'); }
        });
        ['100', '500', '1000'].forEach(amt => {
            const btn = $(`#btnAddBalance${amt}`);
            if (btn) btn.addEventListener('click', async () => {
                if (!currentUserId) return;
                try { await api('PUT', `/api/shop-users/${currentUserId}/balance`, { amount: parseInt(amt), description: 'Начислено через панель' }); showToast(`+${amt}`, 'success'); await loadAll(); openUserProfile(currentUserId); } catch (e) { showToast(e.message, 'error'); }
            });
        });
        if ($('#btnAssignSub')) $('#btnAssignSub').addEventListener('click', () => assignSubDays(parseInt($('#userSubDays').value)));
        ['7', '30', '90'].forEach(d => {
            const btn = $(`#btnAssignSub${d}`);
            if (btn) btn.addEventListener('click', () => assignSubDays(parseInt(d)));
        });
        if ($('#btnSendDm')) $('#btnSendDm').addEventListener('click', handleSendDm);
        if ($('#btnToggleBlock')) $('#btnToggleBlock').addEventListener('click', handleToggleBlock);
    }

    // ===== MONITORING =====
    let monData = [];
    let monFilter = 'all';
    let onlineTimer = null;
    let ipHistoryData = {};

    async function loadMonitoring() {
        try {
            const [mon, hist] = await Promise.all([
                api('GET', '/api/monitoring'),
                api('GET', '/api/ip-history').catch(() => ({ history: {} }))
            ]);
            monData = mon;
            ipHistoryData = hist.history || {};
            renderMonitoring(monFilter);
        } catch (e) { if (e.message !== 'Unauthorized') showToast('Ошибка мониторинга: ' + e.message, 'error'); }
        loadOnline();
        // Start auto-refresh for online
        stopOnlineTimer();
        onlineTimer = setInterval(loadOnline, 10000);
    }

    function stopOnlineTimer() {
        if (onlineTimer) { clearInterval(onlineTimer); onlineTimer = null; }
    }

    async function loadOnline() {
        try {
            const data = await api('GET', '/api/online');
            renderOnline(data);
        } catch (e) {
            if (e.message === 'Unauthorized') stopOnlineTimer();
        }
    }

    function renderOnline(data) {
        const list = $('#onlineList');
        const count = $('#onlineCount');

        if (!data || !data.connections || data.connections.length === 0) {
            count.textContent = '0';
            if (data && data.mode === 'no-relay') {
                list.innerHTML = '<div class="mon-no-data">Relay не настроен — онлайн-мониторинг недоступен</div>';
            } else {
                list.innerHTML = '<div class="mon-no-data">Нет активных подключений</div>';
            }
            return;
        }

        count.textContent = data.uniqueIps;

        // Active subs summary at top
        let activeSummary = '';
        if (data.activeSubs && data.activeSubs.length > 0) {
            const subsHtml = data.activeSubs.map(s => {
                const kb = (s.traffic / 1024).toFixed(0);
                const display = s.traffic > 1048576 ? (s.traffic / 1048576).toFixed(1) + ' MB' : kb + ' KB';
                return `<span class="active-sub-tag">${escapeHtml(s.name)} <small>${display}</small></span>`;
            }).join('');
            activeSummary = `<div class="active-subs-bar">📊 Активные подписки (Xray Stats): ${subsHtml}</div>`;
        }

        list.innerHTML = activeSummary + data.connections.map(c => {
            let deviceIcon = '🌐';
            if (c.ua) {
                const ual = c.ua.toLowerCase();
                if (ual.includes('android')) deviceIcon = '📱';
                else if (ual.includes('windows')) deviceIcon = '💻';
                else if (ual.includes('ios') || ual.includes('iphone')) deviceIcon = '📱';
                else if (ual.includes('mac')) deviceIcon = '💻';
            }

            let identity = 'Неизвестный';
            let badge = '';
            if (c.subName && c.matchedBy === 'access-log' && !c.deviceName) {
                identity = escapeHtml(c.subName);
                badge = '<span class="online-badge-stats">🔑 чужой ключ</span>';
            } else if (c.subName) {
                identity = `${escapeHtml(c.subName)} · ${escapeHtml(c.deviceName || '')}`;
            }

            const geoHtml = c.geo
                ? `<div class="online-item-geo">📍 ${escapeHtml(c.geo.city || '')}, ${escapeHtml(c.geo.country || '')} · ${escapeHtml(c.geo.isp || '')}</div>`
                : '';

            const serversHtml = c.servers.map(s =>
                `<div class="online-server">
                    <span class="online-server-dot"></span>
                    <span class="online-server-name">${escapeHtml(s.name)}</span>
                    <span class="online-server-port">:${s.port}</span>
                </div>`
            ).join('');

            return `<div class="online-item${!c.subName ? ' unknown' : ''}${c.matchedBy === 'access-log' && !c.deviceName ? ' matched-stats' : ''}">
                <div class="online-item-header">
                    <span class="online-item-icon">${deviceIcon}</span>
                    <div class="online-item-info">
                        <div class="online-item-identity">${identity} ${badge}</div>
                        <div class="online-item-ip">${escapeHtml(c.ip)}</div>
                        ${geoHtml}
                    </div>
                    <span class="online-item-count">${c.servers.length} серв.</span>
                </div>
                <div class="online-servers">${serversHtml}</div>
            </div>`;
        }).join('');
    }

    // IP History
    window._loadIpHistory = async function () {
        const list = $('#ipHistoryList');
        list.innerHTML = '<div class="mon-no-data">Загрузка...</div>';
        try {
            const data = await api('GET', '/api/ip-history');
            if (!data.history || Object.keys(data.history).length === 0) {
                list.innerHTML = '<div class="mon-no-data">Нет данных. Лог Xray пуст.</div>';
                return;
            }
            let html = '';
            for (const [email, ips] of Object.entries(data.history)) {
                const ipList = Object.entries(ips).sort((a, b) => b[1].count - a[1].count);
                html += `<div class="ip-history-sub">
                    <div class="ip-history-sub-header">${escapeHtml(email)} <span class="ip-history-count">${ipList.length} IP</span></div>
                    <div class="ip-history-table">
                        ${ipList.map(([ip, info]) => {
                    const geo = info.geo ? `${info.geo.city || ''}, ${info.geo.country || ''} · ${info.geo.isp || ''}` : '';
                    return `<div class="ip-history-row">
                                <div class="ip-history-ip">${escapeHtml(ip)}</div>
                                <div class="ip-history-geo">${geo ? '📍 ' + escapeHtml(geo) : ''}</div>
                                <div class="ip-history-times">
                                    <span>🕐 ${escapeHtml(info.firstSeen)}</span>
                                    <span>→ ${escapeHtml(info.lastSeen)}</span>
                                    <span class="ip-history-hits">${info.count} подкл.</span>
                                </div>
                            </div>`;
                }).join('')}
                    </div>
                </div>`;
            }
            list.innerHTML = html;
        } catch (e) {
            list.innerHTML = `<div class="mon-no-data">Ошибка: ${escapeHtml(e.message)}</div>`;
        }
    };

    function renderMonitoring(filter = 'all') {
        monFilter = filter;
        const list = $('#monList'), empty = $('#emptyMon');
        let items = monData;

        if (filter === 'high') items = items.filter(s => s.level === 'high');
        else if (filter === 'medium') items = items.filter(s => s.level === 'medium' || s.level === 'high');
        else if (filter === 'multi') items = items.filter(s => s.deviceCount >= 2);

        if (items.length === 0) {
            list.innerHTML = '';
            empty.style.display = 'flex';
            return;
        }
        empty.style.display = 'none';

        list.innerHTML = items.map((s, i) => {
            const levelIcon = s.level === 'high' ? '🔴' : s.level === 'medium' ? '🟡' : '🟢';
            const levelText = s.level === 'high' ? 'Подозрительно' : s.level === 'medium' ? 'Внимание' : 'Норма';
            const levelClass = `mon-level-${s.level}`;

            const devicesHtml = s.devices.map(d => {
                const lastSeen = d.lastSeen ? new Date(d.lastSeen).toLocaleString('ru-RU') : '—';
                const firstSeen = d.firstSeen ? new Date(d.firstSeen).toLocaleString('ru-RU') : '—';
                const hwShort = d.hwid.length > 20 ? d.hwid.substring(0, 20) + '...' : d.hwid;
                // Parse UA for device info
                let deviceInfo = d.ua;
                const uaLower = d.ua.toLowerCase();
                if (uaLower.includes('android')) {
                    const model = d.ua.match(/;\s*([^;)]+)\s*Build/);
                    deviceInfo = '📱 Android' + (model ? ' · ' + model[1].trim() : '');
                } else if (uaLower.includes('windows')) {
                    deviceInfo = '💻 Windows';
                } else if (uaLower.includes('ios') || uaLower.includes('iphone')) {
                    deviceInfo = '📱 iOS';
                } else if (uaLower.includes('mac')) {
                    deviceInfo = '💻 macOS';
                }

                return `<div class="mon-device">
                    <div class="mon-device-header">
                        <span class="mon-device-name">${escapeHtml(d.name)}</span>
                        <span class="mon-device-platform">${escapeHtml(deviceInfo)}</span>
                    </div>
                    <div class="mon-device-details">
                        <div class="mon-detail-row"><span class="mon-label">IP:</span><span class="mon-value mon-ip">${escapeHtml(d.ip)}</span></div>
                        <div class="mon-detail-row"><span class="mon-label">HWID:</span><span class="mon-value">${escapeHtml(hwShort)}</span></div>
                        <div class="mon-detail-row"><span class="mon-label">Первый вход:</span><span class="mon-value">${firstSeen}</span></div>
                        <div class="mon-detail-row"><span class="mon-label">Последний:</span><span class="mon-value">${lastSeen}</span></div>
                    </div>
                </div>`;
            }).join('');

            const ipsHtml = s.allTimeIps.length > 0
                ? s.allTimeIps.map(ip => `<span class="mon-ip-tag">${escapeHtml(ip)}</span>`).join('')
                : '<span class="mon-no-data">—</span>';

            // IP History from Xray access log for this sub
            const subHistory = ipHistoryData[s.name] || {};
            const deviceIps = new Set(s.devices.map(d => d.ip.replace(/^::ffff:/, '')));
            const suspiciousIps = Object.entries(subHistory).filter(([ip]) => !deviceIps.has(ip));
            const knownLogIps = Object.entries(subHistory).filter(([ip]) => deviceIps.has(ip));

            let historyHtml = '';
            if (suspiciousIps.length > 0) {
                historyHtml += suspiciousIps.map(([ip, info]) => {
                    const geo = info.geo ? `📍 ${info.geo.city || ''}, ${info.geo.country || ''} · ${info.geo.isp || ''}` : '';
                    return `<div class="ip-history-row suspicious">
                        <div class="ip-history-row-top">
                            <div>
                                <div class="ip-history-ip">⚠️ ${escapeHtml(ip)}</div>
                                ${geo ? `<div class="ip-history-geo">${escapeHtml(geo)}</div>` : ''}
                            </div>
                            <button class="btn-block-ip" data-ip="${escapeHtml(ip)}" title="Заблокировать">🚫</button>
                        </div>
                        <div class="ip-history-times">
                            <span>🕐 ${escapeHtml(info.firstSeen || '')}</span>
                            <span>→ ${escapeHtml(info.lastSeen || '')}</span>
                            <span class="ip-history-hits">${info.count} подкл.</span>
                        </div>
                    </div>`;
                }).join('');
            }
            if (knownLogIps.length > 0) {
                historyHtml += knownLogIps.map(([ip, info]) => {
                    const geo = info.geo ? `📍 ${info.geo.city || ''}, ${info.geo.country || ''} · ${info.geo.isp || ''}` : '';
                    return `<div class="ip-history-row">
                        <div class="ip-history-ip">✅ ${escapeHtml(ip)}</div>
                        ${geo ? `<div class="ip-history-geo">${escapeHtml(geo)}</div>` : ''}
                        <div class="ip-history-times">
                            <span>🕐 ${escapeHtml(info.firstSeen || '')}</span>
                            <span>→ ${escapeHtml(info.lastSeen || '')}</span>
                            <span class="ip-history-hits">${info.count} подкл.</span>
                        </div>
                    </div>`;
                }).join('');
            }
            const totalLogIps = Object.keys(subHistory).length;
            const suspCount = suspiciousIps.length;

            // Format traffic
            function fmtBytes(b) {
                if (b < 1024) return b + ' B';
                if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
                if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
                return (b / 1073741824).toFixed(2) + ' GB';
            }
            const tr = s.traffic || { up: 0, down: 0, total: 0 };

            return `<div class="mon-card ${levelClass}" style="animation-delay:${i * 0.04}s">
                <div class="mon-card-header">
                    <div class="mon-card-left">
                        <span class="mon-level-badge ${levelClass}">${levelIcon} ${levelText}</span>
                        <div class="mon-card-name">${escapeHtml(s.name)}</div>
                        ${s.notes ? `<div class="mon-card-notes">${escapeHtml(s.notes.substring(0, 60))}</div>` : ''}
                    </div>
                    <div class="mon-card-right">
                        <div class="mon-stat"><span class="mon-stat-val">${s.deviceCount}</span><span class="mon-stat-lbl">устр.</span></div>
                        <div class="mon-stat"><span class="mon-stat-val">${s.uniqueIps.length}</span><span class="mon-stat-lbl">IP</span></div>
                        <div class="mon-stat"><span class="mon-stat-val">${s.connectionsToday}</span><span class="mon-stat-lbl">за 24ч</span></div>
                    </div>
                </div>
                ${tr.total > 0 ? `<div class="mon-traffic-bar">
                    <span class="mon-traffic-item">📊 <strong>${fmtBytes(tr.total)}</strong></span>
                    <span class="mon-traffic-item">↑ ${fmtBytes(tr.up)}</span>
                    <span class="mon-traffic-item">↓ ${fmtBytes(tr.down)}</span>
                </div>` : ''}
                ${s.reasons.length > 0 ? `<div class="mon-reasons">${s.reasons.map(r => `<span class="mon-reason-tag">${escapeHtml(r)}</span>`).join('')}</div>` : ''}
                <div class="mon-section">
                    <div class="mon-section-title" data-mon-toggle="${s.id}-devs">📱 Устройства (${s.deviceCount}) <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div>
                    <div class="mon-section-body collapsed" id="mon-devs-${s.id}">${devicesHtml || '<div class="mon-no-data">Нет устройств</div>'}</div>
                </div>
                <div class="mon-section">
                    <div class="mon-section-title" data-mon-toggle="${s.id}-ips">🌐 Все IP-адреса (${s.allTimeIps.length}) <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div>
                    <div class="mon-section-body collapsed" id="mon-ips-${s.id}"><div class="mon-ip-list">${ipsHtml}</div></div>
                </div>
                <div class="mon-section">
                    <div class="mon-section-title" data-mon-toggle="${s.id}-hist">📜 История IP из Xray (${totalLogIps})${suspCount > 0 ? ` <span class="ip-susp-badge">⚠️ ${suspCount} подозрит.</span>` : ''} <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div>
                    <div class="mon-section-body collapsed" id="mon-hist-${s.id}">${historyHtml || '<div class="mon-no-data">Нет данных из логов</div>'}</div>
                </div>
            </div>`;
        }).join('');

        // Toggle sections
        list.querySelectorAll('[data-mon-toggle]').forEach(el => {
            el.addEventListener('click', () => {
                const key = el.dataset.monToggle;
                const type = key.includes('dev') ? 'devs' : key.includes('hist') ? 'hist' : 'ips';
                const body = document.getElementById(`mon-${type}-${key.split('-')[0]}`);
                if (body) body.classList.toggle('collapsed');
                el.classList.toggle('expanded');
            });
        });

        // Block IP buttons
        list.querySelectorAll('.btn-block-ip').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const ip = btn.dataset.ip;
                if (!confirm(`Заблокировать IP ${ip}? Xray перезапустится.`)) return;
                try {
                    await api('POST', '/api/block-ip', { ip });
                    showToast(`🚫 IP ${ip} заблокирован`, 'success');
                    loadMonitoring();
                } catch (err) {
                    showToast('Ошибка: ' + err.message, 'error');
                }
            });
        });
    }

    // ===== DASHBOARD =====
    async function loadDashboard() {
        try {
            const [d, serverStats, onlineData] = await Promise.all([
                api('GET', '/api/dashboard'),
                api('GET', '/api/server-stats').catch(() => null),
                api('GET', '/api/online').catch(() => null)
            ]);

            // Server monitoring
            if (serverStats) {
                const fmtBytes = (b) => b > 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : (b / 1048576).toFixed(0) + ' MB';
                const barCls = (pct) => pct > 90 ? 'danger' : pct > 70 ? 'warn' : '';

                $('#monCpu').textContent = serverStats.cpu.usage + '%';
                $('#monCpuBar').style.width = serverStats.cpu.usage + '%';
                $('#monCpuBar').className = 'monitor-fill ' + barCls(serverStats.cpu.usage);

                $('#monRam').textContent = serverStats.ram.percent + '%';
                $('#monRamBar').style.width = serverStats.ram.percent + '%';
                $('#monRamBar').className = 'monitor-fill ' + barCls(serverStats.ram.percent);

                $('#monDisk').textContent = serverStats.disk.percent + '%';
                $('#monDiskBar').style.width = serverStats.disk.percent + '%';
                $('#monDiskBar').className = 'monitor-fill ' + barCls(serverStats.disk.percent);

                const xrayEl = $('#monXray');
                if (serverStats.xray === 'running') {
                    xrayEl.textContent = '✅';
                    xrayEl.style.cssText = '-webkit-text-fill-color: unset';
                } else {
                    xrayEl.textContent = '❌';
                    xrayEl.style.cssText = '-webkit-text-fill-color: unset';
                }
                const upH = Math.floor(serverStats.uptime / 3600);
                const upD = Math.floor(upH / 24);
                $('#monUptime').textContent = upD > 0 ? `${upD}д ${upH % 24}ч` : `${upH}ч`;
            }

            if (onlineData) {
                const onEl = $('#monOnline');
                onEl.textContent = onlineData.count;
                onEl.style.cssText = '-webkit-text-fill-color: unset; color: var(--success)';
                $('#monOnlineSub').textContent = onlineData.count === 1 ? 'юзер' : 'юзеров';
            }

            // Stats grid
            $('#dashStats').innerHTML = `
                <div class="dash-stat-card"><div class="dash-stat-val">${d.todayConns}</div><div class="dash-stat-lbl">Сегодня</div></div>
                <div class="dash-stat-card"><div class="dash-stat-val">${d.yesterdayConns}</div><div class="dash-stat-lbl">Вчера</div></div>
                <div class="dash-stat-card"><div class="dash-stat-val">${d.newDevicesToday}</div><div class="dash-stat-lbl">Новых устр.</div></div>
                <div class="dash-stat-card"><div class="dash-stat-val">${d.activeSubs}/${d.totalSubs}</div><div class="dash-stat-lbl">Подписок</div></div>
                <div class="dash-stat-card"><div class="dash-stat-val">${d.totalDevices}</div><div class="dash-stat-lbl">Устройств</div></div>
                <div class="dash-stat-card"><div class="dash-stat-val">${d.totalServers}</div><div class="dash-stat-lbl">Серверов</div></div>
            `;
            // Bar chart
            const max = Math.max(1, ...d.chart.map(c => c.count));
            $('#dashChart').innerHTML = d.chart.map(c => {
                const pct = Math.round((c.count / max) * 100);
                return `<div class="chart-col"><div class="chart-bar-wrap"><div class="chart-bar" style="height:${pct}%"><span class="chart-val">${c.count}</span></div></div><div class="chart-label">${c.label}</div></div>`;
            }).join('');

            // Recent events
            const r = await api('GET', '/api/logs?limit=5');
            if (r.logs.length === 0) { $('#dashRecent').innerHTML = '<div class="empty-hint">Нет событий</div>'; }
            else { $('#dashRecent').innerHTML = r.logs.map(l => renderLogItem(l)).join(''); }
        } catch { }
    }

    // Auto-refresh monitoring every 30s
    setInterval(() => {
        if (document.querySelector('#tab-dashboard.active')) loadDashboard();
    }, 30000);

    // ===== USERS MANAGEMENT =====
    function renderUsers(filter = '') {
        const list = $('#usersList'), empty = $('#emptyUsers'), statsBar = $('#usersStatsBar');
        if (!list || !empty) return;
        const search = (filter || '').toLowerCase().trim();

        const allUsers = collectAllUsers();
        const filtered = allUsers.filter(u => !search ||
            String(u.userId).includes(search) ||
            (u.firstName || '').toLowerCase().includes(search) ||
            (u.username || '').toLowerCase().includes(search)
        );

        const cur = settings.currency || '₽';
        const totalBalance = allUsers.reduce((s, u) => s + (u.balance || 0), 0);
        const blockedCount = allUsers.filter(u => u.blocked).length;
        const activeCount = allUsers.filter(u => u.activeSubs > 0).length;
        if (statsBar) {
            statsBar.innerHTML = `<div class="usr-stats-grid">
                <div class="usr-stat-card"><div class="usr-stat-num">${allUsers.length}</div><div class="usr-stat-lbl">Всего</div></div>
                <div class="usr-stat-card accent"><div class="usr-stat-num">${activeCount}</div><div class="usr-stat-lbl">Активных</div></div>
                <div class="usr-stat-card"><div class="usr-stat-num">${totalBalance}</div><div class="usr-stat-lbl">${escapeHtml(cur)} баланс</div></div>
                ${blockedCount > 0 ? `<div class="usr-stat-card danger"><div class="usr-stat-num">${blockedCount}</div><div class="usr-stat-lbl">Забл.</div></div>` : ''}
            </div>`;
        }

        if (filtered.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
        empty.style.display = 'none';

        list.innerHTML = filtered.map((u, i) => {
            const name = u.firstName || u.username || `User`;
            const initials = name.slice(0, 2).toUpperCase();
            const bal = u.balance || 0;
            const hue = (u.userId * 37) % 360;
            const avatarBg = u.blocked ? 'rgba(239,68,68,0.2)' : `hsl(${hue}, 60%, 25%)`;
            const avatarColor = u.blocked ? '#ef4444' : `hsl(${hue}, 70%, 70%)`;
            const statusDot = u.blocked ? '<span class="usr-dot blocked"></span>' : u.activeSubs > 0 ? '<span class="usr-dot active"></span>' : '<span class="usr-dot idle"></span>';
            const subBadge = u.activeSubs > 0 ? `<span class="usr-badge active">${u.activeSubs} VPN</span>` : u.subsCount > 0 ? `<span class="usr-badge expired">${u.subsCount} ист.</span>` : '';
            const balBadge = bal > 0 ? `<span class="usr-badge bal">${bal} ${escapeHtml(cur)}</span>` : '';

            return `<div class="usr-card" data-view-user="${u.userId}" style="animation-delay:${i * 0.025}s">
                <div class="usr-avatar" style="background:${avatarBg};color:${avatarColor}">${initials}${statusDot}</div>
                <div class="usr-info">
                    <div class="usr-name">${escapeHtml(name)}${u.username ? ` <span class="usr-handle">@${escapeHtml(u.username)}</span>` : ''}</div>
                    <div class="usr-id">${u.userId}</div>
                </div>
                <div class="usr-badges">${subBadge}${balBadge}</div>
                <svg class="usr-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>`;
        }).join('');

        list.querySelectorAll('[data-view-user]').forEach(b => b.addEventListener('click', () => openUserProfile(parseInt(b.dataset.viewUser))));
    }

    function collectAllUsers() {
        const usersMap = {};
        (shopUsers || []).forEach(u => {
            usersMap[u.userId] = { userId: u.userId, balance: u.balance || 0, blocked: !!u.blocked, referralCode: u.referralCode || '', referralCount: u.referralCount || 0, createdAt: u.createdAt || 0, firstName: '', username: '', subsCount: 0, activeSubs: 0 };
        });
        (subs || []).forEach(sub => {
            (sub.telegramUsers || []).forEach(uid => {
                if (!usersMap[uid]) usersMap[uid] = { userId: uid, balance: 0, blocked: false, firstName: '', username: '', subsCount: 0, activeSubs: 0, createdAt: 0 };
                usersMap[uid].subsCount++;
                if (sub.enabled !== false && (!sub.expiresAt || Date.now() < sub.expiresAt)) usersMap[uid].activeSubs++;
            });
        });
        return Object.values(usersMap).sort((a, b) => {
            if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
            return (b.createdAt || 0) - (a.createdAt || 0);
        });
    }

    function openUserProfile(userId) {
        currentUserId = userId;
        const u = (shopUsers || []).find(x => x.userId === userId) || { userId, balance: 0, blocked: false };
        const cur = settings.currency || '₽';

        $('#userProfileTitle').textContent = `Профиль — ${userId}`;

        // Badges
        const badges = [];
        if (u.blocked) badges.push('<span class="badge badge-danger">🔴 Заблокирован</span>');
        else badges.push('<span class="badge badge-ok">🟢 Активен</span>');
        badges.push(`<span class="badge">💰 ${u.balance || 0} ${escapeHtml(cur)}</span>`);
        if (u.referralCode) badges.push(`<span class="badge">🔗 ${u.referralCode}</span>`);
        $('#userBadges').innerHTML = badges.join('');

        // Info row
        const createdAt = u.createdAt ? new Date(u.createdAt).toLocaleDateString('ru-RU') : '—';
        const userSubs = (subs || []).filter(s => s.telegramUsers && s.telegramUsers.includes(userId));
        const activeSubs = userSubs.filter(s => s.enabled !== false && (!s.expiresAt || Date.now() < s.expiresAt));
        $('#userInfoRow').innerHTML = `
            <div class="sub-stat"><span class="sub-stat-label">🆔 ID</span><span class="sub-stat-value">${userId}</span></div>
            <div class="sub-stat"><span class="sub-stat-label">📋 Подписок</span><span class="sub-stat-value">${userSubs.length} (акт: ${activeSubs.length})</span></div>
            <div class="sub-stat"><span class="sub-stat-label">📅 Регистрация</span><span class="sub-stat-value">${createdAt}</span></div>
            <div class="sub-stat"><span class="sub-stat-label">👥 Рефералы</span><span class="sub-stat-value">${u.referralCount || 0}</span></div>
        `;

        // Balance input
        $('#userBalanceInput').value = u.balance || 0;

        // User subs
        if (userSubs.length === 0) {
            $('#userSubsList').innerHTML = '<div class="empty-hint">Нет подписок</div>';
        } else {
            $('#userSubsList').innerHTML = userSubs.map(sub => {
                const isExpired = sub.expiresAt && Date.now() > sub.expiresAt;
                const isDisabled = sub.enabled === false;
                const icon = isDisabled ? '🔴' : isExpired ? '🟡' : '🟢';
                const exp = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ru-RU') : '∞';
                return `<div class="device-item"><div class="device-info"><div class="device-name">${icon} ${escapeHtml(sub.name)}</div><div class="device-meta"><span>До: ${exp}</span><span>📱 ${(sub.devices || []).length}</span></div></div></div>`;
            }).join('');
        }

        // Orders (from the orders API, filter by userId... we'll use a simpler approach)
        loadUserOrders(userId);

        // Balance history
        const history = (u.balanceHistory || []).slice(-10).reverse();
        if (history.length === 0) {
            $('#userBalanceHistory').innerHTML = '<div class="empty-hint">Нет истории</div>';
        } else {
            $('#userBalanceHistory').innerHTML = history.map(h => {
                const date = new Date(h.date).toLocaleDateString('ru-RU');
                const sign = h.amount > 0 ? '+' : '';
                const color = h.amount > 0 ? 'var(--success)' : 'var(--danger)';
                return `<div class="device-item"><div class="device-info"><div class="device-name" style="color:${color}">${sign}${h.amount} ${escapeHtml(cur)}</div><div class="device-meta"><span>${escapeHtml(h.description || '—')}</span><span>${date}</span></div></div></div>`;
            }).join('');
        }

        // Block button
        $('#btnToggleBlock').textContent = u.blocked ? '🟢 Разблокировать' : '🔴 Заблокировать';
        $('#btnToggleBlock').className = u.blocked ? 'btn-primary btn-full' : 'btn-outline btn-full btn-danger';

        // Sub days input
        $('#userSubDays').value = '';
        $('#userDmInput').value = '';

        openModal('modalUserProfile');
    }

    async function loadUserOrders(userId) {
        try {
            const orders = await api('GET', '/api/orders');
            const userOrders = orders.filter(o => o.userId === userId).slice(0, 10);
            if (userOrders.length === 0) {
                $('#userOrdersList').innerHTML = '<div class="empty-hint">Нет заказов</div>';
                return;
            }
            const cur = settings.currency || '₽';
            const statusMap = { awaiting_payment: '💳', pending_review: '⏳', completed: '✅', rejected: '❌', canceled: '🚫', cancelled: '🚫', failed: '⚠️' };
            $('#userOrdersList').innerHTML = userOrders.map(o => {
                const icon = statusMap[o.status] || '❓';
                const date = new Date(o.createdAt).toLocaleDateString('ru-RU');
                return `<div class="device-item"><div class="device-info"><div class="device-name">${icon} ${escapeHtml(o.planName || '?')} — ${o.price || 0} ${escapeHtml(cur)}</div><div class="device-meta"><span>${o.status}</span><span>${date}</span></div></div></div>`;
            }).join('');
        } catch { $('#userOrdersList').innerHTML = '<div class="empty-hint">Ошибка</div>'; }
    }

    async function assignSubDays(days) {
        if (!currentUserId || !days || days <= 0) { showToast('Введите кол-во дней', 'error'); return; }
        try {
            await api('POST', `/api/shop-users/${currentUserId}/assign-sub`, { days });
            showToast(`Подписка +${days} дней`, 'success');
            await loadAll();
            openUserProfile(currentUserId);
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function handleSendDm() {
        if (!currentUserId) return;
        const msg = $('#userDmInput').value.trim();
        if (!msg) { showToast('Введите сообщение', 'error'); return; }
        try {
            await api('POST', `/api/shop-users/${currentUserId}/send-message`, { message: msg });
            showToast('✉️ Отправлено', 'success');
            $('#userDmInput').value = '';
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function handleToggleBlock() {
        if (!currentUserId) return;
        const u = (shopUsers || []).find(x => x.userId === currentUserId) || {};
        const newBlocked = !u.blocked;
        const confirm = await showConfirm(
            newBlocked ? '🔴 Заблокировать?' : '🟢 Разблокировать?',
            newBlocked ? 'Подписки пользователя будут отключены.' : 'Пользователь сможет пользоваться сервисом.',
            newBlocked ? 'Заблокировать' : 'Разблокировать'
        );
        if (!confirm) return;
        try {
            await api('PUT', `/api/shop-users/${currentUserId}`, { blocked: newBlocked });
            showToast(newBlocked ? '🔴 Заблокирован' : '🟢 Разблокирован', 'success');
            await loadAll();
            openUserProfile(currentUserId);
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function handleBroadcast() {
        const msg = $('#broadcastText').value.trim();
        if (!msg) { showToast('Введите текст', 'error'); return; }
        const target = $('#broadcastTarget') ? $('#broadcastTarget').value : 'all';
        const parseMode = $('#broadcastParseMode') ? $('#broadcastParseMode').value : '';
        $('#btnSendBroadcast').disabled = true;
        $('#broadcastStatus').textContent = '✨ Отправка...';
        try {
            const r = await api('POST', '/api/broadcast', { message: msg, target, parseMode });
            $('#broadcastStatus').textContent = `✅ Готово! Доставлено: ${r.sent} | Ошибок: ${r.failed} | Всего: ${r.total}`;
            showToast(`📢 Доставлено: ${r.sent}/${r.total}`, 'success');
        } catch (e) {
            $('#broadcastStatus').textContent = '❌ Ошибка: ' + e.message;
            showToast(e.message, 'error');
        }
        $('#btnSendBroadcast').disabled = false;
    }

    // ===== LOGS =====
    let logsPage = 0, allLogsShown = false;
    async function loadLogs(reset = false) {
        if (reset) { logsPage = 0; allLogsShown = false; $('#logsList').innerHTML = ''; }
        try {
            const r = await api('GET', `/api/logs?page=${logsPage}&limit=30`);
            if (r.logs.length === 0 && logsPage === 0) {
                $('#logsList').innerHTML = '<div class="empty-hint">Нет записей</div>';
                $('#btnLoadMoreLogs').style.display = 'none';
                return;
            }
            r.logs.forEach(l => {
                const el = document.createElement('div');
                el.innerHTML = renderLogItem(l);
                $('#logsList').appendChild(el.firstElementChild);
            });
            logsPage++;
            const shown = logsPage * 30;
            $('#btnLoadMoreLogs').style.display = shown < r.total ? '' : 'none';
        } catch { }
    }

    function renderLogItem(l) {
        const date = new Date(l.ts).toLocaleString('ru-RU');
        const icon = l.type === 'new_device' ? '🟢' : '🔵';
        const typeText = l.type === 'new_device' ? 'Новое устройство' : 'Подключение';
        return `<div class="log-item ${l.type}">
            <span class="log-icon">${icon}</span>
            <div class="log-info">
                <div class="log-title">${escapeHtml(l.subName || '—')} — ${typeText}</div>
                <div class="log-meta">${date} · IP: ${escapeHtml(l.ip || '—')} · HWID: ${escapeHtml(l.hwid || '—')}</div>
            </div>
        </div>`;
    }

    // ===== MTPROXY MANAGER =====
    function getMtpLink(mtp) {
        return `tg://proxy?server=${mtp.host}&port=${mtp.port}&secret=${mtp.secret}`;
    }

    function renderMtproxies() {
        const list = $('#mtproxyList'), empty = $('#emptyMtproxy');
        if (!list || !empty) return;

        // Update stats
        const total = mtproxies.length;
        const active = mtproxies.filter(m => m.enabled !== false).length;
        const withVless = mtproxies.filter(m => m.vlessUri).length;
        if ($('#mtpStatTotal')) $('#mtpStatTotal').textContent = total;
        if ($('#mtpStatActive')) $('#mtpStatActive').textContent = active;
        if ($('#mtpStatVless')) $('#mtpStatVless').textContent = withVless;

        // Update setup command
        const serverUrl = settings.serverUrl || window.location.origin;
        if ($('#mtproxySetupCmd')) {
            $('#mtproxySetupCmd').textContent = mtproxies.length > 0
                ? `bash <(curl -sL ${serverUrl}/api/mtproxy/${mtproxies[0].id}/setup-script)`
                : 'Сначала создайте прокси';
        }

        if (total === 0) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
        empty.style.display = 'none';

        list.innerHTML = mtproxies.map((mtp, i) => {
            const statusClass = mtp.enabled === false ? 'disabled' : '';
            const link = getMtpLink(mtp);
            const vlessName = mtp.vlessUri ? parseVlessName(mtp.vlessUri) : 'не задан';

            return `<div class="mtp-card ${statusClass}" style="animation-delay:${i * 0.04}s">
                <div class="mtp-card-top">
                    <div class="mtp-status-dot ${statusClass}"></div>
                    <div class="mtp-card-name">${escapeHtml(mtp.name)}</div>
                    <div class="sub-card-actions">
                        <button class="btn-icon" data-toggle-mtp="${mtp.id}" title="${mtp.enabled === false ? 'Вкл' : 'Выкл'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/></svg></button>
                        <button class="btn-icon" data-edit-mtp="${mtp.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button class="btn-icon" data-del-mtp="${mtp.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
                    </div>
                </div>
                <div class="mtp-card-meta">
                    <span>🌐 ${escapeHtml(mtp.host)}:${mtp.port}</span>
                    <span>🔀 VLESS: ${escapeHtml(vlessName)}</span>
                    ${mtp.adTag ? '<span>📢 Спонсор ✓</span>' : '<span style="color:var(--text-tertiary)">📢 Без спонсора</span>'}
                </div>
                <div class="mtp-card-link">${escapeHtml(link)}</div>
                <div class="mtp-card-footer">
                    <button data-view-mtp="${mtp.id}">Открыть</button>
                    <button data-copy-mtp-link="${mtp.id}">📋 Копировать</button>
                    <button class="btn-tg" data-share-mtp="${mtp.id}">📲 Telegram</button>
                </div>
            </div>`;
        }).join('');

        // Bind events
        list.querySelectorAll('[data-view-mtp]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); viewMtproxy(b.dataset.viewMtp); }));
        list.querySelectorAll('[data-copy-mtp-link]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const m = mtproxies.find(x => x.id === b.dataset.copyMtpLink); if (m) { copyToClipboard(getMtpLink(m)); showToast('Ссылка скопирована', 'success'); } }));
        list.querySelectorAll('[data-share-mtp]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const m = mtproxies.find(x => x.id === b.dataset.shareMtp); if (m) { window.open(`https://t.me/proxy?server=${m.host}&port=${m.port}&secret=${m.secret}`, '_blank'); } }));
        list.querySelectorAll('[data-edit-mtp]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); editMtproxy(b.dataset.editMtp); }));
        list.querySelectorAll('[data-del-mtp]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation();
            const m = mtproxies.find(x => x.id === b.dataset.delMtp);
            if (m && await showConfirm('Удалить MTProxy?', `"${escapeHtml(m.name)}"`)) {
                await api('DELETE', `/api/mtproxy/${m.id}`);
                await loadAll();
                showToast('Удалён', 'success');
            }
        }));
        list.querySelectorAll('[data-toggle-mtp]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation();
            const m = mtproxies.find(x => x.id === b.dataset.toggleMtp);
            if (!m) return;
            await api('PUT', `/api/mtproxy/${m.id}`, { enabled: m.enabled === false ? true : false });
            await loadAll();
            showToast(m.enabled === false ? 'Включён' : 'Выключен', 'success');
        }));
    }

    function populateMtpVlessSelect() {
        const sel = $('#mtpVlessSelect');
        if (!sel) return;
        sel.innerHTML = '<option value="">— Выбрать из шаблона —</option>';
        templates.forEach(t => {
            (t.uris || []).forEach((uri, idx) => {
                const name = parseVlessName(uri);
                sel.innerHTML += `<option value="${escapeHtml(uri)}">${escapeHtml(t.name)} — ${escapeHtml(name)}</option>`;
            });
        });
        sel.addEventListener('change', () => {
            if (sel.value) $('#mtpVlessUri').value = sel.value;
        });
    }

    function openCreateMtproxy() {
        $('#mtpName').value = '';
        $('#mtpHost').value = '';
        $('#mtpPort').value = '8880';
        $('#mtpSocksPort').value = '1080';
        $('#mtpSecret').value = '';
        $('#mtpAdTag').value = '';
        $('#mtpVlessUri').value = '';
        $('#mtpEnabled').checked = true;
        $('#mtpEditId').value = '';
        $('#modalMtpTitle').textContent = 'Добавить MTProxy';
        populateMtpVlessSelect();
        openModal('modalAddMtproxy');
    }

    function editMtproxy(id) {
        const mtp = mtproxies.find(m => m.id === id);
        if (!mtp) return;
        $('#mtpName').value = mtp.name || '';
        $('#mtpHost').value = mtp.host || '';
        $('#mtpPort').value = mtp.port || 8880;
        $('#mtpSocksPort').value = mtp.socksPort || 1080;
        $('#mtpSecret').value = mtp.secret || '';
        $('#mtpAdTag').value = mtp.adTag || '';
        $('#mtpVlessUri').value = mtp.vlessUri || '';
        $('#mtpEnabled').checked = mtp.enabled !== false;
        $('#mtpEditId').value = mtp.id;
        $('#modalMtpTitle').textContent = 'Редактировать MTProxy';
        populateMtpVlessSelect();
        openModal('modalAddMtproxy');
    }

    async function handleSaveMtproxy() {
        const name = $('#mtpName').value.trim();
        const host = $('#mtpHost').value.trim();
        if (!name) { showToast('Введите название', 'error'); return; }
        if (!host) { showToast('Введите IP/домен', 'error'); return; }
        const editId = $('#mtpEditId').value;
        const body = {
            name,
            host,
            port: parseInt($('#mtpPort').value) || 8880,
            socksPort: parseInt($('#mtpSocksPort').value) || 1080,
            secret: $('#mtpSecret').value.trim(),
            adTag: $('#mtpAdTag').value.trim(),
            vlessUri: $('#mtpVlessUri').value.trim(),
            enabled: $('#mtpEnabled').checked
        };
        try {
            if (editId) { await api('PUT', `/api/mtproxy/${editId}`, body); showToast('Обновлён', 'success'); }
            else { await api('POST', '/api/mtproxy', body); showToast('Создан', 'success'); }
            closeModal('modalAddMtproxy');
            await loadAll();
        } catch (e) { showToast(e.message, 'error'); }
    }

    function viewMtproxy(id) {
        const mtp = mtproxies.find(m => m.id === id);
        if (!mtp) return;
        const link = getMtpLink(mtp);
        const serverUrl = settings.serverUrl || window.location.origin;
        const setupCmd = `bash <(curl -sL ${serverUrl}/api/mtproxy/${mtp.id}/setup-script)`;

        $('#mtpDetailTitle').textContent = mtp.name;
        $('#mtpLinkText').textContent = link;
        $('#mtpDetailHost').textContent = mtp.host;
        $('#mtpDetailPort').textContent = mtp.port;
        $('#mtpDetailVless').textContent = mtp.vlessUri ? parseVlessName(mtp.vlessUri) : '—';
        $('#mtpDetailAdTag').textContent = mtp.adTag || 'Не задан (получите от @MTProxybot)';
        $('#mtpDetailSetupCmd').textContent = setupCmd;

        // Badges
        const badges = [];
        if (mtp.enabled === false) badges.push('<span class="badge badge-warn">⏸ Выключен</span>');
        else badges.push('<span class="badge badge-ok">🟢 Активен</span>');
        if (mtp.adTag) badges.push('<span class="badge" style="background:rgba(0,136,204,0.15);color:#0088cc;border:1px solid rgba(0,136,204,0.3)">📢 Спонсор</span>');
        if (mtp.vlessUri) badges.push('<span class="badge" style="background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.3)">🔀 VLESS</span>');
        $('#mtpBadges').innerHTML = badges.join('');

        // QR
        generateQR(link, $('#mtpQrCode'));

        // Bind buttons
        $('#btnCopyMtpLink').onclick = () => { copyToClipboard(link); showToast('Ссылка скопирована', 'success'); };
        $('#btnCopyMtpDetailSetup').onclick = () => { copyToClipboard(setupCmd); showToast('Команда скопирована', 'success'); };

        openModal('modalMtpDetail');
    }

    function genHexSecret() {
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // MTProxy event handlers (in init)
    if ($('#btnAddMtproxy')) $('#btnAddMtproxy').addEventListener('click', openCreateMtproxy);
    if ($('#btnSaveMtproxy')) $('#btnSaveMtproxy').addEventListener('click', handleSaveMtproxy);
    if ($('#btnGenMtpSecret')) $('#btnGenMtpSecret').addEventListener('click', () => {
        $('#mtpSecret').value = genHexSecret();
        showToast('Secret сгенерирован', 'success');
    });
    if ($('#btnCopyMtpSetup')) $('#btnCopyMtpSetup').addEventListener('click', () => {
        const text = $('#mtproxySetupCmd').textContent;
        if (text) { copyToClipboard(text); showToast('Скопировано', 'success'); }
    });

    // ===== WhatsApp Proxy =====
    function renderWaProxies() {
        const list = $('#waProxyList');
        const empty = $('#emptyWaProxy');
        if (!list) return;
        if (!waproxies.length) { list.innerHTML = ''; if (empty) empty.style.display = 'flex'; return; }
        if (empty) empty.style.display = 'none';
        const serverUrl = settings.serverUrl || window.location.origin;
        list.innerHTML = waproxies.map((wp, i) => {
            const statusClass = wp.enabled === false ? 'disabled' : '';
            const vlessName = wp.vlessUri ? parseVlessName(wp.vlessUri) : 'не задан';
            const installed = wp.status === 'installed' ? ' ✅' : '';

            return `<div class="mtp-card ${statusClass}" style="animation-delay:${i * 0.04}s">
                <div class="mtp-card-top">
                    <div class="mtp-status-dot ${statusClass}" style="background:#25d366"></div>
                    <div class="mtp-card-name">${escapeHtml(wp.name)}${installed}</div>
                    <div class="sub-card-actions">
                        <button class="btn-icon" data-toggle-wa="${wp.id}" title="${wp.enabled === false ? 'Вкл' : 'Выкл'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/></svg></button>
                        <button class="btn-icon" data-edit-wa="${wp.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button class="btn-icon" data-del-wa="${wp.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
                    </div>
                </div>
                <div class="mtp-card-meta">
                    <span>📱 ${escapeHtml(wp.host)}:${wp.port}</span>
                    <span>🔀 VLESS: ${escapeHtml(vlessName)}</span>
                </div>
                <div class="mtp-card-link" style="color:var(--text-tertiary)">WhatsApp → Настройки → Хранилище → Прокси → ${escapeHtml(wp.host)}</div>
                <div class="mtp-card-footer">
                    <button data-copy-wa-setup="${wp.id}">📋 Команда</button>
                    <button data-copy-wa-addr="${wp.id}" class="btn-tg" style="background:linear-gradient(135deg,#25d366,#128c7e)">📱 Копировать адрес</button>
                </div>
            </div>`;
        }).join('');

        // Bind events
        list.querySelectorAll('[data-toggle-wa]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); toggleWaProxy(b.dataset.toggleWa); }));
        list.querySelectorAll('[data-edit-wa]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); editWaProxy(b.dataset.editWa); }));
        list.querySelectorAll('[data-del-wa]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation();
            const w = waproxies.find(x => x.id === b.dataset.delWa);
            if (w && confirm('Удалить WhatsApp Proxy "' + w.name + '"?')) {
                await api('DELETE', '/api/waproxy/' + w.id);
                await loadAll();
                showToast('Удалён', 'success');
            }
        }));
        list.querySelectorAll('[data-copy-wa-setup]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); copyWaSetup(b.dataset.copyWaSetup); }));
        list.querySelectorAll('[data-copy-wa-addr]').forEach(b => b.addEventListener('click', e => {
            e.stopPropagation();
            const w = waproxies.find(x => x.id === b.dataset.copyWaAddr);
            if (w) { copyToClipboard(w.host); showToast('Адрес скопирован', 'success'); }
        }));
    }

    function openCreateWaProxy() {
        $('#waName').value = '';
        $('#waHost').value = '';
        $('#waPort').value = '443';
        $('#waSocksPort').value = '1090';
        $('#waVlessUri').value = '';
        $('#waEnabled').checked = true;
        populateWaVlessSelect();
        $('#waProxyModalTitle').textContent = 'Добавить WhatsApp Proxy';
        document.getElementById('modalAddWaProxy').dataset.editId = '';
        openModal('modalAddWaProxy');
    }

    function populateWaVlessSelect() {
        const sel = $('#waVlessSelect');
        if (!sel) return;
        sel.innerHTML = '<option value="">— Выбрать из шаблона —</option>';
        templates.forEach(t => {
            (t.uris || []).forEach(uri => {
                const name = parseVlessName(uri);
                sel.innerHTML += `<option value="${escapeHtml(uri)}">${escapeHtml(t.name)} - ${escapeHtml(name)}</option>`;
            });
        });
        sel.onchange = () => { if (sel.value) $('#waVlessUri').value = sel.value; };
    }

    function editWaProxy(id) {
        const wp = waproxies.find(w => w.id === id);
        if (!wp) return;
        $('#waName').value = wp.name || '';
        $('#waHost').value = wp.host || '';
        $('#waPort').value = wp.port || 443;
        $('#waSocksPort').value = wp.socksPort || 1090;
        $('#waVlessUri').value = wp.vlessUri || '';
        $('#waEnabled').checked = wp.enabled !== false;
        populateWaVlessSelect();
        $('#waProxyModalTitle').textContent = 'Редактировать WhatsApp Proxy';
        document.getElementById('modalAddWaProxy').dataset.editId = id;
        openModal('modalAddWaProxy');
    }
    window.editWaProxy = editWaProxy;

    async function handleSaveWaProxy() {
        const name = $('#waName').value.trim();
        const host = $('#waHost').value.trim();
        if (!name || !host) return showToast('Заполните название и IP/домен', 'error');
        const body = {
            name, host,
            port: parseInt($('#waPort').value) || 443,
            socksPort: parseInt($('#waSocksPort').value) || 1090,
            vlessUri: $('#waVlessUri').value.trim(),
            enabled: $('#waEnabled').checked
        };
        const editId = document.getElementById('modalAddWaProxy').dataset.editId;
        try {
            if (editId) await api('PUT', '/api/waproxy/' + editId, body);
            else await api('POST', '/api/waproxy', body);
            document.getElementById('modalAddWaProxy').classList.remove('visible');
            showToast(editId ? 'Обновлено' : 'Создано', 'success');
            await loadAll();
        } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
    }

    async function deleteWaProxy(id) {
        if (!confirm('Удалить WhatsApp Proxy?')) return;
        try { await api('DELETE', '/api/waproxy/' + id); showToast('Удалено', 'success'); await loadAll(); }
        catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
    }
    window.deleteWaProxy = deleteWaProxy;

    async function toggleWaProxy(id) {
        const wp = waproxies.find(w => w.id === id);
        if (!wp) return;
        try { await api('PUT', '/api/waproxy/' + id, { enabled: !wp.enabled }); await loadAll(); }
        catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
    }
    window.toggleWaProxy = toggleWaProxy;

    function copyWaSetup(id) {
        const url = `${location.protocol}//${location.host}/api/waproxy/${id}/setup-script`;
        copyToClipboard(`bash <(curl -sL ${url})`);
        showToast('Команда скопирована', 'success');
    }
    window.copyWaSetup = copyWaSetup;

    // WhatsApp Proxy event handlers
    window._openCreateWaProxy = openCreateWaProxy;
    window._handleSaveWaProxy = handleSaveWaProxy;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    
    }());
