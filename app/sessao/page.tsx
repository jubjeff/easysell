"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { waLink, formatPhone } from "@/lib/phone";
import {
  unlockAudio,
  playAlarm,
  startTitleBlink,
  stopTitleBlink,
  requestNotifyPermission,
  notify,
} from "@/lib/alarm";

type Phase = "ready" | "waiting" | "alarm" | "done";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export default function SessaoPage() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [limits, setLimits] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [chips, setChips] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [remaining, setRemaining] = useState(0);
  const [drawnInterval, setDrawnInterval] = useState(0);
  const [msgDraft, setMsgDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // form de nova sessão
  const [formCampaign, setFormCampaign] = useState("");
  const [formChip, setFormChip] = useState("");
  const [formTipo, setFormTipo] = useState<"disparo" | "aquecimento">("disparo");
  const [formMeta, setFormMeta] = useState(10);
  const [formMin, setFormMin] = useState(3);
  const [formMax, setFormMax] = useState(9);

  const workerRef = useRef<Worker | null>(null);
  const pausedRemaining = useRef<number>(0);

  const pending = queue.filter((q) => q.status === "pendente");
  const current = pending[0] ?? null;
  const enviados = queue.filter((q) => q.status === "enviado").length;
  const paused = session?.status === "pausada";

  const timerKey = session ? `easysell_deadline_${session.id}` : null;

  // ---------- worker ----------
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker("/timer-worker.js");
      workerRef.current.onmessage = (e) => {
        if (e.data.type === "tick") setRemaining(e.data.remaining);
        if (e.data.type === "done") {
          setPhase("alarm");
          playAlarm();
          startTitleBlink();
          notify("EasySell", "🔔 Hora de disparar a próxima mensagem!");
        }
      };
    }
    return workerRef.current;
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      stopTitleBlink();
    };
  }, []);

  const startTimer = useCallback(
    (seconds: number, sessId: string) => {
      setDrawnInterval(seconds);
      setRemaining(seconds);
      setPhase("waiting");
      localStorage.setItem(`easysell_deadline_${sessId}`, String(Date.now() + seconds * 1000));
      getWorker().postMessage({ cmd: "start", seconds });
    },
    [getWorker]
  );

  // ---------- carregamento ----------
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sRes, cRes, chRes] = await Promise.all([
        fetch("/api/sessions"),
        fetch("/api/campaigns"),
        fetch("/api/chips"),
      ]);
      const sData = await sRes.json();
      const cData = await cRes.json();
      const chData = await chRes.json();
      setCampaigns((cData.campaigns ?? []).filter((c: any) => c.ativa));
      setChips((chData.chips ?? []).filter((c: any) => c.ativo));
      if (sData.error || cData.error || chData.error) {
        setError(sData.error ?? cData.error ?? chData.error);
      } else if (sData.session) {
        setSession(sData.session);
        setQueue(sData.queue);
        setLimits(sData.limits);
        const first = (sData.queue ?? []).find((q: any) => q.status === "pendente");
        setMsgDraft(first?.mensagem ?? "");
        // restaura timer de um reload
        const stored = localStorage.getItem(`easysell_deadline_${sData.session.id}`);
        if (stored && sData.session.status === "ativa") {
          const rem = Math.round((Number(stored) - Date.now()) / 1000);
          if (rem > 0) {
            setDrawnInterval(rem);
            setRemaining(rem);
            setPhase("waiting");
            getWorker().postMessage({ cmd: "start", seconds: rem });
          } else {
            localStorage.removeItem(`easysell_deadline_${sData.session.id}`);
          }
        }
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setLoading(false);
  }, [getWorker]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (current) setMsgDraft(current.mensagem);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- ações ----------
  async function createSession(overrideJanela = false) {
    setBusy(true);
    setError("");
    unlockAudio();
    await requestNotifyPermission();
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: formCampaign,
        chip_id: formChip,
        tipo: formTipo,
        meta_do_dia: formMeta,
        intervalo_min_s: formMin * 60,
        intervalo_max_s: formMax * 60,
        override_janela: overrideJanela,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      if (data.code === "fora_da_janela") {
        if (confirm(data.error + "\n\nIniciar mesmo assim?")) return createSession(true);
        return;
      }
      setError(data.error ?? "Erro ao criar sessão.");
      return;
    }
    await load();
  }

  async function resolveItem(action: "enviado" | "numero_invalido" | "pulado") {
    if (!current || busy) return;
    setBusy(true);
    unlockAudio();
    stopTitleBlink();

    // salva edição pendente antes de resolver
    if (action === "enviado" && msgDraft.trim() && msgDraft !== current.mensagem) {
      await fetch(`/api/queue/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "editar", mensagem: msgDraft }),
      });
    }
    const res = await fetch(`/api/queue/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Erro.");
      return;
    }

    const newQueue = queue.map((q) => (q.id === current.id ? { ...q, status: action } : q));
    setQueue(newQueue);
    const newEnviados = newQueue.filter((q) => q.status === "enviado").length;
    const restantes = newQueue.filter((q) => q.status === "pendente");
    const totalHoje = (limits?.hoje ?? 0) + newEnviados;

    // fila acabou ou limite diário do chip atingido -> encerra
    if (restantes.length === 0 || (action === "enviado" && totalHoje >= (limits?.diario ?? Infinity))) {
      await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "concluida" }),
      });
      if (timerKey) localStorage.removeItem(timerKey);
      getWorker().postMessage({ cmd: "stop" });
      setPhase("done");
      return;
    }

    if (action === "enviado") {
      // sorteia o próximo intervalo dentro da faixa configurada
      const min = session.intervalo_min_s;
      const max = session.intervalo_max_s;
      const seconds = Math.floor(min + Math.random() * (max - min + 1));
      startTimer(seconds, session.id);
    } else {
      // inválido/pulado não conta como envio: vai direto para o próximo
      setPhase("ready");
    }
  }

  async function copyMessage() {
    if (!current) return;
    unlockAudio();
    const text = msgDraft.trim() || current.mensagem;
    await navigator.clipboard.writeText(text);
    if (msgDraft !== current.mensagem && msgDraft.trim()) {
      await fetch(`/api/queue/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "editar", mensagem: msgDraft }),
      });
      setQueue(queue.map((q) => (q.id === current.id ? { ...q, mensagem: msgDraft } : q)));
    }
    fetch(`/api/queue/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "copiada" }),
    });
  }

  async function regenerate() {
    if (!current || busy) return;
    setBusy(true);
    const res = await fetch(`/api/queue/${current.id}/regenerate`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setQueue(queue.map((q) => (q.id === current.id ? { ...q, mensagem: data.item.mensagem } : q)));
      setMsgDraft(data.item.mensagem);
    }
  }

  async function togglePause() {
    if (!session) return;
    const novo = paused ? "ativa" : "pausada";
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: novo }),
    });
    if (novo === "pausada") {
      pausedRemaining.current = remaining;
      getWorker().postMessage({ cmd: "stop" });
      if (timerKey) localStorage.removeItem(timerKey);
      stopTitleBlink();
    } else if (phase === "waiting" && pausedRemaining.current > 0) {
      startTimer(pausedRemaining.current, session.id);
    }
    setSession({ ...session, status: novo });
  }

  async function endSession() {
    if (!session) return;
    if (!confirm("Encerrar a sessão agora?")) return;
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "encerrada" }),
    });
    if (timerKey) localStorage.removeItem(timerKey);
    getWorker().postMessage({ cmd: "stop" });
    stopTitleBlink();
    setPhase("done");
  }

  function delay2min() {
    getWorker().postMessage({ cmd: "extend", seconds: 120 });
    if (timerKey) {
      const stored = Number(localStorage.getItem(timerKey) ?? Date.now());
      localStorage.setItem(timerKey, String(stored + 120000));
    }
    if (phase === "alarm") {
      stopTitleBlink();
      startTimer(120, session.id);
    }
  }

  function goNext() {
    stopTitleBlink();
    setPhase("ready");
  }

  // ---------- render ----------
  if (loading) return <p className="text-zinc-500">Carregando…</p>;

  // resumo final
  if (session && (phase === "done" || ["encerrada", "concluida"].includes(session.status))) {
    const invalidos = queue.filter((q) => q.status === "numero_invalido").length;
    const pulados = queue.filter((q) => q.status === "pulado").length;
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-bold">Resumo da sessão</h1>
        <div className="card grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold text-emerald-400">{enviados}</div>
            <div className="text-xs text-zinc-400">enviadas</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-zinc-300">{pending.length}</div>
            <div className="text-xs text-zinc-400">restantes na fila</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-red-400">{invalidos}</div>
            <div className="text-xs text-zinc-400">números inválidos</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-amber-400">{pulados}</div>
            <div className="text-xs text-zinc-400">pulados</div>
          </div>
        </div>
        <button
          className="btn-primary w-full"
          onClick={() => {
            setSession(null);
            setQueue([]);
            setPhase("ready");
            load();
          }}
        >
          Nova sessão
        </button>
      </div>
    );
  }

  // sem sessão: formulário
  if (!session) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-bold">Nova sessão</h1>
        {error && <p className="card border-red-900 text-red-300 text-sm">{error}</p>}
        {chips.length === 0 ? (
          <p className="card text-sm text-zinc-400">
            Nenhum chip cadastrado. Cadastre um na aba <b>Chips</b> primeiro.
          </p>
        ) : campaigns.length === 0 ? (
          <p className="card text-sm text-zinc-400">
            Nenhuma campanha ativa. Crie uma na aba <b>Campanhas</b> primeiro.
          </p>
        ) : (
          <div className="card space-y-4">
            <div>
              <label className="label">Tipo de sessão</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`badge cursor-pointer border px-3 py-2 flex-1 justify-center ${
                    formTipo === "disparo"
                      ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}
                  onClick={() => setFormTipo("disparo")}
                >
                  🚀 Disparo
                </button>
                <button
                  type="button"
                  className={`badge cursor-pointer border px-3 py-2 flex-1 justify-center ${
                    formTipo === "aquecimento"
                      ? "bg-amber-900/60 text-amber-300 border-amber-700"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}
                  onClick={() => {
                    setFormTipo("aquecimento");
                    setFormMin(5);
                    setFormMax(15);
                  }}
                >
                  🔥 Aquecimento
                </button>
              </div>
              {formTipo === "aquecimento" && (
                <p className="text-xs text-amber-300/80 mt-1.5">
                  Ritmo bem mais lento — usa a fila normal de leads, mas respeita o teto de
                  aquecimento definido em Configurações, mesmo para chips já maduros.
                </p>
              )}
            </div>
            <div>
              <label className="label">Chip</label>
              <select className="input" value={formChip} onChange={(e) => setFormChip(e.target.value)}>
                <option value="">Selecione…</option>
                {chips.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} — {c.hoje}/{c.limite_diario_override ?? c.preset.limite} hoje ·{" "}
                    {c.preset.fase}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Campanha</label>
              <select
                className="input"
                value={formCampaign}
                onChange={(e) => setFormCampaign(e.target.value)}
              >
                <option value="">Selecione…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.nicho} · {c.cidade})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Meta do dia (mensagens)</label>
              <input
                type="number"
                min={1}
                className="input"
                value={formMeta}
                onChange={(e) => setFormMeta(Number(e.target.value))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Intervalo mín. (min)</label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={formMin}
                  onChange={(e) => setFormMin(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Intervalo máx. (min)</label>
                <input
                  type="number"
                  min={formMin}
                  className="input"
                  value={formMax}
                  onChange={(e) => setFormMax(Number(e.target.value))}
                />
              </div>
            </div>
            <button
              className="btn-primary w-full"
              disabled={!formCampaign || !formChip || busy || formMax < formMin}
              onClick={() => createSession()}
            >
              {busy ? "Montando fila…" : formTipo === "aquecimento" ? "🔥 Iniciar aquecimento" : "🚀 Iniciar sessão"}
            </button>
          </div>
        )}
      </div>
    );
  }

  const lead = current?.leads;
  const posicaoAtual = queue.length - pending.length + 1;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">
          {session.tipo === "aquecimento" ? "🔥 Aquecimento" : "🚀 Sessão"} ·{" "}
          {session.campaigns?.nome ?? ""}
          <span className="ml-2 text-sm font-normal text-zinc-400">
            ({session.chips?.nome ?? "chip"})
          </span>
          {paused && <span className="ml-2 badge bg-amber-900/50 text-amber-300">pausada</span>}
        </h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={togglePause}>
            {paused ? "▶ Retomar" : "⏸ Pausar"}
          </button>
          <button className="btn-danger" onClick={endSession}>
            Encerrar
          </button>
        </div>
      </div>

      {/* progresso */}
      <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm">
        <span>
          Lead <b>{posicaoAtual}</b> de <b>{queue.length}</b>
        </span>
        <span>
          Enviadas hoje:{" "}
          <b className="text-emerald-400">{(limits?.hoje ?? 0) + enviados}</b> / {limits?.diario}
        </span>
      </div>
      {error && <p className="card border-red-900 text-red-300 text-sm">{error}</p>}

      {/* timer */}
      {(phase === "waiting" || phase === "alarm") && !paused && (
        <div
          className={`card text-center py-8 ${
            phase === "alarm" ? "border-emerald-500 bg-emerald-950/40" : ""
          }`}
        >
          {phase === "waiting" ? (
            <>
              <div className="text-6xl font-mono font-bold tabular-nums">{fmt(remaining)}</div>
              <p className="text-sm text-zinc-400 mt-2">
                Intervalo sorteado: {fmt(drawnInterval)} · próximo lead ao zerar
              </p>
              <button className="btn-secondary mt-4" onClick={delay2min}>
                +2 min (estou ocupado)
              </button>
            </>
          ) : (
            <>
              <div className="text-4xl font-bold text-emerald-400">🔔 Hora de disparar!</div>
              <div className="flex gap-3 justify-center mt-6">
                <button className="btn-primary" onClick={goNext}>
                  Ir para o próximo lead →
                </button>
                <button className="btn-secondary" onClick={delay2min}>
                  +2 min
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* card do lead atual */}
      {current && phase === "ready" && !paused && (
        <div className="card space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold">{lead?.nome}</h2>
              <p className="text-sm text-zinc-400">
                {lead?.cidade} · {lead?.nicho} · {formatPhone(lead?.telefone ?? "")}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {lead?.rating ? `${lead.rating}⭐ (${lead.qtd_avaliacoes} avaliações) · ` : ""}
                template: {current.templates?.nome}
                {current.editada && " · editada"}
              </p>
            </div>
            <span className="badge bg-emerald-900/60 text-emerald-300">score {lead?.score}</span>
          </div>

          <div>
            <label className="label">Mensagem (edite à vontade antes de copiar)</label>
            <textarea
              className="input min-h-36 font-mono text-sm leading-relaxed"
              rows={7}
              value={msgDraft}
              onChange={(e) => setMsgDraft(e.target.value)}
            />
            <button className="text-xs text-zinc-400 hover:text-zinc-200 mt-1" onClick={regenerate}>
              🔄 Regenerar variação
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={copyMessage}>
              📋 Copiar mensagem
            </button>
            <a
              className="btn-primary"
              href={waLink(lead?.telefone ?? "", msgDraft)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => copyMessage()}
            >
              🟢 Abrir WhatsApp
            </a>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
            <button className="btn-primary" disabled={busy} onClick={() => resolveItem("enviado")}>
              ✅ Enviado
            </button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => resolveItem("numero_invalido")}
            >
              ❌ Número inválido
            </button>
            <button className="btn-secondary" disabled={busy} onClick={() => resolveItem("pulado")}>
              ⏭ Pular
            </button>
          </div>
        </div>
      )}

      {paused && (
        <div className="card text-center py-10 text-zinc-400">
          Sessão pausada. Clique em <b>Retomar</b> para continuar.
        </div>
      )}

      {/* próximo da fila (espiada) */}
      {pending.length > 1 && (
        <p className="text-xs text-zinc-500">
          Próximos: {pending.slice(1, 4).map((q) => q.leads?.nome).join(" · ")}
          {pending.length > 4 ? ` · +${pending.length - 4}` : ""}
        </p>
      )}
    </div>
  );
}
