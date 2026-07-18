"use client";

import { useCallback, useEffect, useState } from "react";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function mesAno(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export default function ComissoesPage() {
  const [comissoes, setComissoes] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/comissoes");
    const d = await res.json();
    setComissoes(d.comissoes ?? []);
    setIsAdmin(!!d.isAdmin);
    setSel(new Set());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const aPagar = comissoes.filter((c) => c.status === "a_pagar");
  const totalAPagar = aPagar.reduce((s, c) => s + Number(c.valor_comissao), 0);
  const totalPago = comissoes
    .filter((c) => c.status === "pago")
    .reduce((s, c) => s + Number(c.valor_comissao), 0);

  // mês corrente
  const agora = new Date();
  const doMes = comissoes.filter((c) => {
    const d = new Date(c.fechado_em);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  });
  const totalMes = doMes.reduce((s, c) => s + Number(c.valor_comissao), 0);

  function toggle(id: string) {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  }

  async function marcar(status: "pago" | "a_pagar", ids: string[]) {
    if (ids.length === 0) return;
    const res = await fetch("/api/comissoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
    if (res.ok) {
      setMsg(status === "pago" ? "Marcado como pago." : "Reaberto.");
      setTimeout(() => setMsg(""), 2000);
      load();
    }
  }

  // consolidado por vendedor (admin)
  const porVendedor: Record<string, { nome: string; aPagar: number; pago: number }> = {};
  if (isAdmin) {
    for (const c of comissoes) {
      const nome = c.profiles?.nome ?? "—";
      const key = c.vendedor_id;
      if (!porVendedor[key]) porVendedor[key] = { nome, aPagar: 0, pago: 0 };
      if (c.status === "pago") porVendedor[key].pago += Number(c.valor_comissao);
      else porVendedor[key].aPagar += Number(c.valor_comissao);
    }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {isAdmin ? "Comissões da equipe" : "Minhas comissões"}
        </h1>
        {msg && <span className="text-sm text-emerald-400">✓ {msg}</span>}
      </div>

      {/* resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <div className="text-2xl font-bold text-emerald-400">{BRL(totalMes)}</div>
          <div className="text-xs text-zinc-400 mt-1">comissão do mês</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-amber-400">{BRL(totalAPagar)}</div>
          <div className="text-xs text-zinc-400 mt-1">a pagar</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-zinc-300">{BRL(totalPago)}</div>
          <div className="text-xs text-zinc-400 mt-1">já pago</div>
        </div>
      </div>

      {/* consolidado por vendedor (admin) */}
      {isAdmin && Object.keys(porVendedor).length > 0 && (
        <div className="card">
          <h2 className="text-sm font-bold text-zinc-300 mb-3">Consolidado por vendedor</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pr-2">Vendedor</th>
                  <th className="py-2 pr-2 text-right">A pagar</th>
                  <th className="py-2 pr-2 text-right">Pago</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(porVendedor).map((v) => (
                  <tr key={v.nome} className="border-b border-zinc-800/50">
                    <td className="py-1.5 pr-2">{v.nome}</td>
                    <td className="py-1.5 pr-2 text-right text-amber-400">{BRL(v.aPagar)}</td>
                    <td className="py-1.5 pr-2 text-right text-zinc-400">{BRL(v.pago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ação em lote (admin) */}
      {isAdmin && aPagar.length > 0 && (
        <div className="card flex items-center justify-between gap-3">
          <span className="text-sm text-zinc-400">
            {sel.size > 0 ? `${sel.size} selecionada(s)` : "Selecione comissões para marcar como pagas"}
          </span>
          <button className="btn-primary" disabled={sel.size === 0} onClick={() => marcar("pago", Array.from(sel))}>
            Marcar como pago
          </button>
        </div>
      )}

      {/* lista */}
      {comissoes.length === 0 ? (
        <p className="card text-sm text-zinc-500">
          Nenhuma comissão ainda. Comissões aparecem ao mover um lead para <b>Fechado</b> com o valor da venda preenchido.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-800">
                {isAdmin && <th className="py-2 pr-2"></th>}
                <th className="py-2 pr-2">Lead</th>
                {isAdmin && <th className="py-2 pr-2">Vendedor</th>}
                <th className="py-2 pr-2">Mês</th>
                <th className="py-2 pr-2 text-right">Venda</th>
                <th className="py-2 pr-2 text-right">%</th>
                <th className="py-2 pr-2 text-right">Comissão</th>
                <th className="py-2 pr-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {comissoes.map((c) => (
                <tr key={c.id} className="border-b border-zinc-800/50">
                  {isAdmin && (
                    <td className="py-1.5 pr-2">
                      {c.status === "a_pagar" && (
                        <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} />
                      )}
                    </td>
                  )}
                  <td className="py-1.5 pr-2">{c.leads?.nome ?? "—"}</td>
                  {isAdmin && <td className="py-1.5 pr-2 text-zinc-400">{c.profiles?.nome ?? "—"}</td>}
                  <td className="py-1.5 pr-2 text-zinc-400">{mesAno(c.fechado_em)}</td>
                  <td className="py-1.5 pr-2 text-right text-zinc-300">{BRL(Number(c.valor_venda))}</td>
                  <td className="py-1.5 pr-2 text-right text-zinc-500">{Number(c.percentual)}%</td>
                  <td className="py-1.5 pr-2 text-right font-bold text-emerald-400">
                    {BRL(Number(c.valor_comissao))}
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    {c.status === "pago" ? (
                      <span className="badge bg-zinc-800 text-zinc-400">pago</span>
                    ) : (
                      <span className="badge bg-amber-900/60 text-amber-300">a pagar</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
