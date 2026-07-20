"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPhone } from "@/lib/phone";

export default function DistribuicaoPage() {
  const [naoAtribuidos, setNaoAtribuidos] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [alvo, setAlvo] = useState("");
  const [fNicho, setFNicho] = useState("");
  const [fCidade, setFCidade] = useState("");
  const [autoSel, setAutoSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [me, setMe] = useState<any>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fNicho) qs.set("nicho", fNicho);
    if (fCidade) qs.set("cidade", fCidade);
    const [dRes, meRes] = await Promise.all([
      fetch(`/api/distribuicao?${qs}`),
      fetch("/api/me"),
    ]);
    const d = await dRes.json();
    const meData = await meRes.json();
    setMe(meData.profile);
    if (d.error) {
      setErro(d.error);
      return;
    }
    setNaoAtribuidos(d.naoAtribuidos ?? []);
    setVendedores(d.vendedores ?? []);
    setSel(new Set());
  }, [fNicho, fCidade]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: string) {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  }
  function toggleTodos() {
    if (sel.size === naoAtribuidos.length) setSel(new Set());
    else setSel(new Set(naoAtribuidos.map((l) => l.id)));
  }

  async function atribuir() {
    setErro("");
    if (!alvo || sel.size === 0) return;
    const res = await fetch("/api/distribuicao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_ids: Array.from(sel), vendedor_id: alvo }),
    });
    const d = await res.json();
    if (res.ok) {
      setMsg(`${d.atribuidos} lead(s) atribuído(s).`);
      setTimeout(() => setMsg(""), 2500);
      load();
    } else setErro(d.error);
  }

  async function auto() {
    setErro("");
    if (autoSel.size === 0) {
      setErro("Escolha os vendedores que entram no rodízio.");
      return;
    }
    const res = await fetch("/api/distribuicao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modo: "auto",
        vendedor_ids: Array.from(autoSel),
        nicho: fNicho || undefined,
        cidade: fCidade || undefined,
      }),
    });
    const d = await res.json();
    if (res.ok) {
      setMsg(`${d.atribuidos} lead(s) distribuído(s) por rodízio.`);
      setTimeout(() => setMsg(""), 2500);
      load();
    } else setErro(d.error);
  }

  function toggleAuto(id: string) {
    const n = new Set(autoSel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setAutoSel(n);
  }

  if (me && me.role !== "admin") {
    return (
      <p className="card text-sm text-dim">Esta área é exclusiva do administrador.</p>
    );
  }

  const vendedoresAtivos = vendedores.filter((v) => v.ativo);
  const todosMarcados = sel.size === naoAtribuidos.length && naoAtribuidos.length > 0;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <span className="tag-state text-dim">distribuição</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Distribuir leads</h1>
        </div>
        {msg && <span className="font-mono text-xs text-lima">✓ {msg}</span>}
      </div>
      {erro && <p className="card-line !border-red-900/70 text-red-300 text-sm">{erro}</p>}

      {/* carteira de cada vendedor */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {vendedores.map((v) => (
          <div key={v.id} className="card text-center py-3">
            <div className="data text-2xl font-semibold text-lima">{v.carteira}</div>
            <div className="font-mono text-[11px] text-dim mt-0.5">
              {v.nome}
              {v.role === "admin" && " (admin)"}
              {!v.ativo && " (inativo)"}
            </div>
          </div>
        ))}
      </div>

      {/* filtros */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-32">
          <label className="label">Filtrar nicho</label>
          <input className="input" value={fNicho} onChange={(e) => setFNicho(e.target.value)} placeholder="ex: advogado" />
        </div>
        <div className="flex-1 min-w-32">
          <label className="label">Filtrar cidade</label>
          <input className="input" value={fCidade} onChange={(e) => setFCidade(e.target.value)} placeholder="ex: Maceió" />
        </div>
      </div>

      {/* rodízio automático */}
      <div className="card-line space-y-3">
        <h2 className="tag-state text-dim">rodízio_automático</h2>
        <p className="text-xs text-dim">
          Distribui os não atribuídos (respeitando o filtro acima) igualmente entre os vendedores
          marcados.
        </p>
        <div className="flex flex-wrap gap-2">
          {vendedoresAtivos.map((v) => (
            <button
              key={v.id}
              onClick={() => toggleAuto(v.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                autoSel.has(v.id)
                  ? "bg-lima text-navy-950 border-lima"
                  : "bg-navy-900 text-dim border-navy-700 hover:text-paper"
              }`}
            >
              {v.nome}
              {v.role === "admin" && " (admin)"}
            </button>
          ))}
        </div>
        <button
          className="btn-secondary"
          onClick={auto}
          disabled={autoSel.size === 0 || naoAtribuidos.length === 0}
        >
          🔀 Distribuir {naoAtribuidos.length} lead(s) por rodízio
        </button>
      </div>

      {/* atribuição manual */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="tag-state text-dim">
            não_atribuídos · {naoAtribuidos.length}
          </h2>
          <div className="flex items-center gap-2">
            <select className="input !w-auto" value={alvo} onChange={(e) => setAlvo(e.target.value)}>
              <option value="">Atribuir a…</option>
              {vendedoresAtivos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                  {v.role === "admin" && " (admin)"}
                </option>
              ))}
            </select>
            <button className="btn-primary" onClick={atribuir} disabled={!alvo || sel.size === 0}>
              Atribuir {sel.size > 0 ? `(${sel.size})` : ""}
            </button>
          </div>
        </div>

        {naoAtribuidos.length === 0 ? (
          <p className="font-mono text-sm text-dim py-4 text-center">
            tudo distribuído · nenhum lead sem dono 🎉
          </p>
        ) : (
          <>
            <label className="flex items-center gap-2 font-mono text-[11px] text-dim">
              <input type="checkbox" checked={todosMarcados} onChange={toggleTodos} />
              selecionar todos
            </label>

            {/* desktop: tabela */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="font-mono text-[10px] uppercase tracking-wider text-dim text-left">
                  <tr className="border-b border-navy-800">
                    <th className="py-2 pr-2 w-8"></th>
                    <th className="py-2 pr-2">Nome</th>
                    <th className="py-2 pr-2">Cidade</th>
                    <th className="py-2 pr-2">Nicho</th>
                    <th className="py-2 pr-2">Telefone</th>
                    <th className="py-2 pr-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {naoAtribuidos.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-navy-800/50 hover:bg-navy-800/40 cursor-pointer"
                      onClick={() => toggle(l.id)}
                    >
                      <td className="py-2 pr-2">
                        <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} />
                      </td>
                      <td className="py-2 pr-2 font-medium">{l.nome}</td>
                      <td className="py-2 pr-2 text-dim">{l.cidade}</td>
                      <td className="py-2 pr-2 text-dim">{l.nicho}</td>
                      <td className="py-2 pr-2 data text-dim">{formatPhone(l.telefone)}</td>
                      <td className="py-2 pr-2 text-right data text-paper">{l.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile: cards */}
            <div className="md:hidden space-y-2">
              {naoAtribuidos.map((l) => (
                <label
                  key={l.id}
                  className="flex items-start gap-3 rounded-xl bg-navy-800/60 p-3"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={sel.has(l.id)}
                    onChange={() => toggle(l.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm leading-snug">{l.nome}</span>
                      <span className="data text-[11px] text-dim shrink-0">{l.score}</span>
                    </div>
                    <p className="font-mono text-[11px] text-dim mt-0.5">
                      {l.nicho} · {l.cidade}
                    </p>
                    <p className="data text-[11px] text-dim/70">{formatPhone(l.telefone)}</p>
                  </div>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
