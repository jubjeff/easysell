"use client";

import { useCallback, useEffect, useState } from "react";

export default function CampanhasPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [c, t] = await Promise.all([
      fetch("/api/campaigns").then((r) => r.json()),
      fetch("/api/templates").then((r) => r.json()),
    ]);
    setCampaigns(c.campaigns ?? []);
    setTemplates((t.templates ?? []).filter((x: any) => x.ativo));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function novo() {
    setEditing({
      nome: "",
      nicho: "",
      cidade: "",
      limite_diario: 15,
      limiar_taxa_resposta: 5,
      template_ids: [],
    });
  }

  function editar(c: any) {
    setEditing({
      ...c,
      template_ids: (c.campaign_templates ?? []).map((ct: any) => ct.template_id),
    });
  }

  async function save() {
    const isNew = !editing.id;
    const res = await fetch(isNew ? "/api/campaigns" : `/api/campaigns/${editing.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    if (res.ok) {
      setEditing(null);
      load();
    } else setMsg((await res.json()).error);
  }

  async function toggleAtiva(c: any) {
    await fetch(`/api/campaigns/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativa: !c.ativa }),
    });
    load();
  }

  function toggleTemplate(id: string) {
    const ids = new Set(editing.template_ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    setEditing({ ...editing, template_ids: Array.from(ids) });
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Campanhas</h1>
        <button className="btn-primary" onClick={novo}>
          + Nova campanha
        </button>
      </div>
      {msg && <p className="card border-red-900 text-red-300 text-sm">{msg}</p>}

      {editing && (
        <div className="card space-y-3 border-emerald-800">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="label">Nome</label>
              <input
                className="input"
                value={editing.nome}
                onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
                placeholder="Advogados Caruaru"
              />
            </div>
            <div>
              <label className="label">Nicho</label>
              <input
                className="input"
                value={editing.nicho}
                onChange={(e) => setEditing({ ...editing, nicho: e.target.value })}
                placeholder="advogado"
              />
            </div>
            <div>
              <label className="label">Cidade</label>
              <input
                className="input"
                value={editing.cidade}
                onChange={(e) => setEditing({ ...editing, cidade: e.target.value })}
                placeholder="Caruaru"
              />
            </div>
            <div>
              <label className="label">Limite diário da campanha</label>
              <input
                className="input"
                type="number"
                min={1}
                value={editing.limite_diario}
                onChange={(e) => setEditing({ ...editing, limite_diario: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Limiar de alerta (taxa de resposta %)</label>
              <input
                className="input"
                type="number"
                step="0.5"
                value={editing.limiar_taxa_resposta}
                onChange={(e) =>
                  setEditing({ ...editing, limiar_taxa_resposta: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div>
            <label className="label">Templates da campanha</label>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTemplate(t.id)}
                  className={`badge cursor-pointer border px-3 py-1.5 ${
                    editing.template_ids.includes(t.id)
                      ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}
                >
                  {t.nome}
                </button>
              ))}
              {templates.length === 0 && (
                <p className="text-xs text-zinc-500">Crie templates primeiro.</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={save}
              disabled={!editing.nome || !editing.nicho || !editing.cidade || editing.template_ids.length === 0}
            >
              Salvar
            </button>
            <button className="btn-secondary" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {campaigns.map((c) => (
        <div key={c.id} className={`card flex items-center justify-between ${!c.ativa ? "opacity-50" : ""}`}>
          <div>
            <h2 className="font-bold">
              {c.nome}
              {!c.ativa && <span className="ml-2 badge bg-zinc-800 text-zinc-400">inativa</span>}
            </h2>
            <p className="text-sm text-zinc-400">
              {c.nicho} · {c.cidade} · limite {c.limite_diario}/dia · templates:{" "}
              {(c.campaign_templates ?? []).map((ct: any) => ct.templates?.nome).join(", ") || "—"}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary !py-1" onClick={() => editar(c)}>
              Editar
            </button>
            <button className="btn-secondary !py-1" onClick={() => toggleAtiva(c)}>
              {c.ativa ? "Desativar" : "Ativar"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
