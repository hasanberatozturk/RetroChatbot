// Tüm dönemlerin ortak kullandığı yardımcılar ve sohbet mantığı

export const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MAX_SAVED_MESSAGES = 100; // Tarayıcıda dönem başına saklanan en fazla mesaj

export function pad(n) {
  return String(n).padStart(2, "0");
}

export function currentTime() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// "4 Ekim" gibi bugünün gün ve ayı
export function todayDayMonth() {
  return new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
}

export function loadPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Tarayıcı depolamayı engelliyorsa tercih sadece bu oturumda geçerli olur
  }
}

// Eski sürümün sohbet kayıtlarını yeni anahtarlara taşı (retro -> 1998, future -> 2030).
// core.js tüm dönem modüllerinden önce çalıştığı için bu, sohbetler yüklenmeden yapılır.
for (const [oldKey, newKey] of [["chat-retro", "chat-1998"], ["chat-future", "chat-2030"]]) {
  const saved = loadPreference(oldKey);
  if (saved && !loadPreference(newKey)) savePreference(newKey, saved);
}

function loadSavedChat(era) {
  try {
    const saved = JSON.parse(loadPreference(`chat-${era}`) || "[]");
    return Array.isArray(saved) ? saved.filter((m) => m && typeof m.text === "string") : [];
  } catch {
    return [];
  }
}

export function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Sunucudan gelen NDJSON akışını satır satır olaylara çevirir
export async function* readEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line);
    }
  }
}

// Gelen metni harf harf ekrana yazar. Hız ayarları her dönemde farklı.
export function createTyper(textNode, onUpdate, options = {}) {
  const { minChars = 2, maxChars = 2, tickMs = 16, stallChance = 0, stallMs = 0, onChar } = options;
  let queue = "";
  let ended = false;
  let timer = null;
  let resolveDone;
  const done = new Promise((resolve) => (resolveDone = resolve));

  function tick() {
    timer = null;
    if (queue) {
      const n = minChars + Math.floor(Math.random() * (maxChars - minChars + 1));
      const piece = queue.slice(0, n);
      textNode.data += piece;
      queue = queue.slice(n);
      onChar?.(piece);
      onUpdate();
    }
    if (queue) {
      // Ara sıra takılma: eski modemlerin kesik kesik veri getirmesi gibi
      timer = setTimeout(tick, Math.random() < stallChance ? stallMs : tickMs);
    } else if (ended) {
      resolveDone();
    }
  }

  return {
    push(text) {
      if (reduceMotion) {
        textNode.data += text;
        onUpdate();
        return;
      }
      queue += text;
      if (!timer) timer = setTimeout(tick, tickMs);
    },
    end() {
      ended = true;
      if (!queue && !timer) resolveDone();
      return done;
    },
  };
}

/**
 * Bir dönemin sohbetini yönetir. Her dönemin kendi geçmişi var; 1998 botu 2030
 * konuşmasını görmez (ve tersi). Geçmiş tarayıcıda saklanır.
 * Mesaj biçimi: { role: "user" | "model", text, time: "HH:MM" }
 *
 * ui nesnesi dönemin arayüzünü çizer:
 *   addUser(text), addError(text), renderSaved(message), reset(),
 *   showLoading() -> element, startBot() -> { element, textNode },
 *   scroll(), setBusy(busy), onReceiving(), typing (createTyper ayarları),
 *   networkErrorText, isteğe bağlı: onSend(), onReply(text), onRestore()
 */
export function createChat({ era, formEl, inputEl, ui }) {
  const history = loadSavedChat(era);
  let busy = false;

  function persist() {
    history.splice(0, Math.max(0, history.length - MAX_SAVED_MESSAGES));
    savePreference(`chat-${era}`, JSON.stringify(history));
  }

  function setBusy(value) {
    busy = value;
    ui.setBusy(value);
  }

  async function send(text) {
    if (busy) return;
    ui.onSend?.();
    ui.addUser(text);
    setBusy(true);
    const loadingEl = ui.showLoading();
    const removeLoading = () => loadingEl.isConnected && loadingEl.remove();

    let typer = null;
    let botEl = null;
    let reply = "";
    let finished = false;

    async function finishTyping() {
      if (!typer) return;
      await typer.end();
      botEl.classList.remove("streaming");
    }

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: history.map(({ role, text }) => ({ role, text })),
          era,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        removeLoading();
        ui.addError(typeof data.detail === "string" ? data.detail : `Sunucu hatası (${res.status})`);
        return;
      }

      for await (const event of readEvents(res)) {
        if (event.type === "chunk") {
          if (!typer) {
            removeLoading();
            ui.onReceiving();
            const bot = ui.startBot();
            botEl = bot.element;
            botEl.classList.add("streaming");
            typer = createTyper(bot.textNode, ui.scroll, ui.typing);
          }
          reply += event.text;
          typer.push(event.text);
        } else if (event.type === "error") {
          await finishTyping();
          ui.addError(event.message);
          return;
        } else if (event.type === "done") {
          finished = true;
        }
      }

      await finishTyping();
      if (!finished) {
        ui.addError(ui.networkErrorText);
        return;
      }
      const time = currentTime();
      history.push({ role: "user", text, time }, { role: "model", text: reply, time });
      persist();
      ui.onReply?.(reply);
    } catch {
      removeLoading();
      await finishTyping();
      ui.addError(ui.networkErrorText);
    } finally {
      setBusy(false);
    }
  }

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = inputEl.value.trim();
    if (!text || busy) return;
    inputEl.value = "";
    send(text);
  });

  // Kayıtlı sohbeti ekrana çizer (sayfa açılışında)
  function restore() {
    ui.reset();
    if (history.length) ui.onRestore?.();
    for (const message of history) ui.renderSaved(message);
  }

  function clear() {
    if (busy) return;
    history.length = 0;
    persist();
    ui.reset();
  }

  return {
    send,
    restore,
    clear,
    isBusy: () => busy,
    getHistory: () => history.slice(),
    focus: () => inputEl.focus({ preventScroll: true }),
  };
}
