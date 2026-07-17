"use client";

import { useCallback, useEffect, useState } from "react";

const AJUDA = `Variáveis: {nome_negocio} {cidade} {nicho} {rating} {qtd_avaliacoes}
Bloco opcional: {social_proof} (entra só se o lead tiver rating ≥ 4 e 3+ avaliações)
Spin syntax: {Oi|Olá|Opa} — uma opção é sorteada a cada mensagem`;

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/templates");
    const d = await res.json();
    setTemplates(d.templates ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!editing) return;
    const isNew = !editing.id;
    const res = await fetch(isNew ? "/api/templates" : `/api/templates/${editing.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: editing.nome,
        corpo: editing.corpo,
        social_proof: editing.social_proof,
      }),
    });
    if (res.ok) {
      setEditing(null);
      load();
    } else setMsg((await res.json()).error);
  }

  async function toggleAtivo(t: any) {
    await fetch(`/api/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !t.ativo }),
    });
    load();
  }

  async function remove(t: any) {
    if (!confirm(`Excluir o template "${t.nome}"?`)) return;
    const res = await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
    if (!res.ok) setMsg((await res.json()).error);
    load();
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Templates</h1>
        <button
          className="btn-primary"
          onClick={() => setEditing({ nome: "", corpo: "", social_proof: "" })}
        >
          + Novo template
        </button>
      </div>
      {msg && <p className="card border-red-900 text-red-300 text-sm">{msg}</p>}

      {editing && (
        <div className="card space-y-3 border-emerald-800">
          <div>
            <label className="label">Nome</label>
            <input
              className="input"
              value={editing.nome}
              onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Corpo da mensagem</label>
            <textarea
              className="input min-h-32 font-mono text-sm"
              rows={6}
              value={editing.corpo}
              onChange={(e) => setEditing({ ...editing, corpo: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Bloco social proof (opcional)</label>
            <textarea
              className="input font-mono text-sm"
              rows={2}
              value={editing.social_proof ?? ""}
              onChange={(e) => setEditing({ ...editing, social_proof: e.target.value })}
            />
          </div>
          <pre className="text-[11px] text-zinc-500 whitespace-pre-wrap">{AJUDA}</pre>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save} disabled={!editing.nome || !editing.corpo}>
              Salvar
            </button>
            <button className="btn-secondary" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {templates.map((t) => (
        <div key={t.id} className={`card space-y-2 ${!t.ativo ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">
              {t.nome}
              {!t.ativo && <span className="ml-2 badge bg-zinc-800 text-zinc-400">inativo</span>}
            </h2>
            <div className="flex gap-2 text-sm">
              <button className="btn-secondary !py-1" onClick={() => setEditing({ ...t })}>
                Editar
              </button>
              <button className="btn-secondary !py-1" onClick={() => toggleAtivo(t)}>
                {t.ativo ? "Desativar" : "Ativar"}
              </button>
              <button className="btn-danger !py-1" onClick={() => remove(t)}>
                Excluir
              </button>
            </div>
          </div>
          <p className="text-sm text-zinc-400 whitespace-pre-wrap font-mono">{t.corpo}</p>
          {t.social_proof && (
            <p className="text-xs text-zinc-500 font-mono">social_proof: {t.social_proof}</p>
          )}
        </div>
      ))}
    </div>
  );
}
