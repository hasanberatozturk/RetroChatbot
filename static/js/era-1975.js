// 1975: Kemal, Beyoğlu'nda plak dükkânında. Daktilo kâğıdına yazılan teleks yazışması.
import { createChat, downloadText, todayDayMonth } from "./core.js";

const site = document.getElementById("seventies-site");
const messagesEl = document.getElementById("seventies-messages");
const inputEl = document.getElementById("seventies-input");
const sendButton = document.getElementById("seventies-send");
const dateEl = document.getElementById("seventies-date");

function scroll() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addLine(who, text, className) {
  const line = document.createElement("p");
  line.className = `s-line ${className}`;
  const whoEl = document.createElement("span");
  whoEl.className = "s-who";
  whoEl.textContent = `${who}: `;
  line.append(whoEl, document.createTextNode(text));
  messagesEl.appendChild(line);
  scroll();
  return line;
}

function addNote(text, className = "s-note") {
  const line = document.createElement("p");
  line.className = `s-line ${className}`;
  line.textContent = text;
  messagesEl.appendChild(line);
  scroll();
  return line;
}

function greet() {
  messagesEl.replaceChildren();
  addLine(
    "KEMAL",
    "İyi günler efendim! Kemal'in Plak Dükkânı'na hoş geldiniz. Bugün sizin için hangi plağı çalalım?",
    "s-bot"
  );
}

const chat = createChat({
  era: "1975",
  formEl: document.getElementById("seventies-form"),
  inputEl,
  ui: {
    networkErrorText: "Hat kesildi. Santrale bağlanılamıyor, biraz sonra tekrar deneyiniz.",
    addUser: (text) => addLine("SİZ", text, "s-user"),
    addError: (text) => addNote(`*** ARIZA: ${text}`, "s-error"),
    renderSaved({ role, text }) {
      if (role === "user") addLine("SİZ", text, "s-user");
      else addLine("KEMAL", text, "s-bot");
    },
    onRestore: () => addNote("— Önceki yazışmalar dosyadan çıkarıldı —"),
    reset: greet,
    startBot() {
      const element = addLine("KEMAL", "", "s-bot");
      return { element, textNode: element.lastChild };
    },
    scroll,
    // Daktilo hızı: düzenli tıkırtı, satır başlarında küçük duraklama
    typing: { minChars: 1, maxChars: 2, tickMs: 30, stallChance: 0.03, stallMs: 220 },
    onReceiving() {},
    showLoading: () => addNote("— karşı taraf yazıyor: tık tık tık... —", "s-note s-wait"),
    setBusy(busy) {
      inputEl.disabled = busy;
      sendButton.disabled = busy;
      if (!busy) inputEl.focus({ preventScroll: true });
    },
  },
});

document.getElementById("seventies-clear").addEventListener("click", () => {
  if (chat.isBusy()) return;
  if (confirm("Yazışma kâğıdı çıkarılıp yenisi takılsın mı? Önceki yazışmalar silinecek.")) chat.clear();
});

document.getElementById("seventies-export").addEventListener("click", () => {
  const messages = chat.getHistory();
  if (!messages.length) {
    alert("Kâğıt henüz boş efendim. Önce bir teleks çekiniz.");
    return;
  }
  const lines = [
    "TELEKS — KEMAL'İN PLAK DÜKKÂNI, BEYOĞLU",
    `İSTANBUL, ${todayDayMonth().toLocaleUpperCase("tr-TR")} 1975`,
    "",
    ...messages.map((m) => `${m.role === "user" ? "SİZ" : "KEMAL"}: ${m.text}`),
    "",
    "-- SON --",
  ];
  downloadText("TELEKS-1975.TXT", lines.join("\r\n") + "\r\n", "text/plain");
});

export default {
  id: "1975",
  botName: "Kemal",
  title: "Kemal'in Plak Dükkânı · 1975",
  warpText: "1975'e ışınlanılıyor...",
  site,
  chat,
  updateClock() {
    dateEl.textContent = `İstanbul, ${todayDayMonth()} 1975`;
  },
};
