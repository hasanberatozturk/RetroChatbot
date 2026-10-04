// Sürpriz özellikler: mavi ekran (BSOD), Konami kodu ve 90'lar yıldız izi
import { reduceMotion } from "./core.js";

/* ---------- Mavi ekran ---------- */

const BSOD_TEXT = {
  // Windows 95/98 tarzı
  "98": {
    title: "Windows",
    body:
      "Ölümcül bir istisna oluştu: 0E, 0028:C0011E36 adresinde VXD VMM(01) + 00010E36. " +
      "Geçerli uygulama sonlandırılacak.\n\n" +
      "*  Geçerli uygulamayı sonlandırmak için herhangi bir tuşa basın.\n" +
      "*  Bilgisayarınızı yeniden başlatmak için CTRL+ALT+DEL tuşlarına basın. " +
      "Kaydedilmemiş bilgileriniz kaybolacak.",
    footer: "Devam etmek için herhangi bir tuşa basın _",
  },
  // Windows XP tarzı
  xp: {
    title: "",
    body:
      "Bir sorun algılandı ve bilgisayarınıza zarar gelmemesi için Windows kapatıldı.\n\n" +
      "FORMAT_C_ICIN_COK_GENCSIN\n\n" +
      "Bu hata ekranını ilk kez görüyorsanız bilgisayarınızı yeniden başlatın. " +
      "Bu ekran yeniden görünürse şu adımları izleyin:\n\n" +
      "Yeni yüklenen donanım veya yazılımları kontrol edin. MSN'de herkese " +
      "\"bilgisayarım bozuldu\" diye haber vermeyi unutmayın.\n\n" +
      "Teknik bilgi:\n\n" +
      "*** STOP: 0x000000D1 (0x0000000C, 0x00000002, 0x00000000, 0xF86B5A89)",
    footer: "Devam etmek için herhangi bir tuşa basın.",
  },
};

export function isFormatCommand(text) {
  return /^format\s+c:?\s*$/i.test(text.trim());
}

// Mavi ekranı gösterir; herhangi bir tuş ya da tıklama ile kapanır
export function showBsod(style, onClose) {
  const content = BSOD_TEXT[style];
  const overlay = document.createElement("div");
  overlay.className = `bsod bsod-${style}`;
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-label", "Mavi ekran hatası");
  overlay.tabIndex = -1;

  const inner = document.createElement("div");
  inner.className = "bsod-inner";
  if (content.title) {
    const title = document.createElement("div");
    title.className = "bsod-title";
    title.textContent = content.title;
    inner.appendChild(title);
  }
  const body = document.createElement("pre");
  body.className = "bsod-body";
  body.textContent = content.body;
  const footer = document.createElement("div");
  footer.className = "bsod-footer";
  footer.textContent = content.footer;
  inner.append(body, footer);
  overlay.appendChild(inner);

  const close = (event) => {
    event.preventDefault();
    overlay.remove();
    document.removeEventListener("keydown", close, true);
    onClose?.();
  };
  // Mesajı gönderen Enter tuşu ekranı hemen kapatmasın
  setTimeout(() => {
    document.addEventListener("keydown", close, true);
    overlay.addEventListener("click", close);
  }, 300);

  document.body.appendChild(overlay);
  overlay.focus();
}

/* ---------- Toast bildirimi ---------- */

function toast(text) {
  const el = document.createElement("div");
  el.className = "egg-toast";
  el.setAttribute("role", "status");
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------- Konami kodu: ↑↑↓↓←→←→BA ---------- */

const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a",
];

export function setupKonami() {
  let position = 0;
  document.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    position = key === KONAMI[position] ? position + 1 : key === KONAMI[0] ? 1 : 0;
    if (position < KONAMI.length) return;
    position = 0;
    const on = document.documentElement.classList.toggle("party");
    toast(on ? "🎮 GİZLİ MOD AÇILDI: Disko Topu! 🪩" : "🎮 Disko modu kapandı");
  });
}

/* ---------- 90'lar fare yıldız izi ---------- */

const STAR_COLORS = ["#ffff00", "#ff00ff", "#00ffff", "#ffffff", "#ff6600"];

export function setupStarTrail(isActive) {
  // Dokunmatik ekranlarda ve "azaltılmış hareket" tercihinde kapalı
  if (reduceMotion || !window.matchMedia("(pointer: fine)").matches) return;
  let last = 0;
  document.addEventListener("mousemove", (event) => {
    if (!isActive() || event.timeStamp - last < 40) return;
    last = event.timeStamp;
    const star = document.createElement("span");
    star.className = "star-trail";
    star.textContent = Math.random() < 0.5 ? "✦" : "★";
    star.style.left = `${event.clientX}px`;
    star.style.top = `${event.clientY}px`;
    star.style.color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    star.addEventListener("animationend", () => star.remove());
    document.body.appendChild(star);
  });
}
