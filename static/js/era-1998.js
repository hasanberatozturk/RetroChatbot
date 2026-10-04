// 1998: RetroBot, internet kafede gece vardiyasında. 90'lar kişisel web sitesi.
import { createChat, currentTime, downloadText, pad } from "./core.js";
import { isMusicPlaying, modem, startMusic, stopMusic } from "./sound.js";

const site = document.getElementById("retro-site");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const statusEl = document.getElementById("status");
const clockEl = document.getElementById("clock");
const counterEl = document.getElementById("counter");

function scroll() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
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
  messagesEl.appendChild(line);
  scroll();
  return line;
}

function addSystemLine(text, className = "system") {
  const line = document.createElement("p");
  line.className = `line ${className}`;
  line.textContent = `*** ${text}`;
  messagesEl.appendChild(line);
  scroll();
  return line;
}

function greet() {
  messagesEl.replaceChildren();
  addSystemLine("#90lar kanalına katıldın.");
  addSystemLine("RetroBot kanala katıldı.");
  addChatLine(
    "RetroBot",
    "Selaaam! Hoş geldin dostum :) Ben RetroBot, internet kafenin gece vardiyasındayım. Ne sormak istersin?",
    "nick-bot"
  );
}

const chat = createChat({
  era: "1998",
  formEl: document.getElementById("chat-form"),
  inputEl,
  ui: {
    networkErrorText: "Bağlantı koptu! Biri telefonu mu kaldırdı?",
    addUser: (text) => addChatLine("Sen", text, "nick-user"),
    addError: (text) => addSystemLine(`HATA: ${text}`, "error"),
    renderSaved({ role, text, time }) {
      if (role === "user") addChatLine("Sen", text, "nick-user", time);
      else addChatLine("RetroBot", text, "nick-bot", time);
    },
    onRestore: () => addSystemLine("Önceki sohbet disketten yüklendi."),
    reset: greet,
    startBot() {
      const element = addChatLine("RetroBot", "", "nick-bot");
      return { element, textNode: element.lastChild };
    },
    scroll,
    // 56k modem hızı: birkaç harf, ara sıra takılma
    typing: { minChars: 1, maxChars: 4, tickMs: 35, stallChance: 0.05, stallMs: 350 },
    onReceiving: () => (statusEl.textContent = "▼ Veri alınıyor... 56.6 Kbps"),
    onSend: modem,
    showLoading: () => addSystemLine("Bağlanıyor... kşşşhhh-diiiii-düüüt...", "system blink"),
    setBusy(busy) {
      inputEl.disabled = busy;
      sendButton.disabled = busy;
      statusEl.textContent = busy ? "◌ Modem çevriliyor..." : "● Bağlı: 56.6 Kbps";
      if (!busy) inputEl.focus({ preventScroll: true });
    },
  },
});

// Menüdeki sahte linkler
site.querySelectorAll("[data-construction]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    alert("Bu sayfa yapım aşamasındadır! Lütfen daha sonra tekrar ziyaret edin. :)");
  });
});

document.getElementById("retro-clear").addEventListener("click", () => {
  if (chat.isBusy()) return;
  if (confirm("Sohbet geçmişi silinsin mi? Bu işlem geri alınamaz!")) chat.clear();
});

// mIRC tarzı kayıt dosyası; tarih bugünün günü/ayı ama yıl 1998
document.getElementById("retro-export").addEventListener("click", () => {
  const messages = chat.getHistory();
  if (!messages.length) {
    alert("Kaydedilecek bir sohbet yok! Önce RetroBot ile biraz laflayın. :)");
    return;
  }
  const now = new Date();
  const date98 = new Date(1998, now.getMonth(), now.getDate());
  const stamp = date98
    .toDateString()
    .replace(/ (\d{4})$/, ` ${pad(now.getHours())}:${pad(now.getMinutes())}:00 $1`);
  const lines = [
    `Session Start: ${stamp}`,
    "Session Ident: #90lar",
    "*** #90lar kanalına katıldın.",
    ...messages.map((m) => `[${m.time || "--:--"}] <${m.role === "user" ? "Sen" : "RetroBot"}> ${m.text}`),
    `Session Close: ${stamp}`,
  ];
  // 90'lar Windows'u: CRLF satır sonu ve 8.3 dosya adı
  downloadText("SOHBET98.LOG", lines.join("\r\n") + "\r\n", "text/plain");
});

// MIDI çalar: ses ayarından bağımsız, sadece "Çal"a basınca çalar
const midiButton = document.getElementById("midi-toggle");
const midiStatus = document.getElementById("midi-status");

function updateMidiPlayer() {
  const playing = isMusicPlaying();
  midiButton.textContent = playing ? "■ Durdur" : "▶ Çal";
  midiButton.setAttribute("aria-pressed", String(playing));
  midiStatus.textContent = playing ? "♫ çalıyor..." : "durduruldu";
  midiStatus.classList.toggle("blink", playing);
}

midiButton.addEventListener("click", () => {
  if (isMusicPlaying()) stopMusic();
  else startMusic();
  updateMidiPlayer();
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

loadVisitorCounter();

export default {
  id: "1998",
  botName: "RetroBot",
  title: "RetroBot'un Sohbet Odası",
  warpText: "1998'e ışınlanılıyor...",
  site,
  chat,
  updateClock(now) {
    clockEl.textContent = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.1998 ${currentTime()}`;
  },
  onLeave() {
    stopMusic();
    updateMidiPlayer();
  },
};
