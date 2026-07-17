"use client";

// Sinalização sonora e visual do fim do timer.
// Som gerado pela Web Audio API (sem arquivo externo). O AudioContext é
// criado/retomado num gesto do usuário (unlockAudio) para que o som
// funcione depois, mesmo com a aba em segundo plano.

let ctx: AudioContext | null = null;
let blinkInterval: ReturnType<typeof setInterval> | null = null;
let originalTitle = "";

export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
}

function beep(atTime: number, freq: number, dur: number, volume: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, atTime);
  gain.gain.exponentialRampToValueAtTime(volume, atTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, atTime + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(atTime);
  osc.stop(atTime + dur + 0.05);
}

/** Toca o alerta: 3 repetições de duas notas ascendentes. */
export function playAlarm(volume = 0.8) {
  unlockAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    beep(t0 + i * 0.6, 880, 0.18, volume);
    beep(t0 + i * 0.6 + 0.2, 1320, 0.25, volume);
  }
}

export function startTitleBlink(text = "🔔 Hora de disparar") {
  if (blinkInterval) return;
  originalTitle = document.title;
  let on = false;
  blinkInterval = setInterval(() => {
    document.title = on ? originalTitle : text;
    on = !on;
  }, 900);
}

export function stopTitleBlink() {
  if (blinkInterval) {
    clearInterval(blinkInterval);
    blinkInterval = null;
    if (originalTitle) document.title = originalTitle;
  }
}

export async function requestNotifyPermission() {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

export function notify(title: string, body: string) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/favicon.ico" });
    } catch {
      // alguns browsers exigem service worker; o som e o título já cobrem
    }
  }
}
