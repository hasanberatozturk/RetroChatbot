// 2077: ZERO, Neo-İstanbul'da bilgi simsarı. Neon ışıklı siberpunk terminal.
import { createChat, currentTime, downloadText, pad } from "./core.js";

const site = document.getElementById("cyber-site");
const messagesEl = document.getElementById("cyber-messages");
const inputEl = document.getElementById("cyber-input");
const sendButton = document.getElementById("cyber-send");
const clockEl = document.getElementById("cyber-clock");

function scroll() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addLine(who, text, className) {
  const line = document.createElement("p");
  line.className = `c-line ${className}`;
  const whoEl = document.createElement("span");
  whoEl.className = "c-who";
  whoEl.textContent = `${who} `;
  line.append(whoEl, document.createTextNode(text));
  messagesEl.appendChild(line);
  scroll();
  return line;
}

function addSystem(text, className = "c-system") {
  const line = document.createElement("p");
  line.className = `c-line ${className}`;
  line.textContent = `// ${text}`;
  messagesEl.appendChild(line);
  scroll();
  return line;
}

function greet() {
  messagesEl.replaceChildren();
  addSystem("güvenli kanal açıldı · şifreleme: kuantum-256");
  addLine(
    "ZERO //",
    "Sinyal temiz. Neo-İstanbul ağına hoş geldin, yabancı. Ne lazım: bilgi, rota, yoksa sadece sohbet mi?",
    "c-bot"
  );
}

const chat = createChat({
  era: "2077",
  formEl: document.getElementById("cyber-form"),
  inputEl,
  ui: {
    networkErrorText: "bağlantı koptu · ağ geçidine ulaşılamıyor, tekrar dene",
    addUser: (text) => addLine("> SEN", text, "c-user"),
    addError: (text) => addSystem(`HATA: ${text}`, "c-system c-error"),
    renderSaved({ role, text }) {
      if (role === "user") addLine("> SEN", text, "c-user");
      else addLine("ZERO //", text, "c-bot");
    },
    onRestore: () => addSystem("bellek arşivinden önceki oturum geri yüklendi"),
    reset: greet,
    startBot() {
      const element = addLine("ZERO //", "", "c-bot");
      return { element, textNode: element.lastChild };
    },
    scroll,
    // Nöral bağlantı hızı: çok hızlı
    typing: { minChars: 3, maxChars: 6, tickMs: 14 },
    onReceiving() {},
    showLoading: () => addSystem("nöral bağlantı kuruluyor", "c-system c-loading"),
    setBusy(busy) {
      inputEl.disabled = busy;
      sendButton.disabled = busy;
      if (!busy) inputEl.focus({ preventScroll: true });
    },
  },
});

document.getElementById("cyber-clear").addEventListener("click", () => {
  if (chat.isBusy()) return;
  if (confirm("Oturum belleği silinsin mi? Bu işlem geri alınamaz.")) chat.clear();
});

document.getElementById("cyber-export").addEventListener("click", () => {
  const messages = chat.getHistory();
  if (!messages.length) {
    addSystem("indirilecek veri yok · önce bir şeyler sor", "c-system c-error");
    return;
  }
  const now = new Date();
  const data = {
    kanal: "NEO//İSTANBUL · 77",
    tarih: `2077-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    mesajlar: messages.map((m) => ({ kim: m.role === "user" ? "SEN" : "ZERO", saat: m.time, metin: m.text })),
  };
  downloadText("zero-veri-2077.json", JSON.stringify(data, null, 2), "application/json");
});

export default {
  id: "2077",
  botName: "ZERO",
  title: "NEO//İSTANBUL · 2077",
  warpText: "2077'ye ışınlanılıyor...",
  site,
  chat,
  updateClock(now) {
    clockEl.textContent = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.2077 // ${currentTime()}`;
  },
};
