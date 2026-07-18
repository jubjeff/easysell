"use client";

import { useCallback, useEffect, useState } from "react";

export default function VendedoresPage() {
  const [lista, setLista] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  const load = useCallback(async () => {
    const [vRes, meRes] = await Promise.all([fetch("/api/vendedores"), fetch("/api/me")]);
    const vData = await vRes.json();
    const meData = await meRes.json();
    setMe(meData.profile);
    if (vData.error) setErro(vData.error);
    else setLista(vData.vendedores ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function novo() {
    setErro("");
    setEditing({ novo: true, nome: "", email: "", senha: "", whatsapp_numero: "", comissao_percentual: "" });
  }

  async function salvar() {
    setErro("");
    const isNew = editing.novo;
    const res = await fetch(isNew ? "/api/vendedores" : `/api/vendedores/${editing.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isNew
          ? {
              nome: editing.nome,
              email: editing.email,
              senha: editing.senha,
              whatsapp_numero: editing.whatsapp_numero || null,
              comissao_percentual: Number(editing.comissao_percentual) || 0,
            }
          : {
              nome: editing.nome,
              whatsapp_numero: editing.whatsapp_numero || null,
              comissao_percentual: Number(editing.comissao_percentual) || 0,
              ...(editing.nova_senha ? { nova_senha: editing.nova_senha } : {}),
            }
      ),
    });
    if (res.ok) {
      setMsg(isNew ? "Vendedor criado." : "Alterações salvas.");
      setTimeout(() => setMsg(""), 2000);
      setEditing(null);
      load();
    } else {
      setErro((await res.json()).error ?? "Erro ao salvar.");
    }
  }

  async function toggleAtivo(v: any) {
    await fetch(`/api/vendedores/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !v.ativo }),
    });
    load();
  }

  if (me && me.role !== "admin") {
    return (
      <p className="card text-sm text-zinc-400">
        Esta área é exclusiva do administrador.
      </p>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Vendedores</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-emerald-400">✓ {msg}</span>}
          <button className="btn-primary" onClick={novo}>
            + Novo vendedor
          </button>
        </div>
      </div>
      {erro && <p className="card border-red-900 text-red-300 text-sm">{erro}</p>}

      {editing && (
        <div className="card space-y-3 border-emerald-800">
          <h2 className="text-sm font-bold text-zinc-300">
            {editing.novo ? "Novo vendedor" : `Editar ${editing.nome}`}
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome</label>
              <input
                className="input"
                value={editing.nome}
                onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
              />
            </div>
            {editing.novo && (
              <div>
                <label className="label">E-mail (login)</label>
                <input
                  type="email"
                  className="input"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="label">
                {editing.novo ? "Senha inicial" : "Nova senha (deixe vazio para manter)"}
              </label>
              <input
                type="text"
                className="input"
                value={editing.novo ? editing.senha : editing.nova_senha ?? ""}
                placeholder={editing.novo ? "mín. 6 caracteres" : "•••••• (opcional)"}
                onChange={(e) =>
                  setEditing(
                    editing.novo
                      ? { ...editing, senha: e.target.value }
                      : { ...editing, nova_senha: e.target.value }
                  )
                }
              />
            </div>
            <div>
              <label className="label">WhatsApp (número que dispara)</label>
              <input
                className="input"
                value={editing.whatsapp_numero ?? ""}
                onChange={(e) => setEditing({ ...editing, whatsapp_numero: e.target.value })}
                placeholder="(81) 99999-9999"
              />
            </div>
            <div>
              <label className="label">Comissão padrão (%)</label>
              <input
                type="number"
                step="0.1"
                className="input"
                value={editing.comissao_percentual}
                onChange={(e) => setEditing({ ...editing, comissao_percentual: e.target.value })}
                placeholder="ex: 10"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={salvar}
              disabled={!editing.nome || (editing.novo && (!editing.email || !editing.senha))}
            >
              Salvar
            </button>
            <button className="btn-secondary" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {lista.map((v) => (
        <div key={v.id} className={`card ${!v.ativo ? "opacity-50" : ""}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">
                {v.nome}
                {v.role === "admin" && (
                  <span className="ml-2 badge bg-emerald-900/60 text-emerald-300">admin</span>
                )}
                {!v.ativo && <span className="ml-2 badge bg-zinc-800 text-zinc-400">inativo</span>}
              </h2>
              <p className="text-sm text-zinc-400">
                {v.whatsapp_numero ? `${v.whatsapp_numero} · ` : ""}
                comissão padrão {v.comissao_percentual}%
              </p>
            </div>
            {v.role !== "admin" && (
              <div className="flex gap-2">
                <button className="btn-secondary !py-1" onClick={() => setEditing({ ...v, novo: false })}>
                  Editar
                </button>
                <button className="btn-secondary !py-1" onClick={() => toggleAtivo(v)}>
                  {v.ativo ? "Desativar" : "Ativar"}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
