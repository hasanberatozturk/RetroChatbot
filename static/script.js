const PAGE_TITLES = {
  retro: "RetroBot'un Sohbet Odası",
  future: "Nova · 2030",
};

function pad(n) {
  return String(n).padStart(2, "0");
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MAX_SAVED_MESSAGES = 100; // Tarayıcıda dönem başına saklanan en fazla mesaj

function currentTime() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function loadPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Tarayıcı depolamayı engelliyorsa tercih sadece bu oturumda geçerli olur
  }
}

function loadSavedChat(era) {
  try {
    const saved = JSON.parse(loadPreference(`chat-${era}`) || "[]");
    return Array.isArray(saved) ? saved.filter((m) => m && typeof m.text === "string") : [];
  } catch {
    return [];
  }
}

/* ===================== Ortak sohbet mantığı ===================== */

// Sunucudan gelen NDJSON akışını satır satır olaylara çevirir
async function* readEvents(response) {
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
function createTyper(textNode, onUpdate, options = {}) {
  const { minChars = 2, maxChars = 2, tickMs = 16, stallChance = 0, stallMs = 0 } = options;
  let queue = "";
  let ended = false;
  let timer = null;
  let resolveDone;
  const done = new Promise((resolve) => (resolveDone = resolve));

  function tick() {
    timer = null;
    if (queue) {
      const n = minChars + Math.floor(Math.random() * (maxChars - minChars + 1));
      textNode.data += queue.slice(0, n);
      queue = queue.slice(n);
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

// Her dönemin kendi geçmişi var; 1998 botu 2030 konuşmasını görmez (ve tersi).
// Geçmiş tarayıcıda saklanır, sayfa yenilenince geri yüklenir.
// Mesaj biçimi: { role: "user" | "model", text, time: "HH:MM" }
function createChat({ era, formEl, inputEl, ui }) {
  const history = loadSavedChat(era);

  function persist() {
    history.splice(0, Math.max(0, history.length - MAX_SAVED_MESSAGES));
    savePreference(`chat-${era}`, JSON.stringify(history));
  }

  async function send(text) {
    ui.onSend?.();
    ui.addUser(text);
    ui.setBusy(true);
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
      ui.setBusy(false);
    }
  }

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = inputEl.value.trim();
    if (!text || inputEl.disabled) return;
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
    history.length = 0;
    persist();
    ui.reset();
  }

  return {
    send,
    restore,
    clear,
    getHistory: () => history.slice(),
    focus: () => inputEl.focus({ preventScroll: true }),
  };
}

/* ===================== 1998 arayüzü ===================== */

const retroMessagesEl = document.getElementById("messages");
const retroInputEl = document.getElementById("message-input");
const retroSendButton = document.getElementById("send-button");
const retroStatusEl = document.getElementById("status");
const clockEl = document.getElementById("clock");
const counterEl = document.getElementById("counter");

function retroScroll() {
  retroMessagesEl.scrollTop = retroMessagesEl.scrollHeight;
}

function addChatLine(nick, text, nickClass, time = currentTime()) {
  const line = document.createElement("p");
  line.className = "line";

  const timeEl = document.createElement("span");
  timeEl.className = "time";
  timeEl.textContent = `[${time}] `;

  const nickEl = document.createElement("span");
  nickEl.className = nickClass;
  nickEl.textContent = `<${nick}> `;

  line.append(timeEl, nickEl, document.createTextNode(text));
  retroMessagesEl.appendChild(line);
  retroScroll();
  return line;
}

function addSystemLine(text, className = "system") {
  const line = document.createElement("p");
  line.className = `line ${className}`;
  line.textContent = `*** ${text}`;
  retroMessagesEl.appendChild(line);
  retroScroll();
  return line;
}

const retroChat = createChat({
  era: "retro",
  formEl: document.getElementById("chat-form"),
  inputEl: retroInputEl,
  ui: {
    networkErrorText: "Bağlantı koptu! Biri telefonu mu kaldırdı?",
    addUser: (text) => addChatLine("Sen", text, "nick-user"),
    addError: (text) => addSystemLine(`HATA: ${text}`, "error"),
    renderSaved({ role, text, time }) {
      if (role === "user") addChatLine("Sen", text, "nick-user", time);
      else addChatLine("RetroBot", text, "nick-bot", time);
    },
    onRestore: () => addSystemLine("Önceki sohbet disketten yüklendi."),
    reset: retroGreeting,
    startBot() {
      const element = addChatLine("RetroBot", "", "nick-bot");
      return { element, textNode: element.lastChild };
    },
    scroll: retroScroll,
    // 56k modem hızı: birkaç harf, ara sıra takılma
    typing: { minChars: 1, maxChars: 4, tickMs: 35, stallChance: 0.05, stallMs: 350 },
    onReceiving: () => (retroStatusEl.textContent = "▼ Veri alınıyor... 56.6 Kbps"),
    showLoading: () => addSystemLine("Bağlanıyor... kşşşhhh-diiiii-düüüt...", "system blink"),
    setBusy(busy) {
      retroInputEl.disabled = busy;
      retroSendButton.disabled = busy;
      retroStatusEl.textContent = busy ? "◌ Modem çevriliyor..." : "● Bağlı: 56.6 Kbps";
      if (!busy) retroInputEl.focus();
    },
  },
});

// Menüdeki sahte linkler
document.querySelectorAll("[data-construction]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    alert("Bu sayfa yapım aşamasındadır! Lütfen daha sonra tekrar ziyaret edin. :)");
  });
});

