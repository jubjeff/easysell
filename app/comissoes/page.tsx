"use client";

import { useCallback, useEffect, useState } from "react";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function mesAno(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
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
      setMsg(status === "pago" ? "Marcado como pago" : "Reaberto");
      setTimeout(() => setMsg(""), 2000);
      load();
    }
  }

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

  const StatusBadge = ({ pago }: { pago: boolean }) =>
    pago ? (
      <span className="badge bg-navy-800 text-dim">pago</span>
    ) : (
      <span className="badge bg-amber-900/50 text-amber-300">a pagar</span>
    );

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <span className="tag-state text-dim">{isAdmin ? "comissões_equipe" : "minhas_comissões"}</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {isAdmin ? "Comissões da equipe" : "Minhas comissões"}
          </h1>
        </div>
        {msg && <span className="font-mono text-xs text-lima">✓ {msg}</span>}
      </div>

      {/* resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <div className="data text-xl sm:text-2xl font-semibold text-lima">{BRL(totalMes)}</div>
          <div className="font-mono text-[11px] text-dim mt-1">do mês</div>
        </div>
        <div className="card text-center">
          <div className="data text-xl sm:text-2xl font-semibold text-amber-400">{BRL(totalAPagar)}</div>
          <div className="font-mono text-[11px] text-dim mt-1">a pagar</div>
        </div>
        <div className="card text-center">
          <div className="data text-xl sm:text-2xl font-semibold text-paper">{BRL(totalPago)}</div>
          <div className="font-mono text-[11px] text-dim mt-1">já pago</div>
        </div>
      </div>

      {/* consolidado por vendedor (admin) */}
      {isAdmin && Object.keys(porVendedor).length > 0 && (
        <div className="card">
          <h2 className="tag-state text-dim mb-3">consolidado_por_vendedor</h2>
          <div className="space-y-1.5">
            {Object.values(porVendedor).map((v) => (
              <div
                key={v.nome}
                className="flex items-center justify-between py-1.5 border-b border-navy-800/50 last:border-0"
              >
                <span className="font-medium text-sm">{v.nome}</span>
                <span className="flex gap-4 text-sm">
                  <span className="data text-amber-400">{BRL(v.aPagar)}</span>
                  <span className="data text-dim">{BRL(v.pago)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ação em lote (admin) */}
      {isAdmin && aPagar.length > 0 && (
        <div className="card flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-dim">
            {sel.size > 0 ? `${sel.size} selecionada(s)` : "marque comissões para pagar"}
          </span>
          <button
            className="btn-primary"
            disabled={sel.size === 0}
            onClick={() => marcar("pago", Array.from(sel))}
          >
            Marcar como pago
          </button>
        </div>
      )}

      {/* lista */}
      {comissoes.length === 0 ? (
        <div className="card py-10 text-center space-y-2">
          <p className="tag-state text-dim">sem_comissões</p>
          <p className="text-sm text-dim">
            Comissões aparecem ao mover um lead para <b className="text-lima">Fechado</b> com o valor
            da venda preenchido.
          </p>
        </div>
      ) : (
        <>
          {/* desktop: tabela */}
          <div className="card hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="font-mono text-[10px] uppercase tracking-wider text-dim text-left">
                <tr className="border-b border-navy-800">
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
                  <tr key={c.id} className="border-b border-navy-800/50">
                    {isAdmin && (
                      <td className="py-2 pr-2">
                        {c.status === "a_pagar" && (
                          <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} />
                        )}
                      </td>
                    )}
                    <td className="py-2 pr-2 font-medium">{c.leads?.nome ?? "—"}</td>
                    {isAdmin && <td className="py-2 pr-2 text-dim">{c.profiles?.nome ?? "—"}</td>}
                    <td className="py-2 pr-2 data text-dim">{mesAno(c.fechado_em)}</td>
                    <td className="py-2 pr-2 text-right data text-dim">{BRL(Number(c.valor_venda))}</td>
                    <td className="py-2 pr-2 text-right data text-dim">{Number(c.percentual)}%</td>
                    <td className="py-2 pr-2 text-right data font-semibold text-lima">
                      {BRL(Number(c.valor_comissao))}
                    </td>
                    <td className="py-2 pr-2 text-center">
                      <StatusBadge pago={c.status === "pago"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile: cards */}
          <div className="md:hidden space-y-2">
            {comissoes.map((c) => (
              <div key={c.id} className="card !p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2">
                    {isAdmin && c.status === "a_pagar" && (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={sel.has(c.id)}
                        onChange={() => toggle(c.id)}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm leading-snug">{c.leads?.nome ?? "—"}</p>
                      <p className="font-mono text-[11px] text-dim">
                        {isAdmin ? `${c.profiles?.nome ?? "—"} · ` : ""}
                        {mesAno(c.fechado_em)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge pago={c.status === "pago"} />
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-navy-800">
                  <span className="data text-[11px] text-dim">
                    {BRL(Number(c.valor_venda))} · {Number(c.percentual)}%
                  </span>
                  <span className="data text-base font-semibold text-lima">
                    {BRL(Number(c.valor_comissao))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
