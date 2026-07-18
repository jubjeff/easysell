"use client";

import { useCallback, useEffect, useState } from "react";
import { FASES } from "@/lib/maturacao";

const STATUS_STYLE: Record<string, string> = {
  "Em maturação": "bg-amber-900/60 text-amber-300",
  "Pronto para operar": "bg-emerald-900/60 text-emerald-300",
  "Em risco / pausado": "bg-red-900/60 text-red-300",
};

const FORM_VAZIO = {
  msgs_enviadas: "",
  msgs_recebidas: "",
  contatos_ativos: "",
  contatos_novos: "0",
  status_postado: false,
  bloqueios: "0",
  notas: "",
};

export default function MaturacaoPage() {
  const [chips, setChips] = useState<any[]>([]);
  const [outros, setOutros] = useState<any[]>([]);
  const [addSel, setAddSel] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [avisos, setAvisos] = useState<string[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [form, setForm] = useState<any>(FORM_VAZIO);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([fetch("/api/maturacao"), fetch("/api/chips")]);
      const m = await mRes.json();
      const c = await cRes.json();
      if (m.error) setErro(m.error);
      else {
        setChips(m.chips ?? []);
        setOutros((c.chips ?? []).filter((x: any) => x.ativo && !x.maturando));
      }
    } catch (e: any) {
      setErro(String(e?.message ?? e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patchChip(chipId: string, body: any) {
    setBusy(true);
    setErro("");
    const res = await fetch(`/api/maturacao/${chipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setErro((await res.json()).error ?? "Erro.");
      return false;
    }
    await load();
    return true;
  }

  async function registrar(chipId: string) {
    setBusy(true);
    setErro("");
    setAvisos([]);
    const res = await fetch(`/api/maturacao/${chipId}/registrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgs_enviadas: Number(form.msgs_enviadas) || 0,
        msgs_recebidas: Number(form.msgs_recebidas) || 0,
        contatos_ativos: Number(form.contatos_ativos) || 0,
        contatos_novos: Number(form.contatos_novos) || 0,
        status_postado: form.status_postado,
        bloqueios: Number(form.bloqueios) || 0,
        notas: form.notas,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErro(data.error ?? "Erro ao registrar.");
      return;
    }
    setAvisos(data.avisos ?? []);
    setForm(FORM_VAZIO);
    await load();
  }

  async function liberar(chip: any) {
    if (
      !confirm(
        `Liberar "${chip.nome}" para disparo? Comece com volume moderado (~metade do limite) e suba gradual.`
      )
    )
      return;
    if (await patchChip(chip.id, { action: "liberar" })) {
      alert("Chip liberado! Ele já aparece disponível na Sessão de disparo.");
    }
  }

  if (loading) return <p className="text-zinc-500">Carregando…</p>;

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <span className="tag-state text-dim">maturação</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">🌱 Aquecimento de chips</h1>
      </div>
      {erro && <p className="card-line !border-red-900/70 text-red-300 text-sm">{erro}</p>}
      {avisos.map((a, i) => (
        <p key={i} className="card border-amber-800 bg-amber-950/30 text-amber-200 text-sm">
          ⚠️ {a}
        </p>
      ))}

      {chips.length === 0 && (
        <p className="card text-sm text-zinc-400">
          Nenhum chip em maturação. Adicione um abaixo — todo chip novo deve passar por ~21 dias de
          aquecimento guiado antes de disparar.
        </p>
      )}

      {chips.map((c) => {
        const s = c.state;
        const expandido = aberto === c.id;
        return (
          <div key={c.id} className="card space-y-3">
            {/* cabeçalho do card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-bold">
                  {c.nome}
                  <span className={`ml-2 badge ${STATUS_STYLE[s.status]}`}>{s.status}</span>
                </h2>
                <p className="text-sm text-zinc-400">
                  Dia <b className="text-zinc-200">{s.diaAtual}</b> de {s.totalDias} · Fase {s.fase.n}{" "}
                  — {s.fase.nome}
                </p>
              </div>
              <button
                className="btn-secondary !py-1 self-start"
                onClick={() => setAberto(expandido ? null : c.id)}
              >
                {expandido ? "Fechar" : "Abrir"}
              </button>
            </div>

            {/* barra de progresso */}
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${s.progresso}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500">
              {s.progresso}% do ciclo · meta de hoje: <b>{s.fase.msgsMin}–{s.fase.msgsMax} msgs</b>{" "}
              (enviadas+recebidas) com {s.fase.contatosSugeridos} contatos ·{" "}
              {s.registrouHoje ? "✅ hoje registrado" : "⬜ hoje pendente"}
            </p>

            {expandido && (
              <div className="space-y-4 pt-2 border-t border-zinc-800">
                {/* tarefas da fase */}
                <div>
                  <h3 className="text-sm font-bold text-zinc-400 mb-1">
                    Tarefas da fase {s.fase.n} ({s.fase.nome})
                  </h3>
                  <ul className="text-sm text-zinc-300 space-y-1">
                    {s.fase.tarefas.map((t: string, i: number) => (
                      <li key={i}>• {t}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-zinc-500 mt-1">
                    Falar de trabalho: <b>{s.fase.permiteTrabalho}</b> · Enviar link:{" "}
                    <b>{s.fase.permiteLink}</b>
                  </p>
                </div>

                {/* perfil */}
                <div>
                  <h3 className="text-sm font-bold text-zinc-400 mb-1">Perfil do WhatsApp</h3>
                  <div className="flex flex-wrap gap-4">
                    {(
                      [
                        ["perfil_foto", "Foto"],
                        ["perfil_nome", "Nome"],
                        ["perfil_descricao", "Descrição"],
                      ] as const
                    ).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!c[k]}
                          onChange={(e) => patchChip(c.id, { action: "perfil", [k]: e.target.checked })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* cronograma */}
                <div>
                  <h3 className="text-sm font-bold text-zinc-400 mb-1">Cronograma</h3>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: s.totalDias }, (_, i) => i + 1).map((d) => (
                      <span
                        key={d}
                        title={`Dia ${d}`}
                        className={`w-7 h-7 rounded flex items-center justify-center text-[11px] font-medium ${
                          d <= s.diasValidos
                            ? "bg-emerald-600 text-white"
                            : d === s.diaAtual
                              ? "bg-zinc-700 text-zinc-100 ring-1 ring-emerald-500"
                              : "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Status postado em {s.comStatus} dias · respostas recebidas em {s.comResposta}{" "}
                    dias
                    {s.alertas48h > 0 && (
                      <span className="text-red-400"> · ⚠️ {s.alertas48h} alerta(s) nas últimas 48h</span>
                    )}
                  </p>
                </div>

                {/* registro do dia */}
                {!s.registrouHoje && !s.emRisco && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-zinc-400">Registrar atividade de hoje</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="label">Msgs enviadas</label>
                        <input
                          type="number"
                          min={0}
                          className="input"
                          value={form.msgs_enviadas}
                          onChange={(e) => setForm({ ...form, msgs_enviadas: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label">Msgs recebidas</label>
                        <input
                          type="number"
                          min={0}
                          className="input"
                          value={form.msgs_recebidas}
                          onChange={(e) => setForm({ ...form, msgs_recebidas: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label">Contatos ativos</label>
                        <input
                          type="number"
                          min={0}
                          className="input"
                          value={form.contatos_ativos}
                          onChange={(e) => setForm({ ...form, contatos_ativos: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label">Contato novo hoje?</label>
                        <select
                          className="input"
                          value={form.contatos_novos}
                          onChange={(e) => setForm({ ...form, contatos_novos: e.target.value })}
                        >
                          <option value="0">Não</option>
                          <option value="1">Sim (1)</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Bloqueios/denúncias</label>
                        <input
                          type="number"
                          min={0}
                          className="input"
                          value={form.bloqueios}
                          onChange={(e) => setForm({ ...form, bloqueios: e.target.value })}
                        />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.status_postado}
                            onChange={(e) => setForm({ ...form, status_postado: e.target.checked })}
                          />
                          Postei status hoje
                        </label>
                      </div>
                    </div>
                    <input
                      className="input"
                      placeholder="Notas (opcional)"
                      value={form.notas}
                      onChange={(e) => setForm({ ...form, notas: e.target.value })}
                    />
                    <button className="btn-primary" disabled={busy} onClick={() => registrar(c.id)}>
                      ✅ Registrar dia {s.diaAtual}
                    </button>
                  </div>
                )}
                {s.emRisco && (
                  <p className="card border-red-900 bg-red-950/30 text-red-200 text-sm">
                    ⏸ Chip pausado por segurança até{" "}
                    {new Date(c.risco_ate).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    . Não use o número para nada comercial nesse período.
                  </p>
                )}

                {/* gate de liberação */}
                <div>
                  <h3 className="text-sm font-bold text-zinc-400 mb-1">
                    Critérios para liberar o disparo
                  </h3>
                  <ul className="text-sm space-y-1">
                    {s.criterios.map((cr: any, i: number) => (
                      <li key={i} className={cr.ok ? "text-emerald-400" : "text-zinc-400"}>
                        {cr.ok ? "✅" : "⬜"} {cr.label}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      className="btn-primary"
                      disabled={!s.liberavel || busy}
                      onClick={() => liberar(c)}
                    >
                      🚀 Liberar para disparo
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => {
                        if (confirm("Tirar este chip da maturação sem liberar? O histórico é mantido."))
                          patchChip(c.id, { action: "cancelar" });
                      }}
                    >
                      Cancelar maturação
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* adicionar chip existente */}
      {outros.length > 0 && (
        <div className="card space-y-2">
          <h3 className="text-sm font-bold text-zinc-400">Colocar chip em maturação</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <select className="input" value={addSel} onChange={(e) => setAddSel(e.target.value)}>
              <option value="">Selecione um chip…</option>
              {outros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.preset.fase})
                </option>
              ))}
            </select>
            <button
              className="btn-primary shrink-0"
              disabled={!addSel || busy}
              onClick={async () => {
                if (await patchChip(addSel, { action: "iniciar" })) setAddSel("");
              }}
            >
              🌱 Iniciar maturação
            </button>
          </div>
        </div>
      )}

      {/* cronograma de referência */}
      <div className="card">
        <h3 className="text-sm font-bold text-zinc-400 mb-2">Cronograma de referência (21 dias)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-zinc-300">
            <thead>
              <tr className="text-zinc-500 text-left">
                <th className="py-1 pr-2">Fase</th>
                <th className="py-1 pr-2">Dias</th>
                <th className="py-1 pr-2">Contatos</th>
                <th className="py-1 pr-2">Msgs/dia</th>
                <th className="py-1 pr-2">Trabalho?</th>
                <th className="py-1">Link?</th>
              </tr>
            </thead>
            <tbody>
              {FASES.map((f) => (
                <tr key={f.n} className="border-t border-zinc-800/60">
                  <td className="py-1.5 pr-2">
                    {f.n}. {f.nome}
                  </td>
                  <td className="py-1.5 pr-2">
                    {f.diaIni}–{f.diaFim}
                  </td>
                  <td className="py-1.5 pr-2">{f.contatosSugeridos}</td>
                  <td className="py-1.5 pr-2">
                    {f.msgsMin}–{f.msgsMax}
                  </td>
                  <td className="py-1.5 pr-2">{f.permiteTrabalho}</td>
                  <td className="py-1.5">{f.permiteLink}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          A métrica principal é <b>mensagens trocadas com poucos contatos que respondem</b> — não
          quantidade de contatos. Receber resposta é o sinal mais forte de chip saudável.
        </p>
      </div>

      {/* avisos de segurança fixos */}
      <div className="card border-amber-900/60">
        <h3 className="text-sm font-bold text-amber-300 mb-2">⚠️ Regras de ouro (não quebre)</h3>
        <ul className="text-sm text-zinc-300 space-y-1.5">
          <li>
            • <b>NUNCA</b> conecte o número em painel/site de terceiro que promete &ldquo;aquecer
            sozinho&rdquo; ou &ldquo;disparo ilimitado&rdquo; — causa nº 1 de perda de chip.
          </li>
          <li>
            • <b>NUNCA</b> digite o código de 6 dígitos fora do app oficial do WhatsApp.
          </li>
          <li>• Use chip físico ativo com créditos; evite números virtuais.</li>
          <li>• Evite trocar de aparelho/IP com frequência durante a maturação.</li>
          <li>
            • Durante a maturação, <b>zero disparo para contato frio</b> (quem não salvou seu
            número).
          </li>
          <li className="text-zinc-500 pt-1">
            Disparo em massa para contatos frios sempre carrega risco residual, mesmo maturado. O
            que zera o risco de verdade é lista <b>opt-in</b> — quem chega até você pela sua landing
            page/formulário.
          </li>
        </ul>
      </div>
    </div>
  );
}
