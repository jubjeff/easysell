"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STAGES, LeadStage } from "@/lib/types";
import { formatPhone } from "@/lib/phone";

export default function FunilPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function moveTo(id: string, stage: LeadStage) {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)));
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
  }

  if (loading) return <p className="text-zinc-500">Carregando…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Funil</h1>
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
                    {l.valor_proposto != null && (
                      <p className="text-xs text-emerald-400 mt-1">
                        R$ {Number(l.valor_proposto).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-zinc-500">
        Arraste os cards entre colunas. Clique no nome para ver notas, histórico e proposta.
      </p>
    </div>
  );
}
