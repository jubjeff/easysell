"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { STAGES, LeadStage } from "@/lib/types";
import { formatPhone } from "@/lib/phone";

const BRL = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Rampa de cor por estágio: violeta (frio) → lima (ganho); perdido apagado. */
const STAGE_COLOR: Record<LeadStage, string> = {
  novo: "#8B7CF6",
  contactado: "#7C86F6",
  respondeu: "#5FA8E6",
  demo_enviada: "#4FC7BE",
  negociacao: "#86D24E",
  fechado: "#A3E635",
  perdido: "#5B6577",
};

export default function FunilPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [filtroVend, setFiltroVend] = useState("");
  const [mobileStage, setMobileStage] = useState<LeadStage>("novo");

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

  if (loading)
    return <p className="font-mono text-sm text-dim animate-pulse">carregando funil…</p>;

  const total = leads.length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="tag-state text-dim">funil</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            Pipeline
            <span className="data text-dim text-base font-normal ml-2">{total} leads</span>
          </h1>
        </div>
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

      {/* ===== desktop: board Kanban com drag-drop ===== */}
      <div className="hidden md:flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
        {STAGES.map((s) => {
          const col = leads.filter((l) => l.stage === s.key);
          const cor = STAGE_COLOR[s.key];
          const ativo = over === s.key;
          return (
            <div
              key={s.key}
              className={`w-64 shrink-0 rounded-2xl bg-navy-900/50 transition-colors ${
                ativo ? "ring-2 ring-inset" : ""
              }`}
              style={ativo ? ({ "--tw-ring-color": cor } as React.CSSProperties) : undefined}
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
              {/* filete de cor + cabeçalho */}
              <div className="h-0.5 rounded-t-2xl" style={{ background: cor }} />
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs font-semibold tracking-wide text-paper">{s.label}</span>
                <span className="data text-xs" style={{ color: cor }}>
                  {String(col.length).padStart(2, "0")}
                </span>
              </div>
              <div className="space-y-2 min-h-16 px-2 pb-2">
                {col.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    className="group rounded-xl bg-navy-800/70 p-3 cursor-grab active:cursor-grabbing hover:bg-navy-800 transition-colors animate-settle-in"
                  >
                    <Card lead={l} />
                  </div>
                ))}
                {col.length === 0 && (
                  <p className="font-mono text-[10px] text-dim/40 text-center py-4">vazio</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== mobile: seletor de estágio + lista vertical ===== */}
      <div className="md:hidden space-y-3">
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          {STAGES.map((s) => {
            const n = leads.filter((l) => l.stage === s.key).length;
            const sel = mobileStage === s.key;
            const cor = STAGE_COLOR[s.key];
            return (
              <button
                key={s.key}
                onClick={() => setMobileStage(s.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                  sel ? "text-navy-950" : "text-dim border-navy-700 bg-navy-900"
                }`}
                style={sel ? { background: cor, borderColor: cor } : undefined}
              >
                {s.label} <span className="data ml-0.5">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          {leads
            .filter((l) => l.stage === mobileStage)
            .map((l) => (
              <div key={l.id} className="card !p-3 animate-settle-in">
                <Card lead={l} />
                <div className="mt-2.5 pt-2.5 border-t border-navy-800">
                  <label className="font-mono text-[10px] text-dim mr-2">mover →</label>
                  <select
                    className="input !w-auto !py-1 !px-2 text-xs inline-block"
                    value={l.stage}
                    onChange={(e) => moveTo(l.id, e.target.value as LeadStage)}
                  >
                    {STAGES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          {leads.filter((l) => l.stage === mobileStage).length === 0 && (
            <p className="card text-center font-mono text-xs text-dim py-8">
              nenhum lead em {STAGES.find((s) => s.key === mobileStage)?.label.toLowerCase()}
            </p>
          )}
        </div>
      </div>

      <p className="hidden md:block font-mono text-[11px] text-dim/70">
        arraste os cards entre colunas · ao soltar em <b className="text-lima">Fechado</b>, informe o
        valor da venda — a comissão sai automática
      </p>
    </div>
  );
}

/** Card de lead: nome forte → metadados apagados → valor. */
function Card({ lead: l }: { lead: any }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${l.id}`}
          className="font-medium text-sm text-paper hover:text-lima transition-colors leading-snug"
        >
          {l.nome}
        </Link>
        <span className="data text-[11px] text-dim shrink-0 mt-0.5">{l.score}</span>
      </div>
      <p className="font-mono text-[11px] text-dim mt-1">
        {l.nicho} · {l.cidade}
      </p>
      <p className="data text-[11px] text-dim/70 mt-0.5">{formatPhone(l.telefone)}</p>
      {l.stage === "fechado" && l.valor_venda != null ? (
        <p className="data text-sm text-lima font-semibold mt-1.5">{BRL(l.valor_venda)}</p>
      ) : (
        l.valor_proposto != null && (
          <p className="data text-[11px] text-dim mt-1.5">proposta {BRL(l.valor_proposto)}</p>
        )
      )}
      {/* atalho p/ a demo do nicho, já com {nome_negocio} pré-preenchido */}
      <Link
        href={`/demos?nicho=${encodeURIComponent(l.nicho)}&negocio=${encodeURIComponent(l.nome)}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 mt-2 font-mono text-[10px] text-dim hover:text-lima transition-colors"
      >
        🖼️ ver demos
      </Link>
    </>
  );
}
