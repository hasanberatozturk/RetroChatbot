const PAGE_TITLES = {
  retro: "RetroBot'un Sohbet Odası",
  future: "Nova · 2030",
};

function pad(n) {
  return String(n).padStart(2, "0");
}

/* ===================== Ortak sohbet mantığı ===================== */

// Her dönemin kendi geçmişi var; 1998 botu 2030 konuşmasını görmez (ve tersi).
function createChat({ era, formEl, inputEl, ui }) {
  const history = [];

  async function send(text) {
    ui.addUser(text);
    ui.setBusy(true);
    const loadingEl = ui.showLoading();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, era }),
      });
      const data = await res.json().catch(() => ({}));
      loadingEl.remove();

      if (!res.ok) {
        const detail = typeof data.detail === "string" ? data.detail : `Sunucu hatası (${res.status})`;
        ui.addError(detail);
        return;
      }

      history.push({ role: "user", text }, { role: "model", text: data.reply });
      ui.addBot(data.reply);
    } catch {
      loadingEl.remove();
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
    addBot: (text) => addChatLine("RetroBot", text, "nick-bot"),
    addError: (text) => addSystemLine(`HATA: ${text}`, "error"),
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
    addBot: (text) => addBubble(text, "bot"),
    addError: (text) => addBubble(text, "error"),
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
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let switching = false;

function applyMode(mode) {
  const isFuture = mode === "future";
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