async function loadVisitorCounter() {
  try {
    const res = await fetch("/api/visit", { method: "POST" });
    const data = await res.json();
    counterEl.textContent = String(data.count).padStart(6, "0");
  } catch {
    counterEl.textContent = "??????";
  }
}

function retroGreeting() {
  retroMessagesEl.replaceChildren();
  addSystemLine("#90lar kanalına katıldın.");
  addSystemLine("RetroBot kanala katıldı.");
  addChatLine(
    "RetroBot",
    "Selaaam! Hoş geldin dostum :) Ben RetroBot, internet kafenin gece vardiyasındayım. Ne sormak istersin?",
    "nick-bot"
  );
}

document.getElementById("retro-clear").addEventListener("click", () => {
  if (retroInputEl.disabled) return;
  if (confirm("Sohbet geçmişi silinsin mi? Bu işlem geri alınamaz!")) retroChat.clear();
});

/* ===================== 2030 arayüzü ===================== */

const futureMessagesEl = document.getElementById("future-messages");
const futureInputEl = document.getElementById("future-input");
const futureSendButton = document.getElementById("future-send");
const futureStatusEl = document.getElementById("future-status");
const futureDateEl = document.getElementById("future-date");
const futureSuggestionsEl = document.getElementById("future-suggestions");
const orbEl = document.querySelector(".f-orb");

function addBubble(text, className) {
  const bubble = document.createElement("div");
  bubble.className = `f-msg ${className}`;
  bubble.textContent = text;
  futureMessagesEl.appendChild(bubble);
  futureMessagesEl.scrollTop = futureMessagesEl.scrollHeight;
  return bubble;
}

function setFutureStatus(text) {
  const dot = document.createElement("span");
  dot.className = "f-dot";
  futureStatusEl.replaceChildren(dot, text);
}

const futureChat = createChat({
  era: "future",
  formEl: document.getElementById("future-form"),
  inputEl: futureInputEl,
  ui: {
    networkErrorText: "Bağlantı kurulamadı. Birazdan tekrar dener misin?",
    addUser(text) {
      futureSuggestionsEl.hidden = true;
      addBubble(text, "user");
    },
    addError: (text) => addBubble(text, "error"),
    renderSaved({ role, text }) {
      futureSuggestionsEl.hidden = true;
      addBubble(text, role === "user" ? "user" : "bot");
    },
    reset: futureGreeting,
    startBot() {
      const element = addBubble("", "bot");
      const textNode = document.createTextNode("");
      element.appendChild(textNode);
      return { element, textNode };
    },
    scroll: () => (futureMessagesEl.scrollTop = futureMessagesEl.scrollHeight),
    typing: { minChars: 2, maxChars: 4, tickMs: 16 },
    onReceiving: () => setFutureStatus("Yazıyor..."),
    onSend: stopSpeaking,
    onReply: speak,
    showLoading() {
      const bubble = addBubble("", "bot f-typing");
      bubble.setAttribute("aria-label", "Nova yazıyor");
      bubble.append(
        document.createElement("span"),
        document.createElement("span"),
        document.createElement("span")
      );
      return bubble;
    },
    setBusy(busy) {
      futureInputEl.disabled = busy;
      futureSendButton.disabled = busy;
      document.getElementById("future-mic").disabled = busy;
      orbEl.classList.toggle("thinking", busy);
      setFutureStatus(busy ? "Düşünüyor..." : "Çevrimiçi");
      if (!busy) futureInputEl.focus();
    },
  },
});

