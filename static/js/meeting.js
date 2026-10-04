// Zaman buluşması: iki farklı dönemin botu birbiriyle sohbet eder.
// Her bot kendi yılında yaşadığından emindir; karşısındakini kendi döneminin gözüyle yorumlar.
import { createTyper, readEvents } from "./core.js";

const TURNS = 6; // Toplam mesaj sayısı; her mesaj bir Gemini isteği demek
const MAX_MESSAGE_LENGTH = 1900; // Backend sınırı 2000

const dialog = document.getElementById("meet-dialog");
const form = document.getElementById("meet-form");
const selectA = document.getElementById("meet-a");
const selectB = document.getElementById("meet-b");
const topicInput = document.getElementById("meet-topic");
const startButton = document.getElementById("meet-start");
const stopButton = document.getElementById("meet-stop");
const logEl = document.getElementById("meet-log");

let eras = [];
let controller = null; // Çalışan buluşmayı durdurmak için

function scroll() {
  logEl.scrollTop = logEl.scrollHeight;
}

function addNote(text, className = "meet-note-line") {
  const line = document.createElement("p");
  line.className = className;
  line.textContent = text;
  logEl.appendChild(line);
  scroll();
}

function addMessage(era, side) {
  const msg = document.createElement("div");
  msg.className = `meet-msg side-${side} era-${era.id} streaming`;
  const who = document.createElement("div");
  who.className = "meet-who";
  who.textContent = `${era.botName} · ${era.id}`;
  const text = document.createElement("div");
  text.className = "meet-text";
  const textNode = document.createTextNode("");
  text.appendChild(textNode);
  msg.append(who, text);
  logEl.appendChild(msg);
  scroll();
  return { msg, textNode };
}

function sceneText(speaker, other, topic) {
  return (
    `(Sahne: Garip bir zaman yarığı açıldı! ${other.id} yılından "${other.botName}" adında ` +
    "biriyle bağlantı kuruldu ve onunla mesajlaşıyorsun. Kendi yılında yaşadığından eminsin; " +
    "karakterinden çıkma, onun anlattıklarına kendi döneminin gözüyle tepki ver ve kısa yaz." +
    (topic ? ` Sohbetin konusu: ${topic}.` : "") +
    ")"
  );
}

/**
 * Sıradaki konuşmacı için isteği kurar. Konuşmacının kendi mesajları "model",
 * karşı tarafınkiler "user" rolünde olur. İlk user mesajı sahne açıklamasını içerir.
 */
function buildRequest(transcript, turn, speaker, other, topic) {
  const startsConversation = turn % 2 === 0;
  const scene = sceneText(speaker, other, topic);
  const messages = startsConversation
    ? [{ role: "user", text: `${scene} Ona ilk mesajını yaz.` }]
    : [{ role: "user", text: `${scene}\n\n${other.botName}: ${transcript[0]}` }];

  for (let j = startsConversation ? 0 : 1; j < turn; j++) {
    const ownMessage = j % 2 === turn % 2;
    messages.push({ role: ownMessage ? "model" : "user", text: transcript[j] });
  }

  const last = messages.pop();
  return {
    message: last.text.slice(0, MAX_MESSAGE_LENGTH),
    history: messages.map((m) => ({ role: m.role, text: m.text.slice(0, 3900) })),
  };
}

async function streamTurn(speaker, side, request, signal) {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, era: speaker.id }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === "string" ? data.detail : `Sunucu hatası (${res.status})`);
  }

  const { msg, textNode } = addMessage(speaker, side);
  const typer = createTyper(textNode, scroll, { minChars: 2, maxChars: 4, tickMs: 18 });
  let reply = "";
  let finished = false;
  try {
    for await (const event of readEvents(res)) {
      if (event.type === "chunk") {
        reply += event.text;
        typer.push(event.text);
      } else if (event.type === "error") {
        throw new Error(event.message);
      } else if (event.type === "done") {
        finished = true;
      }
    }
  } finally {
    await typer.end();
    msg.classList.remove("streaming");
  }
  if (!finished) throw new Error("Bağlantı yarıda kesildi.");
  return reply;
}

function setRunning(running) {
  startButton.disabled = running;
  selectA.disabled = running;
  selectB.disabled = running;
  topicInput.disabled = running;
  stopButton.hidden = !running;
}

async function run(a, b, topic) {
  controller = new AbortController();
  const { signal } = controller;
  setRunning(true);
  logEl.replaceChildren();
  addNote(`⚡ Zaman yarığı açıldı: ${a.botName} (${a.id}) ⇄ ${b.botName} (${b.id})`);

  const transcript = [];
  try {
    for (let turn = 0; turn < TURNS; turn++) {
      const [speaker, other, side] = turn % 2 === 0 ? [a, b, "a"] : [b, a, "b"];
      const request = buildRequest(transcript, turn, speaker, other, topic);
      transcript.push(await streamTurn(speaker, side, request, signal));
    }
    addNote("⚡ Zaman yarığı kapandı.");
  } catch (error) {
    if (signal.aborted) addNote("Buluşma durduruldu.");
    else addNote(`Hata: ${error.message}`, "meet-note-line meet-error");
  } finally {
    controller = null;
    setRunning(false);
  }
}

function fillSelect(select, selectedId) {
  select.replaceChildren(
    ...eras.map((era) => new Option(`${era.id} · ${era.botName}`, era.id, false, era.id === selectedId))
  );
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (controller) return;
  const a = eras.find((e) => e.id === selectA.value);
  const b = eras.find((e) => e.id === selectB.value);
  if (a === b) {
    addNote("İki farklı dönem seç; bir bot kendisiyle buluşamaz :)", "meet-note-line meet-error");
    return;
  }
  run(a, b, topicInput.value.trim());
});

stopButton.addEventListener("click", () => controller?.abort());
document.getElementById("meet-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => controller?.abort());

// Arka plana (pencere dışına) tıklayınca kapat
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

export function setupMeeting(allEras) {
  eras = allEras;
}

export function openMeeting(currentId) {
  if (!dialog.open) {
    const other = currentId === "2030" ? "1998" : "2030";
    if (!controller) {
      fillSelect(selectA, currentId);
      fillSelect(selectB, other);
    }
    dialog.showModal();
  }
}
