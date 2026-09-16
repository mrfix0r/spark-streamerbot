(() => {
    "use strict";

    // ===== Настройки =====
    const RATE = 1.05;       // скорость речи
    const PITCH = 1.0;       // высота голоса
    const VOLUME = 1.0;      // 0.0 .. 1.0
    const STABLE_MS = 1200;  // сколько ждать стабильного текста ответа

    const processedButtons = new WeakSet();
    const candidates = new WeakMap();

    function log(...args) {
        console.log("[Alice TTS]", ...args);
    }

    function normalize(text) {
        return (text || "")
            .replace(/\u00A0/g, " ")
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    function isCopyButton(el) {
        if (!(el instanceof HTMLElement)) return false;

        const label = normalize([
            el.getAttribute("aria-label"),
            el.getAttribute("title"),
            el.innerText
        ].filter(Boolean).join(" ")).toLowerCase();

        return label.includes("копир") || label.includes("copy");
    }

    function getCopyButtons() {
        return [...document.querySelectorAll("button, [role='button']")]
            .filter(isCopyButton);
    }

    function extractAnswerText(copyButton) {
        let node = copyButton;

        // Ищем ближайший контейнер, в котором уже есть сам текст ответа.
        for (let i = 0; i < 10 && node && node !== document.body; i++, node = node.parentElement) {
            if (!(node instanceof HTMLElement)) continue;

            const clone = node.cloneNode(true);

            // Убираем кнопки/служебные элементы, чтобы TTS не читал
            // "копировать", "лайк", "поделиться" и т.п.
            clone.querySelectorAll(
                "button, [role='button'], svg, textarea, input, script, style"
            ).forEach(x => x.remove());

            const text = normalize(clone.innerText);

            // Слишком короткий контейнер — скорее всего это только панель действий.
            // Слишком большой — скорее всего мы поднялись до контейнера всего чата.
            if (text.length >= 10 && text.length <= 8000) {
                return text;
            }
        }

        return "";
    }

    function chooseRussianVoice() {
        const voices = speechSynthesis.getVoices();
        const ru = voices.filter(v => (v.lang || "").toLowerCase().startsWith("ru"));

        if (!ru.length) return null;

        const preferredNames = [
            "Svetlana",
            "Irina",
            "Светлана",
            "Ирина",
            "Russian"
        ];

        for (const wanted of preferredNames) {
            const found = ru.find(v =>
                (v.name || "").toLowerCase().includes(wanted.toLowerCase())
            );
            if (found) return found;
        }

        return ru[0];
    }

    function speak(text) {
        if (!text) return;

        // Не даём старой реплике продолжать говорить поверх новой.
        speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "ru-RU";
        utterance.rate = RATE;
        utterance.pitch = PITCH;
        utterance.volume = VOLUME;

        const voice = chooseRussianVoice();
        if (voice) {
            utterance.voice = voice;
            log("Voice:", voice.name, voice.lang);
        } else {
            log("Русский голос не найден — используется системный голос.");
        }

        utterance.onerror = e => log("Speech error:", e.error);
        speechSynthesis.speak(utterance);

        log("Озвучиваю:", text);
    }

    function inspectNewAnswers() {
        const buttons = getCopyButtons();
        const now = Date.now();

        for (const button of buttons) {
            if (processedButtons.has(button)) continue;

            const text = extractAnswerText(button);
            if (!text) continue;

            const state = candidates.get(button);

            if (!state || state.text !== text) {
                candidates.set(button, {
                    text,
                    changedAt: now
                });
                continue;
            }

            // Текст не менялся STABLE_MS — считаем ответ законченным.
            if (now - state.changedAt >= STABLE_MS) {
                processedButtons.add(button);
                candidates.delete(button);
                speak(text);
            }
        }
    }

    // Не озвучиваем старые ответы, уже находящиеся на странице при старте.
    function markExistingAsProcessed() {
        for (const button of getCopyButtons()) {
            processedButtons.add(button);
        }
        log("Готово. Старые ответы пропущены, жду новый ответ Алисы.");
    }

    let timer = null;

    function scheduleInspect() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            inspectNewAnswers();

            // Если ответ ещё стабилизируется, повторяем проверку.
            setTimeout(inspectNewAnswers, STABLE_MS + 100);
        }, 250);
    }

    // Голоса Chromium иногда появляются не сразу.
    speechSynthesis.getVoices();
    if ("onvoiceschanged" in speechSynthesis) {
        speechSynthesis.onvoiceschanged = () => {
            const voice = chooseRussianVoice();
            if (voice) log("Доступный русский голос:", voice.name);
        };
    }

    markExistingAsProcessed();

    const observer = new MutationObserver(scheduleInspect);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    });

    log("Alice AI TTS запущен.");
})();
