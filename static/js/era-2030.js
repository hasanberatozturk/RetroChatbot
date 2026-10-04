// 2030: Nova, kişisel yapay zeka asistanı. Cam efektli modern arayüz + sesli sohbet.
import { createChat, currentTime, downloadText, loadPreference, pad, savePreference, todayDayMonth } from "./core.js";
import { chime } from "./sound.js";

const site = document.getElementById("future-site");
const messagesEl = document.getElementById("future-messages");
const formEl = document.getElementById("future-form");
const inputEl = document.getElementById("future-input");
const sendButton = document.getElementById("future-send");
const micButton = document.getElementById("future-mic");
const speakButton = document.getElementById("future-speak");
const statusEl = document.getElementById("future-status");
const dateEl = document.getElementById("future-date");
const suggestionsEl = document.getElementById("future-suggestions");
const orbEl = site.querySelector(".f-orb");

function scroll() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addBubble(text, className) {
  const bubble = document.createElement("div");
  bubble.className = `f-msg ${className}`;
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  scroll();
  return bubble;
}

function setStatus(text) {
  const dot = document.createElement("span");
  dot.className = "f-dot";
  statusEl.replaceChildren(dot, text);
}

function greet() {
  messagesEl.replaceChildren();
  suggestionsEl.hidden = false;
  addBubble("Merhaba, ben Nova 👋 2030'dan selamlar! Bugün senin için ne yapabilirim?", "bot");
}

/* ---------- Sesli yanıt (konuşma sentezi) ---------- */

const canSpeak = "speechSynthesis" in window;
let speakEnabled = false;

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

/* ---------- Sohbet ---------- */

const chat = createChat({
  era: "2030",
  formEl,
  inputEl,
  ui: {
    networkErrorText: "Bağlantı kurulamadı. Birazdan tekrar dener misin?",
    addUser(text) {
      suggestionsEl.hidden = true;
      addBubble(text, "user");
    },
    addError: (text) => addBubble(text, "error"),
    renderSaved({ role, text }) {
      suggestionsEl.hidden = true;
      addBubble(text, role === "user" ? "user" : "bot");
    },
    reset: greet,
    startBot() {
      const element = addBubble("", "bot");
      const textNode = document.createTextNode("");
      element.appendChild(textNode);
      return { element, textNode };
    },
    scroll,
    typing: { minChars: 2, maxChars: 4, tickMs: 16 },
    onReceiving: () => setStatus("Yazıyor..."),
    onSend: stopSpeaking,
    onReply(text) {
      chime();
      speak(text);
    },
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
      inputEl.disabled = busy;
      sendButton.disabled = busy;
      micButton.disabled = busy;
      orbEl.classList.toggle("thinking", busy);
      setStatus(busy ? "Düşünüyor..." : "Çevrimiçi");
      if (!busy) inputEl.focus({ preventScroll: true });
    },
  },
});

suggestionsEl.querySelectorAll(".f-chip").forEach((chip) => {
  chip.addEventListener("click", () => chat.send(chip.textContent));
});

document.getElementById("future-clear").addEventListener("click", () => {
  if (chat.isBusy()) return;
  if (confirm("Yeni bir sohbet başlatılsın mı? Mevcut konuşma silinecek.")) {
    stopSpeaking();
    chat.clear();
  }
});

document.getElementById("future-export").addEventListener("click", () => {
  const messages = chat.getHistory();
  if (!messages.length) {
    addBubble("Henüz indirilecek bir sohbet yok. Bir şeyler sorarak başlayabilirsin!", "error");
    return;
  }
  const now = new Date();
  const lines = [`# Nova ile sohbet — ${todayDayMonth()} 2030`, ""];
  for (const m of messages) {
    lines.push(`**${m.role === "user" ? "Sen" : "Nova"}** · ${m.time || ""}`, "", m.text, "");
  }
  downloadText(
    `nova-sohbet-2030-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.md`,
    lines.join("\n"),
    "text/markdown"
  );
});

/* ---------- Mikrofon (konuşma tanıma, Chrome/Edge) ---------- */

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function stopListening() {
  if (recognition) recognition.stop();
}

if (SpeechRecognition) {
  micButton.hidden = false;
  micButton.addEventListener("click", () => {
    if (recognition) {
      recognition.stop();
      return;
    }
    if (chat.isBusy()) return;

    stopSpeaking();
    recognition = new SpeechRecognition();
    recognition.lang = "tr-TR";
    recognition.interimResults = true;
    let heard = false;
    let failed = false;

    recognition.onresult = (event) => {
      heard = true;
      inputEl.value = Array.from(event.results, (r) => r[0].transcript).join("");
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
      if (!chat.isBusy()) setStatus("Çevrimiçi");
      // Konuşma bittiyse mesajı otomatik gönder
      if (heard && !failed && inputEl.value.trim()) formEl.requestSubmit();
    };

    recognition.start();
    micButton.classList.add("listening");
    micButton.setAttribute("aria-label", "Dinlemeyi durdur");
    setStatus("Dinliyor...");
  });
}

export default {
  id: "2030",
  botName: "Nova",
  title: "Nova · 2030",
  warpText: "2030'a ışınlanılıyor...",
  site,
  chat,
  updateClock() {
    dateEl.textContent = `${todayDayMonth()} 2030 · ${currentTime()}`;
  },
  onLeave() {
    stopSpeaking();
    stopListening();
  },
};
