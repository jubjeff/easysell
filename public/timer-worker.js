// Timer da sessão de disparo.
// Roda em Web Worker para não sofrer o throttling que o browser aplica
// a setInterval na thread principal quando a aba está em segundo plano.
// Baseado em deadline (timestamp), então nunca "atrasa" — no máximo o
// tick visual fica menos frequente, mas o alarme dispara na hora certa.

let interval = null;
let deadline = null;

function tick() {
  if (deadline == null) return;
  const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  postMessage({ type: "tick", remaining });
  if (remaining <= 0) {
    clearInterval(interval);
    interval = null;
    deadline = null;
    postMessage({ type: "done" });
  }
}

onmessage = (e) => {
  const { cmd, seconds } = e.data;
  if (cmd === "start") {
    deadline = Date.now() + seconds * 1000;
    if (interval) clearInterval(interval);
    interval = setInterval(tick, 250);
    tick();
  } else if (cmd === "extend") {
    if (deadline != null) deadline += seconds * 1000;
    tick();
  } else if (cmd === "stop") {
    if (interval) clearInterval(interval);
    interval = null;
    const remaining =
      deadline != null ? Math.max(0, Math.round((deadline - Date.now()) / 1000)) : 0;
    deadline = null;
    postMessage({ type: "stopped", remaining });
  }
};
