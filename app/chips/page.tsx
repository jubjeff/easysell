"use client";

import { useCallback, useEffect, useState } from "react";

export default function ChipsPage() {
  const [chips, setChips] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/chips");
    const d = await res.json();
    setChips(d.chips ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function novo() {
    setEditing({
      nome: "",
      telefone: "",
      ativado_em: new Date().toISOString().slice(0, 10),
      limite_diario_override: "",
      maturando: true,
    });
  }

  async function save() {
    const isNew = !editing.id;
    const res = await fetch(isNew ? "/api/chips" : `/api/chips/${editing.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: editing.nome,
        telefone: editing.telefone || null,
        ativado_em: editing.ativado_em,
        limite_diario_override: editing.limite_diario_override
          ? Number(editing.limite_diario_override)
          : null,
        ...(isNew ? { maturando: !!editing.maturando } : {}),
      }),
    });
    if (res.ok) {
      setEditing(null);
      load();
    } else setMsg((await res.json()).error);
  }

  async function toggleAtivo(c: any) {
    await fetch(`/api/chips/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !c.ativo }),
    });
    load();
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Chips</h1>
        <button className="btn-primary" onClick={novo}>
          + Novo chip
        </button>
      </div>
      {msg && <p className="card border-red-900 text-red-300 text-sm">{msg}</p>}

      {editing && (
        <div className="card space-y-3 border-emerald-800">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome / apelido</label>
              <input
                className="input"
                value={editing.nome}
                onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
                placeholder="Chip Business 1"
              />
            </div>
            <div>
              <label className="label">Telefone (opcional)</label>
              <input
                className="input"
                value={editing.telefone}
                onChange={(e) => setEditing({ ...editing, telefone: e.target.value })}
                placeholder="(81) 99999-9999"
              />
            </div>
            <div>
              <label className="label">Data de ativação</label>
              <input
                type="date"
                className="input"
                value={editing.ativado_em}
                onChange={(e) => setEditing({ ...editing, ativado_em: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Override do limite diário (vazio = automático)</label>
              <input
                type="number"
                className="input"
                value={editing.limite_diario_override}
                onChange={(e) => setEditing({ ...editing, limite_diario_override: e.target.value })}
                placeholder="auto por idade do chip"
              />
            </div>
          </div>
          {!editing.id && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!editing.maturando}
                onChange={(e) => setEditing({ ...editing, maturando: e.target.checked })}
              />
              🌱 Iniciar em maturação (recomendado para chip novo — ~21 dias de aquecimento guiado
              antes de liberar o disparo)
            </label>
          )}
          <p className="text-xs text-zinc-600">
            Presets automáticos: chip novo (&lt;30d) 15/dia · aquecido (30–90d) 40/dia · maduro
            (&gt;90d) 80/dia. Em sessões de <b>aquecimento</b>, o teto configurado em Configurações
            sempre prevalece se for menor.
          </p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save} disabled={!editing.nome || !editing.ativado_em}>
              Salvar
            </button>
            <button className="btn-secondary" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {chips.length === 0 && !editing && (
        <p className="card text-sm text-zinc-400">
          Nenhum chip cadastrado ainda. Crie um para poder iniciar sessões de disparo ou
          aquecimento.
        </p>
      )}

      {chips.map((c) => (
        <div key={c.id} className={`card ${!c.ativo ? "opacity-50" : ""}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">
                {c.nome}
                {!c.ativo && <span className="ml-2 badge bg-zinc-800 text-zinc-400">inativo</span>}
                {c.maturando && (
                  <span className="ml-2 badge bg-amber-900/60 text-amber-300">🌱 em maturação</span>
                )}
              </h2>
              <p className="text-sm text-zinc-400">
                {c.telefone ? `${c.telefone} · ` : ""}
                {c.preset.fase} · {c.preset.idadeDias} dias
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary !py-1" onClick={() => setEditing(c)}>
                Editar
              </button>
              <button className="btn-secondary !py-1" onClick={() => toggleAtivo(c)}>
                {c.ativo ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Hoje: <b className="text-emerald-400">{c.hoje}</b> / {c.limite_diario_override ?? c.preset.limite}
            {" · "}Semana: {c.semana}
            {c.limite_diario_override != null && (
              <span> · limite manual: {c.limite_diario_override}/dia</span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
