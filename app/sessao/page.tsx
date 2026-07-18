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
  const [copied, setCopied] = useState(false);

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
          notify("Tégui", "🔔 Hora de disparar a próxima mensagem!");
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
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
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

  // ---------- atalhos de teclado (desktop, fluxo repetitivo) ----------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (
        el?.tagName === "TEXTAREA" ||
        el?.tagName === "INPUT" ||
        el?.tagName === "SELECT" ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (phase === "alarm" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        goNext();
        return;
      }
      if (phase !== "ready" || !current || paused || busy) return;
      const k = e.key.toLowerCase();
      if (k === "e") resolveItem("enviado");
      else if (k === "c") copyMessage();
      else if (k === "w" && current.leads?.telefone) {
        copyMessage();
        window.open(waLink(current.leads.telefone, msgDraft), "_blank");
      } else if (k === "r") regenerate();
      else if (k === "p") resolveItem("pulado");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- render ----------
  if (loading)
    return <p className="font-mono text-sm text-dim animate-pulse">carregando sessão…</p>;

  // resumo final
  if (session && (phase === "done" || ["encerrada", "concluida"].includes(session.status))) {
    const invalidos = queue.filter((q) => q.status === "numero_invalido").length;
    const pulados = queue.filter((q) => q.status === "pulado").length;
    return (
      <div className="max-w-lg mx-auto space-y-5 animate-settle-in">
        <span className="tag-state text-dim">sessão_concluída</span>
        <h1 className="text-2xl font-bold tracking-tight">Resumo da sessão</h1>
        <div className="card grid grid-cols-2 gap-6 py-6 text-center">
          <div>
            <div className="data text-4xl font-semibold text-lima">{enviados}</div>
            <div className="label mt-1.5 mb-0">enviadas</div>
          </div>
          <div>
            <div className="data text-4xl font-semibold text-paper">{pending.length}</div>
            <div className="label mt-1.5 mb-0">restantes</div>
          </div>
          <div>
            <div className="data text-4xl font-semibold text-red-400">{invalidos}</div>
            <div className="label mt-1.5 mb-0">inválidos</div>
          </div>
          <div>
            <div className="data text-4xl font-semibold text-amber-400">{pulados}</div>
            <div className="label mt-1.5 mb-0">pulados</div>
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
      <div className="max-w-lg mx-auto space-y-5">
        <div>
          <span className="tag-state text-dim">nova_sessão</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Montar fila do dia</h1>
        </div>
        {error && (
          <div className="card-line !border-red-900/70 text-sm text-red-300">{error}</div>
        )}
        {chips.length === 0 ? (
          <div className="card py-10 text-center space-y-3">
            <p className="tag-state text-dim">sem_chips</p>
            <p className="text-sm text-dim">
              Você ainda não tem um chip cadastrado — é ele que define seu limite diário seguro.
            </p>
            <a href="/chips" className="btn-primary">
              Cadastrar meu primeiro chip
            </a>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="card py-10 text-center space-y-3">
            <p className="tag-state text-dim">sem_campanhas</p>
            <p className="text-sm text-dim">
              Crie uma campanha (nicho + cidade + templates) para poder montar a fila.
            </p>
            <a href="/campanhas" className="btn-primary">
              Criar campanha
            </a>
          </div>
        ) : (
          <div className="card space-y-5">
            <div>
              <label className="label">Tipo de sessão</label>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-navy-950/70 p-1">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    formTipo === "disparo"
                      ? "bg-lima text-navy-950"
                      : "text-dim hover:text-paper"
                  }`}
                  onClick={() => setFormTipo("disparo")}
                >
                  🚀 Disparo
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    formTipo === "aquecimento"
                      ? "bg-amber-400 text-navy-950"
                      : "text-dim hover:text-paper"
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
                <p className="text-xs text-amber-300/80 mt-2">
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
                  <option key={c.id} value={c.id} disabled={c.maturando}>
                    {c.maturando
                      ? `${c.nome} — 🌱 em maturação (bloqueado)`
                      : `${c.nome} — ${c.hoje}/${c.limite_diario_override ?? c.preset.limite} hoje · ${c.preset.fase}`}
                  </option>
                ))}
              </select>
              {chips.some((c) => c.maturando) && (
                <p className="text-xs text-amber-300/80 mt-1.5">
                  Chips em maturação não podem disparar — conclua o ciclo na aba 🌱 Maturação.
                </p>
              )}
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
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Meta do dia</label>
                <input
                  type="number"
                  min={1}
                  className="input data"
                  value={formMeta}
                  onChange={(e) => setFormMeta(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Mín (min)</label>
                <input
                  type="number"
                  min={1}
                  className="input data"
                  value={formMin}
                  onChange={(e) => setFormMin(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Máx (min)</label>
                <input
                  type="number"
                  min={formMin}
                  className="input data"
                  value={formMax}
                  onChange={(e) => setFormMax(Number(e.target.value))}
                />
              </div>
            </div>
            <button
              className="btn-primary w-full !py-3"
              disabled={!formCampaign || !formChip || busy || formMax < formMin}
              onClick={() => createSession()}
            >
              {busy
                ? "Montando fila…"
                : formTipo === "aquecimento"
                  ? "🔥 Iniciar aquecimento"
                  : "🚀 Iniciar sessão"}
            </button>
          </div>
        )}
      </div>
    );
  }

  const lead = current?.leads;
  const posicaoAtual = queue.length - pending.length + 1;
  const hojeTotal = (limits?.hoje ?? 0) + enviados;
  const timerPct =
    drawnInterval > 0 ? Math.max(0, Math.min(100, (remaining / drawnInterval) * 100)) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="tag-state text-dim">
            {session.tipo === "aquecimento" ? "aquecimento" : "disparo"}
          </span>
          <h1 className="text-xl font-bold tracking-tight truncate">
            {session.campaigns?.nome ?? ""}
          </h1>
          <p className="font-mono text-[11px] text-dim truncate">
            {session.chips?.nome ?? "chip"}
            {paused && <span className="text-amber-400"> · pausada</span>}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button className="btn-ghost !px-3" onClick={togglePause}>
            {paused ? "▶" : "⏸"}
          </button>
          <button className="btn-danger !px-3" onClick={endSession}>
            Encerrar
          </button>
        </div>
      </div>

      {/* progresso do dia */}
      <div className="card !py-3 flex items-center justify-between gap-4">
        <span className="font-mono text-xs text-dim">
          lead <b className="text-paper">{String(posicaoAtual).padStart(2, "0")}</b>/
          {String(queue.length).padStart(2, "0")}
        </span>
        <div className="flex-1 h-1 rounded-full bg-navy-800 overflow-hidden">
          <div
            className="h-full bg-lima/70 transition-all duration-300"
            style={{ width: `${limits?.diario ? (hojeTotal / limits.diario) * 100 : 0}%` }}
          />
        </div>
        <span className="font-mono text-xs text-dim">
          hoje <b className="text-lima">{hojeTotal}</b>/{limits?.diario}
        </span>
      </div>
      {error && <div className="card-line !border-red-900/70 text-sm text-red-300">{error}</div>}

      {/* ===== timer: o hero funcional ===== */}
      {(phase === "waiting" || phase === "alarm") && !paused && (
        <div
          className={`card text-center py-10 sm:py-14 transition-colors duration-300 ${
            phase === "alarm"
              ? "border border-lima animate-pulse-ready bg-lima-faint"
              : ""
          }`}
        >
          {phase === "waiting" ? (
            <>
              <span className="tag-state text-viola">aguardando</span>
              <div className="data text-7xl sm:text-8xl font-semibold mt-3 tracking-tight">
                {fmt(remaining)}
              </div>
              <div className="max-w-56 mx-auto mt-5 h-1 rounded-full bg-navy-800 overflow-hidden">
                <div
                  className="h-full bg-viola/80 transition-all duration-500"
                  style={{ width: `${timerPct}%` }}
                />
              </div>
              <p className="font-mono text-[11px] text-dim mt-3">
                intervalo sorteado {fmt(drawnInterval)} · próximo lead ao zerar
              </p>
              <button className="btn-ghost mt-5" onClick={delay2min}>
                +2 min — estou ocupado
              </button>
            </>
          ) : (
            <>
              <span className="tag-state text-lima text-base">disparar</span>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight mt-2">
                Hora de disparar
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center mt-7 px-4">
                <button className="btn-primary !py-3 sm:!px-8" onClick={goNext}>
                  Ir para o próximo lead →
                </button>
                <button className="btn-ghost" onClick={delay2min}>
                  +2 min
                </button>
              </div>
              <p className="hidden sm:block font-mono text-[11px] text-dim mt-5">
                espaço avança
              </p>
            </>
          )}
        </div>
      )}

      {/* ===== card do lead atual ===== */}
      {current && phase === "ready" && !paused && (
        <div className="card space-y-4 animate-settle-in">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight">{lead?.nome}</h2>
              <p className="font-mono text-xs text-dim mt-1">
                {lead?.nicho} · {lead?.cidade} · {formatPhone(lead?.telefone ?? "")}
              </p>
              <p className="font-mono text-[11px] text-dim/70 mt-0.5">
                {lead?.rating ? `${lead.rating}★ (${lead.qtd_avaliacoes}) · ` : ""}
                score {lead?.score} · {current.templates?.nome}
                {current.editada && " · editada"}
              </p>
            </div>
          </div>

          <div>
            <label className="label">Mensagem — edite à vontade antes de enviar</label>
            <textarea
              className="input min-h-36 font-mono text-sm leading-relaxed"
              rows={7}
              value={msgDraft}
              onChange={(e) => setMsgDraft(e.target.value)}
            />
            <button className="btn-ghost !px-2 !py-1 text-xs mt-1" onClick={regenerate}>
              🔄 Regenerar variação
            </button>
          </div>

          {/* ações — desktop */}
          <div className="hidden sm:flex flex-wrap items-center gap-2 pt-3 border-t border-navy-800">
            <button className="btn-primary" disabled={busy} onClick={() => resolveItem("enviado")}>
              ✅ Enviado
            </button>
            <button className="btn-secondary" onClick={copyMessage}>
              {copied ? "✓ Copiado" : "📋 Copiar"}
            </button>
            <a
              className="btn-secondary"
              href={waLink(lead?.telefone ?? "", msgDraft)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => copyMessage()}
            >
              🟢 WhatsApp
            </a>
            <span className="flex-1" />
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => resolveItem("pulado")}
            >
              Pular
            </button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => resolveItem("numero_invalido")}
            >
              Nº inválido
            </button>
          </div>
          <p className="hidden sm:block font-mono text-[10px] text-dim/60 -mt-2">
            atalhos: E enviado · C copiar · W whatsapp · R regenerar · P pular
          </p>

          {/* ações menos frequentes — mobile (as principais ficam na barra fixa) */}
          <div className="flex sm:hidden gap-2 pt-3 border-t border-navy-800">
            <button className="btn-ghost flex-1" disabled={busy} onClick={() => resolveItem("pulado")}>
              Pular
            </button>
            <button
              className="btn-danger flex-1"
              disabled={busy}
              onClick={() => resolveItem("numero_invalido")}
            >
              Nº inválido
            </button>
          </div>
        </div>
      )}

      {paused && (
        <div className="card text-center py-12 space-y-2">
          <span className="tag-state text-amber-400">pausada</span>
          <p className="text-sm text-dim">Sua fila está congelada. Retome quando estiver pronto.</p>
          <button className="btn-secondary mt-2" onClick={togglePause}>
            ▶ Retomar sessão
          </button>
        </div>
      )}

      {/* próximo da fila (espiada) */}
      {pending.length > 1 && (
        <p className="font-mono text-[11px] text-dim/70">
          próximos → {pending.slice(1, 4).map((q) => q.leads?.nome).join(" · ")}
          {pending.length > 4 ? ` · +${pending.length - 4}` : ""}
        </p>
      )}

      {/* ===== mobile: barra de ação fixa, alcance do polegar ===== */}
      {current && phase === "ready" && !paused && (
        <div className="sm:hidden fixed bottom-14 inset-x-0 z-30 border-t border-navy-800 bg-navy-950/95 backdrop-blur px-3 py-2.5 flex gap-2">
          <button className="btn-secondary !px-3.5" onClick={copyMessage} aria-label="Copiar mensagem">
            {copied ? "✓" : "📋"}
          </button>
          <a
            className="btn-secondary !px-3.5"
            href={waLink(lead?.telefone ?? "", msgDraft)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => copyMessage()}
            aria-label="Abrir WhatsApp"
          >
            🟢
          </a>
          <button
            className="btn-primary flex-1 !py-3"
            disabled={busy}
            onClick={() => resolveItem("enviado")}
          >
            ✅ Enviado
          </button>
        </div>
      )}
    </div>
  );
}
