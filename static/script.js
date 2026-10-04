const PAGE_TITLES = {
  retro: "RetroBot'un Sohbet Odası",
  future: "Nova · 2030",
};

function pad(n) {
  return String(n).padStart(2, "0");
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
function createChat({ era, formEl, inputEl, ui }) {
  const history = [];

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
        body: JSON.stringify({ message: text, history, era }),
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
      history.push({ role: "user", text }, { role: "model", text: reply });
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

  return { send, focus: () => inputEl.focus({ preventScroll: true }) };
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

function addChatLine(nick, text, nickClass) {
  const now = new Date();
  const line = document.createElement("p");
  line.className = "line";

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = `[${pad(now.getHours())}:${pad(now.getMinutes())}] `;

  const nickEl = document.createElement("span");
  nickEl.className = nickClass;
  nickEl.textContent = `<${nick}> `;

  line.append(time, nickEl, document.createTextNode(text));
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

addSystemLine("#90lar kanalına katıldın.");
addSystemLine("RetroBot kanala katıldı.");
addChatLine(
  "RetroBot",
  "Selaaam! Hoş geldin dostum :) Ben RetroBot, internet kafenin gece vardiyasındayım. Ne sormak istersin?",
  "nick-bot"
);

addBubble("Merhaba, ben Nova 👋 2030'dan selamlar! Bugün senin için ne yapabilirim?", "bot");

retroChat.focus();