function futureGreeting() {
  futureMessagesEl.replaceChildren();
  futureSuggestionsEl.hidden = false;
  addBubble("Merhaba, ben Nova 👋 2030'dan selamlar! Bugün senin için ne yapabilirim?", "bot");
}

document.getElementById("future-clear").addEventListener("click", () => {
  if (futureInputEl.disabled) return;
  if (confirm("Yeni bir sohbet başlatılsın mı? Mevcut konuşma silinecek.")) {
    stopSpeaking();
    futureChat.clear();
  }
});

futureSuggestionsEl.querySelectorAll(".f-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    if (!futureInputEl.disabled) futureChat.send(chip.textContent);
  });
});

/* ===================== 2030: sesli sohbet ===================== */

const futureFormEl = document.getElementById("future-form");
const micButton = document.getElementById("future-mic");
const speakButton = document.getElementById("future-speak");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const canSpeak = "speechSynthesis" in window;
let speakEnabled = false;
let recognition = null;

function speak(text) {
  if (!speakEnabled || !canSpeak) return;
  speechSynthesis.cancel();
  // Emojileri okumasın ("parıltı" vb. demesin)
  const utterance = new SpeechSynthesisUtterance(text.replace(/\p{Extended_Pictographic}/gu, ""));
  utterance.lang = "tr-TR";
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("tr"));
  if (voice) utterance.voice = voice;
  utterance.rate = 1.05;
  speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
}

function setSpeakEnabled(enabled) {
  speakEnabled = enabled;
  speakButton.setAttribute("aria-pressed", String(enabled));
  speakButton.title = enabled ? "Sesli yanıt açık" : "Sesli yanıt kapalı";
  if (!enabled) stopSpeaking();
}

if (canSpeak) {
  setSpeakEnabled(loadPreference("nova-speak") === "1");
  speakButton.addEventListener("click", () => {
    setSpeakEnabled(!speakEnabled);
    savePreference("nova-speak", speakEnabled ? "1" : "0");
  });
} else {
  speakButton.hidden = true;
}

function stopListening() {
  if (recognition) recognition.stop();
}

// Konuşma tanıma (Chrome/Edge). Desteklenmiyorsa mikrofon butonu gizli kalır.
if (SpeechRecognition) {
  micButton.hidden = false;
  micButton.addEventListener("click", () => {
    if (recognition) {
      recognition.stop();
      return;
    }
    if (futureInputEl.disabled) return;

    stopSpeaking();
    recognition = new SpeechRecognition();
    recognition.lang = "tr-TR";
    recognition.interimResults = true;
    let heard = false;
    let failed = false;

    recognition.onresult = (event) => {
      heard = true;
      futureInputEl.value = Array.from(event.results, (r) => r[0].transcript).join("");
    };
    recognition.onerror = (event) => {
      failed = true;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        addBubble("Mikrofon izni verilmedi. Tarayıcının adres çubuğundan izin verebilirsin.", "error");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        addBubble(`Ses tanıma hatası: ${event.error}`, "error");
      }
    };
    recognition.onend = () => {
      recognition = null;
      micButton.classList.remove("listening");
      micButton.setAttribute("aria-label", "Sesle sor");
      if (!futureInputEl.disabled) setFutureStatus("Çevrimiçi");
      // Konuşma bittiyse mesajı otomatik gönder
      if (heard && !failed && futureInputEl.value.trim()) futureFormEl.requestSubmit();
    };

    recognition.start();
    micButton.classList.add("listening");
    micButton.setAttribute("aria-label", "Dinlemeyi durdur");
    setFutureStatus("Dinliyor...");
  });
}

