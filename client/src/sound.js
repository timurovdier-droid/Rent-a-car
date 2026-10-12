// Звуки рисуются синтезатором браузера — без файлов. Браузер разрешает звук только после первого касания страницы.
const KEY = 'rac-sound';
let ctx = null;

export function soundOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function setSoundOn(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* приватный режим */ }
}

function audio() {
  if (!soundOn()) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function note(ac, freq, start, length, volume, type = 'sine') {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

// Короткий мягкий щелчок при нажатии
export function playTap() {
  const ac = audio();
  if (!ac) return;
  note(ac, 1800, ac.currentTime, 0.035, 0.05, 'triangle');
}

// Новая оплата от водителя: два восходящих тона
export function playChime() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  note(ac, 880, t, 0.25, 0.22);
  note(ac, 1320, t + 0.14, 0.4, 0.2);
}

// Напоминание о долге: три настойчивых тона
export function playAlert() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [0, 0.22, 0.44].forEach((d) => note(ac, 740, t + d, 0.16, 0.25, 'square'));
}
