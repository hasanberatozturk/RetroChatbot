// 1998: RetroBot, internet kafede gece vardiyasında. 90'lar kişisel web sitesi.
import { createChat, currentTime, downloadText, pad } from "./core.js";
import { isFormatCommand, showBsod } from "./easter-eggs.js";
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
    intercept(text) {
      if (!isFormatCommand(text)) return false;
      addChatLine("Sen", text, "nick-user");
      showBsod("98", () => {
        addSystemLine("Bilgisayar yeniden başlatıldı. ScanDisk diski denetliyor...");
        addChatLine("RetroBot", "Ne yaptın sen?! Az kalsın bütün disketlerim gidiyordu :( Bir daha format atma lütfen!", "nick-bot");
        inputEl.focus({ preventScroll: true });
      });
      return true;
    },
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

/* ---------- Ziyaretçi defteri ---------- */

const chatView = document.getElementById("retro-chat-view");
const guestbookView = document.getElementById("retro-guestbook-view");
const gbForm = document.getElementById("gb-form");
const gbSubmit = document.getElementById("gb-submit");
const gbFeedback = document.getElementById("gb-feedback");
const gbEntries = document.getElementById("gb-entries");

// Kayıt tarihi gerçek, ama yıl her zaman 1998 görünsün
function formatEntryDate(iso) {
  const date = new Date(iso);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.1998 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderEntries(entries) {
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "gb-empty";
    empty.textContent = "Henüz kimse yazmamış... İlk imzayı sen at!";
    gbEntries.replaceChildren(empty);
    return;
  }
  gbEntries.replaceChildren(
    ...entries.map((entry) => {
      const box = document.createElement("div");
      box.className = "gb-entry";
      const head = document.createElement("div");
      head.className = "gb-entry-head";
      const name = document.createElement("b");
      name.textContent = entry.name;
      head.append(`#${entry.id} · `, name);
      if (entry.city) head.append(` (${entry.city})`);
      head.append(` · ${formatEntryDate(entry.created_at)}`);
      const msg = document.createElement("div");
      msg.className = "gb-entry-msg";
      msg.textContent = entry.message;
      box.append(head, msg);
      return box;
    })
  );
}

function setFeedback(text, isError = false) {
  gbFeedback.textContent = text;
  gbFeedback.classList.toggle("error", isError);
}

async function loadEntries() {
  gbEntries.textContent = "Yükleniyor... lütfen bekleyin...";
  try {
    const res = await fetch("/api/guestbook");
    const data = await res.json();
    renderEntries(data.entries);
  } catch {
    gbEntries.textContent = "Defter yüklenemedi! Sayfayı yenilemeyi dene.";
  }
}

gbForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const entry = {
    name: document.getElementById("gb-name").value,
    city: document.getElementById("gb-city").value,
    message: document.getElementById("gb-message").value,
  };
  gbSubmit.disabled = true;
  setFeedback("Gönderiliyor...");
  try {
    const res = await fetch("/api/guestbook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(typeof data.detail === "string" ? data.detail : "Deftere yazılamadı, alanları kontrol et!", true);
      return;
    }
    gbForm.reset();
    setFeedback("Teşekkürler! Deftere yazıldın :)");
    loadEntries();
  } catch {
    setFeedback("Bağlantı koptu! Tekrar dene.", true);
  } finally {
    gbSubmit.disabled = false;
  }
});

function showView(view) {
  const isGuestbook = view === "guestbook";
  chatView.hidden = isGuestbook;
  guestbookView.hidden = !isGuestbook;
  if (isGuestbook) {
    setFeedback("");
    loadEntries();
  } else {
    chat.focus();
  }
}

site.querySelectorAll("[data-view]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showView(link.dataset.view);
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
