// Dönem sesleri: hepsi Web Audio API ile kodla üretilir, ses dosyası yok.
// Sesler varsayılan olarak kapalıdır; zaman makinesindeki hoparlör butonuyla açılır.
import { loadPreference, savePreference } from "./core.js";

let ctx = null;
let noise = null;
let enabled = loadPreference("sound") === "1";
const listeners = new Set();

function audio() {
  if (!ctx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function noiseBuffer(ac) {
  if (!noise) {
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

export function isSoundOn() {
  return enabled;
}

export function setSoundOn(value) {
  enabled = value;
  savePreference("sound", value ? "1" : "0");
  if (value) audio(); // Kullanıcı tıklamasıyla ses motorunu başlat (tarayıcı kuralı)
  listeners.forEach((fn) => fn(value));
}

export function onSoundChange(fn) {
  listeners.add(fn);
}

/* ---------- Yapı taşları ---------- */

function tone(ac, freq, start, duration, { type = "sine", gain = 0.1, attack = 0.005, out } = {}) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g).connect(out || ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
  return osc;
}

function noiseBurst(ac, start, duration, { freq = 2500, q = 1.2, gain = 0.2 } = {}) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(start, Math.random() * 0.5);
  src.stop(start + duration + 0.02);
}

// Sadece ses açıksa çalıştırır
function play(fn) {
  if (!enabled) return;
  const ac = audio();
  if (ac) fn(ac, ac.currentTime + 0.01);
}

/* ---------- 1975: daktilo ---------- */

let lastKey = 0;

export function typewriterKey() {
  play((ac, t) => {
    if (t - lastKey < 0.045) return; // Çok sık tıklamasın
    lastKey = t;
    noiseBurst(ac, t, 0.035, { freq: 1800 + Math.random() * 1400, gain: 0.35 });
    tone(ac, 140 + Math.random() * 30, t, 0.04, { gain: 0.12 });
  });
}

export function typewriterBell() {
  play((ac, t) => {
    tone(ac, 2093, t, 1.2, { gain: 0.1 });
    tone(ac, 3136, t, 0.7, { gain: 0.04 });
  });
}

/* ---------- 1998: dial-up modem ---------- */

const DTMF = {
  1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336],
  6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], 0: [941, 1336],
};

export function modem() {
  play((ac, t) => {
    const vol = 0.05;
    // Çevir sesi
    tone(ac, 350, t, 0.5, { gain: vol });
    tone(ac, 440, t, 0.5, { gain: vol });
    // Numarayı tuşla
    let at = t + 0.6;
    for (const digit of "4447575") {
      for (const f of DTMF[digit]) tone(ac, f, at, 0.08, { gain: vol });
      at += 0.12;
    }
    // Karşı modemin cevap tonu
    at += 0.3;
    tone(ac, 2100, at, 0.5, { gain: vol * 0.8 });
    at += 0.55;
    // El sıkışma: hızlı değişen tonlar ve hışırtı
    for (let i = 0; i < 28; i++) {
      tone(ac, 900 + Math.random() * 1600, at + i * 0.04, 0.05, { type: "square", gain: vol * 0.35 });
    }
    noiseBurst(ac, at, 1.2, { freq: 1800, q: 0.6, gain: vol * 1.2 });
  });
}

/* ---------- 1998: MIDI çalar (basit chiptune döngüsü) ---------- */

const EIGHTH = 60 / 132 / 2; // 132 BPM'de sekizlik nota süresi
// [MIDI nota, sekizlik sayısı]; 4 ölçülük döngü
const MELODY = [
  [72, 1], [76, 1], [79, 1], [76, 1], [77, 1], [81, 1], [79, 2],
  [76, 1], [79, 1], [84, 1], [79, 1], [77, 1], [74, 1], [76, 2],
  [72, 1], [76, 1], [79, 1], [76, 1], [77, 1], [81, 1], [79, 1], [77, 1],
  [76, 1], [74, 1], [71, 1], [74, 1], [72, 4],
];
const BASS = [48, 55, 48, 55, 53, 48, 53, 48, 48, 55, 48, 55, 43, 50, 48, 48]; // dörtlük notalar
const LOOP_LENGTH = 32 * EIGHTH;

let music = null; // { gain, timer }

function midiToFreq(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function scheduleLoop(ac, out, start) {
  let at = start;
  for (const [note, length] of MELODY) {
    tone(ac, midiToFreq(note), at, length * EIGHTH * 0.9, { type: "square", gain: 0.05, out });
    at += length * EIGHTH;
  }
  BASS.forEach((note, i) => {
    tone(ac, midiToFreq(note), start + i * 2 * EIGHTH, 2 * EIGHTH * 0.8, { type: "triangle", gain: 0.09, out });
  });
}

export function isMusicPlaying() {
  return music !== null;
}

export function startMusic() {
  const ac = audio();
  if (!ac || music) return;
  const gain = ac.createGain();
  gain.connect(ac.destination);
  let next = ac.currentTime + 0.1;

  const queue = () => {
    scheduleLoop(ac, gain, next);
    next += LOOP_LENGTH;
    // Sıradaki döngüyü bu döngü bitmeden planla
    music.timer = setTimeout(queue, (next - ac.currentTime - 0.5) * 1000);
  };
  music = { gain, timer: null };
  queue();
}

export function stopMusic() {
  if (!music) return;
  clearTimeout(music.timer);
  music.gain.gain.setValueAtTime(0, ctx.currentTime);
  music.gain.disconnect();
  music = null;
}

/* ---------- 2005: anlık mesaj ---------- */

export function messengerDing() {
  play((ac, t) => {
    tone(ac, 988, t, 0.25, { type: "triangle", gain: 0.14 });
    tone(ac, 1319, t + 0.12, 0.45, { type: "triangle", gain: 0.14 });
  });
}

export function nudgeBuzz() {
  play((ac, t) => {
    const osc = ac.createOscillator();
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    const g = ac.createGain();
    osc.type = "square";
    osc.frequency.value = 70;
    lfo.frequency.value = 24;
    lfoGain.gain.value = 0.06;
    g.gain.value = 0.06;
    lfo.connect(lfoGain).connect(g.gain);
    osc.connect(g).connect(ac.destination);
    g.gain.setValueAtTime(0.06, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.6);
    lfo.stop(t + 0.6);
  });
}

/* ---------- 2030: yumuşak bildirim ---------- */

export function chime() {
  play((ac, t) => {
    [784, 988, 1175].forEach((f, i) => tone(ac, f, t + i * 0.07, 0.8, { gain: 0.05, attack: 0.02 }));
  });
}

/* ---------- 2077: sentetik blip ---------- */

export function blip() {
  play((ac, t) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.16);
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.2);
    tone(ac, 2600, t + 0.02, 0.04, { type: "square", gain: 0.03 });
  });
}