/* ===================== Sohbeti dışa aktarma ===================== */

function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// mIRC tarzı kayıt dosyası; tarih bugünün günü/ayı ama yıl 1998
function exportRetroLog() {
  const messages = retroChat.getHistory();
  if (!messages.length) {
    alert("Kaydedilecek bir sohbet yok! Önce RetroBot ile biraz laflayın. :)");
    return;
  }
  const now = new Date();
  const date98 = new Date(1998, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  const stamp = date98.toDateString().replace(/ (\d{4})$/, ` ${pad(now.getHours())}:${pad(now.getMinutes())}:00 $1`);
  const lines = [
    `Session Start: ${stamp}`,
    "Session Ident: #90lar",
    "*** #90lar kanalına katıldın.",
    ...messages.map((m) => `[${m.time || "--:--"}] <${m.role === "user" ? "Sen" : "RetroBot"}> ${m.text}`),
    `Session Close: ${stamp}`,
  ];
  // 90'lar Windows'u: CRLF satır sonu ve 8.3 dosya adı
  downloadText("SOHBET98.LOG", lines.join("\r\n") + "\r\n", "text/plain");
}

function exportFutureMarkdown() {
  const messages = futureChat.getHistory();
  if (!messages.length) {
    addBubble("Henüz indirilecek bir sohbet yok. Bir şeyler sorarak başlayabilirsin!", "error");
    return;
  }
  const now = new Date();
  const dayMonth = now.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  const lines = [`# Nova ile sohbet — ${dayMonth} 2030`, ""];
  for (const m of messages) {
    lines.push(`**${m.role === "user" ? "Sen" : "Nova"}** · ${m.time || ""}`, "", m.text, "");
  }
  downloadText(`nova-sohbet-2030-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.md`, lines.join("\n"), "text/markdown");
}

document.getElementById("retro-export").addEventListener("click", exportRetroLog);
document.getElementById("future-export").addEventListener("click", exportFutureMarkdown);

/* ===================== Saatler ===================== */

// Bugünün gün/ay/saati, ama yıl dönemine göre sabit
function updateClocks() {
  const now = new Date();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  clockEl.textContent = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.1998 ${time}`;

  const dayMonth = now.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  futureDateEl.textContent = `${dayMonth} 2030 · ${time}`;
}

/* ===================== Zaman makinesi ===================== */

const retroSite = document.getElementById("retro-site");
const futureSite = document.getElementById("future-site");
const warpEl = document.getElementById("warp");
const warpTextEl = document.getElementById("warp-text");
let switching = false;

function applyMode(mode) {
  const isFuture = mode === "future";
  stopSpeaking();
  stopListening();
  retroSite.hidden = isFuture;
  futureSite.hidden = !isFuture;
  document.body.className = mode;
  document.title = PAGE_TITLES[mode];
  window.scrollTo(0, 0);
  (isFuture ? futureChat : retroChat).focus();
}

function switchMode(mode) {
  if (switching) return;
  if (reduceMotion) {
    applyMode(mode);
    return;
  }

  switching = true;
  warpTextEl.textContent = mode === "future" ? "2030'a ışınlanılıyor..." : "1998'e geri dönülüyor...";
  // Animasyonu baştan başlatmak için öğeyi yeniden göster
  warpEl.hidden = true;
  void warpEl.offsetWidth;
  warpEl.hidden = false;

  // Ekran tamamen kararınca arayüzü değiştir, animasyon bitince perdeyi kaldır
  setTimeout(() => applyMode(mode), 600);
  setTimeout(() => {
    warpEl.hidden = true;
    switching = false;
  }, 1400);
}

document.getElementById("modernize-btn").addEventListener("click", () => switchMode("future"));
document.getElementById("retro-btn").addEventListener("click", () => switchMode("retro"));

/* ===================== Başlangıç ===================== */

updateClocks();
setInterval(updateClocks, 30 * 1000);
loadVisitorCounter();

retroChat.restore();
futureChat.restore();

retroChat.focus();
