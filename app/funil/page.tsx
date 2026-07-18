"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { STAGES, LeadStage } from "@/lib/types";
import { formatPhone } from "@/lib/phone";

const BRL = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FunilPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [filtroVend, setFiltroVend] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const meData = await fetch("/api/me").then((r) => r.json());
    const admin = meData.profile?.role === "admin";
    setIsAdmin(admin);
    if (admin && vendedores.length === 0) {
      const v = await fetch("/api/vendedores").then((r) => r.json());
      setVendedores(v.vendedores ?? []);
    }
    const qs = admin && filtroVend ? `?vendedor=${filtroVend}` : "";
    const d = await fetch(`/api/leads${qs}`).then((r) => r.json());
    setLeads(d.leads ?? []);
    setLoading(false);
  }, [filtroVend, vendedores.length]);

  useEffect(() => {
    load();
  }, [load]);

  async function moveTo(id: string, stage: LeadStage) {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;

    const patch: Record<string, unknown> = { stage };

    // ao fechar, pede o valor da venda (base da comissão)
    if (stage === "fechado") {
      const atual = lead.valor_venda ?? lead.valor_proposto ?? "";
      const entrada = window.prompt("Valor da venda (R$):", String(atual));
      if (entrada === null) return; // cancelou
      const valor = Number(entrada.replace(/\./g, "").replace(",", "."));
      if (!isNaN(valor) && valor > 0) patch.valor_venda = valor;
    }

    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  if (loading) return <p className="text-zinc-500">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold">Funil</h1>
        {isAdmin && (
          <select
            className="input !w-auto"
            value={filtroVend}
            onChange={(e) => setFiltroVend(e.target.value)}
          >
            <option value="">Todos os vendedores</option>
            <option value="nao_atribuido">— Não atribuídos —</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
        {STAGES.map((s) => {
          const col = leads.filter((l) => l.stage === s.key);
          return (
            <div
              key={s.key}
              className={`w-60 shrink-0 rounded-xl border p-2 transition-colors ${
                over === s.key ? "border-emerald-500 bg-emerald-950/20" : "border-zinc-800 bg-zinc-900/40"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s.key);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={() => {
                if (dragId) moveTo(dragId, s.key);
                setDragId(null);
                setOver(null);
              }}
            >
              <div className="text-xs font-bold text-zinc-400 px-2 py-1 flex justify-between">
                {s.label} <span className="text-zinc-600">{col.length}</span>
              </div>
              <div className="space-y-2 min-h-16">
                {col.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    className="card p-3 cursor-grab active:cursor-grabbing hover:border-zinc-600"
                  >
                    <Link href={`/leads/${l.id}`} className="font-medium text-sm hover:text-emerald-300">
                      {l.nome}
                    </Link>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {l.cidade} · {formatPhone(l.telefone)}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] text-zinc-500">{l.nicho}</span>
                      <span className="badge bg-emerald-900/60 text-emerald-300">{l.score}</span>
                    </div>
                    {l.stage === "fechado" && l.valor_venda != null ? (
                      <p className="text-xs text-emerald-400 mt-1 font-semibold">{BRL(l.valor_venda)}</p>
                    ) : (
                      l.valor_proposto != null && (
                        <p className="text-xs text-zinc-400 mt-1">proposta {BRL(l.valor_proposto)}</p>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-zinc-500">
        Arraste os cards entre colunas. Ao soltar em <b>Fechado</b>, informe o valor da venda — a comissão é calculada automaticamente.
      </p>
    </div>
  );
}
