'use strict';

/* ============================================================
   ЛОКАЛЬНЫЙ TWITCH CHAT OVERLAY ДЛЯ OBS + STREAMER.BOT

   Никаких сторонних JS-библиотек.
   Источник событий: ws://127.0.0.1:8080/
   ============================================================ */

const CONFIG = {
    websocketUrl: 'ws://127.0.0.1:8080/',

    /* Через сколько удалять сообщение.
       0 = не удалять по времени. */
    messageLifetimeMs: 60_000,

    /* Страховка, чтобы DOM не разрастался бесконечно. */
    maxMessages: 45,

    reconnectDelayMs: 2_000,

    showBadges: true,
    showReplies: true,

    /* Если true — в правом верхнем углу показывается статус соединения.
       Для стрима обычно оставляем false. */
    debugStatus: false,

    /* Логи в DevTools OBS Browser Source */
    debugConsole: false
};

const chat = document.getElementById('chat');
const statusEl = document.getElementById('status');

let socket = null;
let reconnectTimer = null;

/*
 * Здесь Streamer.bot отдаёт Twitch + BTTV + FFZ + 7TV.
 * Ключ: имя emote, значение: { imageUrl, zeroWidth, type }
 */
const thirdPartyEmotes = new Map();

function log(...args) {
    if (CONFIG.debugConsole) {
        console.log('[LocalChat]', ...args);
    }
}

function setStatus(text, isProblem = false) {
    statusEl.textContent = text;

    if (CONFIG.debugStatus) {
        statusEl.classList.add('visible');
    } else {
        statusEl.classList.remove('visible');
    }
}

function connect() {
    clearTimeout(reconnectTimer);

    setStatus('Streamer.bot: подключение…', false);

    try {
        socket = new WebSocket(CONFIG.websocketUrl);
    } catch (error) {
        console.error('[LocalChat] Не удалось создать WebSocket:', error);
        scheduleReconnect();
        return;
    }

    socket.addEventListener('open', () => {
        log('WebSocket connected');

        setStatus('Streamer.bot: подключено', false);

        subscribe();
        requestEmotes();
    });

    socket.addEventListener('message', event => {
        try {
            handlePacket(JSON.parse(event.data));
        } catch (error) {
            console.error('[LocalChat] Ошибка обработки пакета:', error, event.data);
        }
    });

    socket.addEventListener('close', () => {
        setStatus('Streamer.bot: нет соединения', true);
        scheduleReconnect();
    });

    socket.addEventListener('error', error => {
        console.error('[LocalChat] WebSocket error:', error);
        setStatus('Streamer.bot: ошибка WebSocket', true);
    });
}

function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, CONFIG.reconnectDelayMs);
}

function send(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }

    socket.send(JSON.stringify(payload));
}

function subscribe() {
    send({
        request: 'Subscribe',
        id: 'local-chat-subscribe',
        events: {
            Twitch: [
                'ChatMessage',
                'ChatMessageDeleted',
                'UserTimedOut',
                'UserBanned',

                /* Обновляем кэш без перезапуска OBS, если 7TV/BTTV emote
                   добавили или удалили во время стрима. */
                'SevenTVEmoteAdded',
                'SevenTVEmoteRemoved',
                'BetterTTVEmoteAdded',
                'BetterTTVEmoteRemoved'
            ]
        }
    });
}

function requestEmotes() {
    send({
        request: 'TwitchGetEmotes',
        id: 'local-chat-emotes'
    });
}

