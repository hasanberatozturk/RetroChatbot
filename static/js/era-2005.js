// 2005: Ece, liseli; okuldan sonra anlık mesajlaşma programında. Windows XP havası.
import { createChat, currentTime, downloadText, reduceMotion, todayDayMonth } from "./core.js";

const NUDGE = "*titreşim gönderdi*";
const BUDDY = "~*~EcE~*~ ♥";

const site = document.getElementById("noughties-site");
const windowEl = document.getElementById("noughties-window");
const messagesEl = document.getElementById("noughties-messages");
const inputEl = document.getElementById("noughties-input");
const sendButton = document.getElementById("noughties-send");
const nudgeButton = document.getElementById("noughties-nudge");
const statusEl = document.getElementById("noughties-status");
const clockEl = document.getElementById("noughties-clock");

let lastReceived = null;

function scroll() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Klasik "X diyor ki:" biçimi
function addMessage(who, text, className) {
  const msg = document.createElement("div");
  msg.className = `n-msg ${className}`;
  const says = document.createElement("div");
  says.className = "n-says";
  says.textContent = `${who} diyor ki:`;
  const body = document.createElement("div");
  body.className = "n-text";
  body.textContent = text;
  msg.append(says, body);
  messagesEl.appendChild(msg);
  scroll();
  return msg;
}

function addSystem(text, className = "n-system") {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = text;
  messagesEl.appendChild(line);
  scroll();
  return line;
}

function addUser(text) {
  if (text === NUDGE) addSystem("Titreşim gönderdin.", "n-system n-nudge");
  else addMessage("Sen", text, "n-from-user");
}

function showIdleStatus() {
  statusEl.textContent = lastReceived ? `Son ileti alınma saati: ${lastReceived}` : "";
}

function shakeWindow() {
  if (reduceMotion) return;
  windowEl.classList.remove("shake");
  void windowEl.offsetWidth; // animasyonu baştan başlat
  windowEl.classList.add("shake");
}

windowEl.addEventListener("animationend", () => windowEl.classList.remove("shake"));

function greet() {
  messagesEl.replaceChildren();
  lastReceived = null;
  showIdleStatus();
  addMessage(BUDDY, "slm :) nbr? ben ece, okuldan yeni geldim xD", "n-from-buddy");
}

const chat = createChat({
  era: "2005",
  formEl: document.getElementById("noughties-form"),
  inputEl,
  ui: {
    networkErrorText: "İletiniz aşağıdaki alıcılara teslim edilemedi: ~*~EcE~*~ ♥",
    addUser,
    addError: (text) => addSystem(text, "n-system n-error"),
    renderSaved({ role, text }) {
      if (role === "user") addUser(text);
      else addMessage(BUDDY, text, "n-from-buddy");
    },
    onRestore: () => addSystem("Önceki konuşma geçmişi yüklendi."),
    reset: greet,
    startBot() {
      const element = addMessage(BUDDY, "", "n-from-buddy");
      const textNode = document.createTextNode("");
      element.querySelector(".n-text").appendChild(textNode);
      return { element, textNode };
    },
    scroll,
    // ADSL hızı: hızlı ama 2030 kadar akıcı değil
    typing: { minChars: 2, maxChars: 5, tickMs: 22 },
    onReceiving: () => (statusEl.textContent = `✎ ${BUDDY} yazıyor...`),
    showLoading() {
      const typing = document.createElement("span");
      typing.textContent = `✎ ${BUDDY} yazıyor...`;
      statusEl.replaceChildren(typing);
      return typing;
    },
    onReply() {
      lastReceived = currentTime();
    },
    setBusy(busy) {
      inputEl.disabled = busy;
      sendButton.disabled = busy;
      nudgeButton.disabled = busy;
      if (!busy) {
        showIdleStatus();
        inputEl.focus({ preventScroll: true });
      }
    },
  },
});

nudgeButton.addEventListener("click", () => {
  if (chat.isBusy()) return;
  shakeWindow();
  chat.send(NUDGE);
});

document.getElementById("noughties-clear").addEventListener("click", () => {
  if (chat.isBusy()) return;
  if (confirm("Konuşma penceresi temizlensin mi? Konuşma geçmişi silinecek.")) chat.clear();
});

document.getElementById("noughties-export").addEventListener("click", () => {
  const messages = chat.getHistory();
  if (!messages.length) {
    alert("Kaydedilecek bir konuşma yok :(");
    return;
  }
  const lines = [
    `Konuşma: ${BUDDY} — ${todayDayMonth()} 2005`,
    "",
    ...messages.map((m) => {
      if (m.text === NUDGE) return `[${m.time}] *** Titreşim gönderdin.`;
      return `[${m.time}] ${m.role === "user" ? "Sen" : BUDDY}: ${m.text}`;
    }),
  ];
  downloadText("Konusma_EcE_2005.txt", lines.join("\r\n") + "\r\n", "text/plain");
});

export default {
  id: "2005",
  botName: "Ece",
  title: "~*~EcE~*~ ♥ ile Konuşma",
  warpText: "2005'e ışınlanılıyor...",
  site,
  chat,
  updateClock() {
    clockEl.textContent = currentTime();
    clockEl.title = `${todayDayMonth()} 2005`;
  },
};
