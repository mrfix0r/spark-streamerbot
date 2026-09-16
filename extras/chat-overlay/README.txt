LOCAL TWITCH CHAT OVERLAY — OBS + STREAMER.BOT
================================================

ФАЙЛЫ
-----
overlay.html
chat.css
chat.js

БЫСТРЫЙ ЗАПУСК
--------------
1. В Streamer.bot открой:
   Servers/Clients -> WebSocket Server

2. Проверь:
   Auto Start = ON
   Address = 127.0.0.1
   Port = 8080
   Endpoint = /

   Если у тебя включён Enforce Authentication, для первого запуска
   проще отключить Enforce. Сам оверлей ничего не отправляет в Twitch-чат.

3. В OBS:
   Источники -> + -> Браузер

4. В Browser Source:
   Локальный файл = ON
   Файл = overlay.html

   Рекомендуемый размер:
   Width  = 700
   Height = 900

   FPS = 30 достаточно.

5. Отправь сообщение в Twitch-чат.
   Оно должно появиться снизу.

ЧТО УМЕЕТ
---------
- сообщения снизу вверх;
- прозрачный фон;
- Twitch-цвет ника;
- Twitch badges;
- Twitch emotes;
- 7TV;
- BTTV;
- FFZ;
- reply-индикатор;
- плавное появление;
- автоматическое исчезновение через 60 секунд;
- удаление сообщения после модераторского удаления;
- удаление старых сообщений пользователя после timeout/ban;
- reconnect к Streamer.bot после обрыва;
- слегка наклонённая колонка, но сам текст визуально остаётся ровным.

НАСТРОЙКИ
---------
В chat.js в самом верху:

messageLifetimeMs: 60_000
    60 секунд.
    Поставь 0, если сообщения не должны исчезать по таймеру.

maxMessages: 45
    Максимум сообщений одновременно.

debugStatus: false
    Поставь true, чтобы видеть статус WebSocket прямо на оверлее.

В chat.css в :root:

--font-size: 28px;
    Размер текста.

--chat-width: 94%;
    Ширина чата.

--chat-skew: -3deg;
--text-counter-skew: 3deg;
    Наклон колонки и обратная компенсация текста.

--emote-size: 34px;
--badge-size: 22px;
    Размеры emotes и badges.

ВАЖНО ПРО 7TV / BTTV / FFZ
--------------------------
Список emotes оверлей получает у локального Streamer.bot через TwitchGetEmotes.
Сами картинки загружаются по URL соответствующих CDN, которые возвращает
Streamer.bot. То есть сайт-виджет не нужен, но CDN emotes должен быть доступен
на ПК, где работает OBS.

ЕСЛИ НЕ РАБОТАЕТ
----------------
1. В chat.js временно поставь debugStatus: true.
2. Открой overlay.html двойным кликом в Chrome/Edge.
3. Если справа сверху написано "Streamer.bot: нет соединения":
   - проверь, что Streamer.bot запущен;
   - WebSocket Server запущен;
   - порт 8080;
   - Address 127.0.0.1.
4. Если порт в Streamer.bot другой, поменяй в chat.js:
   websocketUrl: 'ws://127.0.0.1:8080/'
5. Если сообщения есть, а отдельные emotes — текстом:
   проверь доступность CDN 7TV/BTTV/FFZ.