function handlePacket(packet) {
    /* Ответ на TwitchGetEmotes */
    if (packet?.id === 'local-chat-emotes' && packet?.status === 'ok') {
        cacheStreamerBotEmotes(packet.emotes);
        log('Emotes loaded:', thirdPartyEmotes.size);
        return;
    }

    const source = packet?.event?.source;
    const type = packet?.event?.type;

    if (source !== 'Twitch' || !type) {
        return;
    }

    switch (type) {
        case 'ChatMessage':
            addChatMessage(packet.data);
            break;

        case 'ChatMessageDeleted':
            removeMessageById(packet.data?.messageId);
            break;

        case 'UserTimedOut':
        case 'UserBanned':
            removeMessagesByUserId(packet.data?.targetUser?.id);
            break;

        case 'SevenTVEmoteAdded':
        case 'BetterTTVEmoteAdded':
            addEmoteToCache(packet.data);
            break;

        case 'SevenTVEmoteRemoved':
        case 'BetterTTVEmoteRemoved':
            removeEmoteFromCache(packet.data);
            break;
    }
}

function cacheStreamerBotEmotes(emotes) {
    thirdPartyEmotes.clear();

    /*
     * userEmotes содержит Twitch-emotes, доступные аккаунту Streamer.bot.
     * Нативные Twitch-emotes конкретного входящего сообщения всё равно
     * рендерятся из data.emotes по точным индексам.
     */
    addEmoteList(emotes?.userEmotes);
    addEmoteList(emotes?.bttvEmotes);
    addEmoteList(emotes?.ffzEmotes);
    addEmoteList(emotes?.sevenTvEmotes);
}

function addEmoteList(list) {
    if (!Array.isArray(list)) {
        return;
    }

    for (const emote of list) {
        addEmoteToCache(emote);
    }
}

function addEmoteToCache(emote) {
    const name = emote?.name ?? emote?.Name;
    const imageUrl = emote?.imageUrl ?? emote?.ImageUrl;

    if (!name || !imageUrl) {
        return;
    }

    thirdPartyEmotes.set(name, {
        imageUrl,
        zeroWidth: Boolean(emote?.zeroWidth),
        type: emote?.type ?? emote?.Type ?? ''
    });
}

function removeEmoteFromCache(emote) {
    const name = emote?.name ?? emote?.Name;

    if (name) {
        thirdPartyEmotes.delete(name);
    }
}

function addChatMessage(data) {
    if (!data?.user || !data?.text) {
        return;
    }

    const line = document.createElement('div');
    line.className = 'chat-line';

    if (data.messageId) {
        line.dataset.messageId = data.messageId;
    }

    if (data.user.id) {
        line.dataset.userId = data.user.id;
    }

    const inner = document.createElement('div');
    inner.className = 'chat-line-inner';

    if (CONFIG.showBadges) {
        appendBadges(inner, data.user.badges);
    }

    if (CONFIG.showReplies && data.isReply && data.reply?.userName) {
        const reply = document.createElement('span');
        reply.className = 'reply';
        reply.textContent = `↪ @${data.reply.userName}`;
        inner.appendChild(reply);
    }

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `${data.user.name || data.user.login || 'user'}:`;
    name.style.color = normalizeUserColor(data.user.color);
    inner.appendChild(name);

    const message = document.createElement('span');
    message.className = 'message';

    renderMessage(message, data.text, data.emotes);

    inner.appendChild(message);
    line.appendChild(inner);
    chat.appendChild(line);

    trimOldMessages();

    if (CONFIG.messageLifetimeMs > 0) {
        window.setTimeout(() => removeLine(line), CONFIG.messageLifetimeMs);
    }
}

