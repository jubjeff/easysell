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
    return <p className="card text-sm text-zinc-400">Esta área é exclusiva do administrador.</p>;
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Distribuição de leads</h1>
        {msg && <span className="text-sm text-emerald-400">✓ {msg}</span>}
      </div>
      {erro && <p className="card border-red-900 text-red-300 text-sm">{erro}</p>}

      {/* carteira de cada vendedor */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {vendedores.map((v) => (
          <div key={v.id} className="card text-center py-3">
            <div className="text-2xl font-bold text-emerald-400">{v.carteira}</div>
            <div className="text-xs text-zinc-400">
              {v.nome}
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
      <div className="card space-y-3 border-zinc-700">
        <h2 className="text-sm font-bold text-zinc-300">Rodízio automático (round-robin)</h2>
        <p className="text-xs text-zinc-500">
          Distribui os não atribuídos (respeitando o filtro acima) igualmente entre os vendedores marcados.
        </p>
        <div className="flex flex-wrap gap-2">
          {vendedores.filter((v) => v.ativo).map((v) => (
            <button
              key={v.id}
              onClick={() => toggleAuto(v.id)}
              className={`badge cursor-pointer border px-3 py-1.5 ${
                autoSel.has(v.id)
                  ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
              }`}
            >
              {v.nome}
            </button>
          ))}
        </div>
        <button className="btn-secondary" onClick={auto} disabled={autoSel.size === 0 || naoAtribuidos.length === 0}>
          🔀 Distribuir {naoAtribuidos.length} lead(s) por rodízio
        </button>
      </div>

      {/* atribuição manual */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-zinc-300">
            Não atribuídos ({naoAtribuidos.length})
          </h2>
          <div className="flex items-center gap-2">
            <select className="input !w-auto" value={alvo} onChange={(e) => setAlvo(e.target.value)}>
              <option value="">Atribuir a…</option>
              {vendedores.filter((v) => v.ativo).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
            <button className="btn-primary" onClick={atribuir} disabled={!alvo || sel.size === 0}>
              Atribuir {sel.size > 0 ? `(${sel.size})` : ""}
            </button>
          </div>
        </div>

        {naoAtribuidos.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum lead não atribuído. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={sel.size === naoAtribuidos.length && naoAtribuidos.length > 0}
                      onChange={toggleTodos}
                    />
                  </th>
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
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                    onClick={() => toggle(l.id)}
                  >
                    <td className="py-1.5 pr-2">
                      <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} />
                    </td>
                    <td className="py-1.5 pr-2">{l.nome}</td>
                    <td className="py-1.5 pr-2 text-zinc-400">{l.cidade}</td>
                    <td className="py-1.5 pr-2 text-zinc-400">{l.nicho}</td>
                    <td className="py-1.5 pr-2 text-zinc-400">{formatPhone(l.telefone)}</td>
                    <td className="py-1.5 pr-2 text-right text-emerald-400">{l.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
