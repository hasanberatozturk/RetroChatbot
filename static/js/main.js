// Zaman makinesi: dönemler arası geçiş, saatler ve başlangıç
import { loadPreference, reduceMotion, savePreference } from "./core.js";
import era1975 from "./era-1975.js";
import era1998 from "./era-1998.js";
import era2005 from "./era-2005.js";
import era2030 from "./era-2030.js";
import era2077 from "./era-2077.js";

const ERAS = [era1975, era1998, era2005, era2030, era2077];
const DEFAULT_ERA = "1998";

const warpEl = document.getElementById("warp");
const warpTextEl = document.getElementById("warp-text");
let currentEra = null;
let switching = false;

function findEra(id) {
  return ERAS.find((era) => era.id === id);
}

/* ---------- Zaman makinesi menüsü ---------- */

// Her dönemin sayfasındaki [data-time-machine] alanına yıl butonlarını koyar
function buildTimeMachines() {
  document.querySelectorAll("[data-time-machine]").forEach((slot) => {
    const group = document.createElement("div");
    group.className = "tm";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Zaman makinesi");

    const label = document.createElement("span");
    label.className = "tm-label";
    label.textContent = "Zaman makinesi:";

    const years = document.createElement("div");
    years.className = "tm-years";
    for (const era of ERAS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tm-year";
      button.dataset.era = era.id;
      button.textContent = era.id;
      button.addEventListener("click", () => switchEra(era.id));
      years.appendChild(button);
    }

    group.append(label, years);
    slot.replaceChildren(group);
  });
}

function markCurrentYear(id) {
  document.querySelectorAll(".tm-year").forEach((button) => {
    const isCurrent = button.dataset.era === id;
    button.setAttribute("aria-current", String(isCurrent));
    button.disabled = isCurrent;
  });
}

/* ---------- Dönem değiştirme ---------- */

function applyEra(id) {
  const next = findEra(id);
  currentEra?.onLeave?.();
  for (const era of ERAS) era.site.hidden = era !== next;
  document.body.className = `era-${next.id}`;
  document.title = next.title;
  currentEra = next;
  markCurrentYear(next.id);
  next.updateClock?.(new Date());
  next.onEnter?.();
  savePreference("last-era", next.id);
  window.scrollTo(0, 0);
  next.chat.focus();
}

function switchEra(id) {
  if (switching || id === currentEra?.id) return;
  if (reduceMotion) {
    applyEra(id);
    return;
  }

  switching = true;
  warpTextEl.textContent = findEra(id).warpText;
  // Animasyonu baştan başlatmak için öğeyi yeniden göster
  warpEl.hidden = true;
  void warpEl.offsetWidth;
  warpEl.hidden = false;

  // Ekran tamamen kararınca arayüzü değiştir, animasyon bitince perdeyi kaldır
  setTimeout(() => applyEra(id), 600);
  setTimeout(() => {
    warpEl.hidden = true;
    switching = false;
  }, 1400);
}

document.getElementById("modernize-btn").addEventListener("click", () => switchEra("2030"));

/* ---------- Başlangıç ---------- */

buildTimeMachines();
for (const era of ERAS) era.chat.restore();

// Saat göstergeleri: bugünün gün/ay/saati, yıl ise her dönemin kendi yılı
setInterval(() => currentEra?.updateClock?.(new Date()), 15 * 1000);

applyEra(findEra(loadPreference("last-era")) ? loadPreference("last-era") : DEFAULT_ERA);