function appendBadges(target, badges) {
    if (!Array.isArray(badges) || badges.length === 0) {
        return;
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'badges';

    for (const badge of badges) {
        if (!badge?.imageUrl) {
            continue;
        }

        const img = document.createElement('img');
        img.className = 'badge';
        img.src = badge.imageUrl;
        img.alt = badge.name || '';
        img.title = badge.info || badge.name || '';
        img.referrerPolicy = 'no-referrer';

        wrapper.appendChild(img);
    }

    if (wrapper.childNodes.length > 0) {
        target.appendChild(wrapper);
    }
}

function renderMessage(target, text, nativeEmotes) {
    const emotes = normalizeNativeEmotes(nativeEmotes, text.length);

    /*
     * Twitch-emotes рендерим по StartIndex/EndIndex.
     * В обычных кусках текста заменяем BTTV/FFZ/7TV по имени.
     */
    if (emotes.length === 0) {
        appendTextWithNamedEmotes(target, text);
        return;
    }

    let cursor = 0;

    for (const emote of emotes) {
        if (emote.start > cursor) {
            appendTextWithNamedEmotes(target, text.slice(cursor, emote.start));
        }

        appendEmoteImage(target, {
            imageUrl: emote.imageUrl,
            name: emote.name,
            zeroWidth: false
        });

        cursor = Math.max(cursor, emote.endExclusive);
    }

    if (cursor < text.length) {
        appendTextWithNamedEmotes(target, text.slice(cursor));
    }
}

function normalizeNativeEmotes(nativeEmotes, textLength) {
    if (!Array.isArray(nativeEmotes)) {
        return [];
    }

    return nativeEmotes
        .map(emote => {
            const start = Number(emote?.StartIndex ?? emote?.startIndex);
            const endInclusive = Number(emote?.EndIndex ?? emote?.endIndex);
            const imageUrl = emote?.ImageUrl ?? emote?.imageUrl;
            const name = emote?.Name ?? emote?.name ?? '';

            if (
                !Number.isFinite(start) ||
                !Number.isFinite(endInclusive) ||
                !imageUrl ||
                start < 0 ||
                endInclusive < start ||
                start >= textLength
            ) {
                return null;
            }

            return {
                start,
                endExclusive: Math.min(endInclusive + 1, textLength),
                imageUrl,
                name
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);
}

function appendTextWithNamedEmotes(target, text) {
    /*
     * У BTTV/FFZ/7TV имя emote обычно является отдельным "словом":
     * KEKW, monkaS, OMEGALUL и т.п.
     *
     * Разбиваем по пробелам, сохраняя сами пробелы.
     */
    const chunks = text.split(/(\s+)/);

    for (const chunk of chunks) {
        if (!chunk) {
            continue;
        }

        const emote = thirdPartyEmotes.get(chunk);

        if (emote) {
            appendEmoteImage(target, {
                ...emote,
                name: chunk
            });
        } else {
            target.appendChild(document.createTextNode(chunk));
        }
    }
}

function appendEmoteImage(target, emote) {
    if (!emote?.imageUrl) {
        if (emote?.name) {
            target.appendChild(document.createTextNode(emote.name));
        }
        return;
    }

    const img = document.createElement('img');
    img.className = `emote${emote.zeroWidth ? ' zero-width' : ''}`;
    img.src = emote.imageUrl;
    img.alt = emote.name || '';
    img.title = emote.name || '';
    img.referrerPolicy = 'no-referrer';

    img.addEventListener('error', () => {
        /*
         * Если CDN конкретного emote недоступен, не оставляем
         * сломанную картинку — возвращаем его текстовое имя.
         */
        const fallback = document.createTextNode(img.alt || '');
        img.replaceWith(fallback);
    }, { once: true });

    target.appendChild(img);
}

function normalizeUserColor(color) {
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
        return color;
    }

    return getComputedStyle(document.documentElement)
        .getPropertyValue('--fallback-name-color')
        .trim() || '#b8b8b8';
}

function trimOldMessages() {
    while (chat.children.length > CONFIG.maxMessages) {
        chat.firstElementChild?.remove();
    }
}

function removeMessageById(messageId) {
    if (!messageId) {
        return;
    }

    const line = [...chat.children]
        .find(node => node.dataset.messageId === String(messageId));

    removeLine(line);
}

function removeMessagesByUserId(userId) {
    if (!userId) {
        return;
    }

    for (const line of [...chat.children]) {
        if (line.dataset.userId === String(userId)) {
            removeLine(line);
        }
    }
}

function removeLine(line) {
    if (!line || line.classList.contains('removing')) {
        return;
    }

    line.classList.add('removing');

    window.setTimeout(() => {
        line.remove();
    }, 380);
}

connect();
