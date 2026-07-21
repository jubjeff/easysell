"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STAGES, LeadStage } from "@/lib/types";

const STAGE_COLOR: Record<LeadStage, string> = {
  novo: "#8B7CF6",
  contactado: "#7C86F6",
  respondeu: "#5FA8E6",
  demo_enviada: "#4FC7BE",
  negociacao: "#86D24E",
  fechado: "#A3E635",
  perdido: "#5B6577",
};

const MEDALHA = ["🥇", "🥈", "🥉"];

const ORIGEM_INFO: Record<string, { label: string; icon: string }> = {
  google: { label: "Google", icon: "🔍" },
  instagram: { label: "Instagram", icon: "📸" },
  manual: { label: "Manual", icon: "✍️" },
};

/** Horas cruas → texto legível (min / h / dias), conforme a magnitude. */
function formatHoras(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export default function DashboardPage() {
  const [m, setM] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setM(d)))
      .catch((e) => setError(String(e)));
  }, []);

  if (error)
    return (
      <div className="card-line !border-red-900/70 text-sm text-red-300">
        <p className="tag-state mb-1">erro_ao_carregar</p>
        <p>{error}</p>
        <p className="mt-2 text-dim">
          Verifique se as variáveis do Supabase estão configuradas.
        </p>
      </div>
    );
  if (!m) return <p className="font-mono text-sm text-dim animate-pulse">carregando painel…</p>;

  const alertas = (m.porCampanha ?? []).filter(
    (c: any) => c.limiar != null && c.enviados >= 10 && c.taxa < Number(c.limiar)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <span className="tag-state text-dim">visão_geral</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Painel</h1>
        </div>
        <Link href="/sessao" className="btn-primary self-start sm:self-auto">
          🚀 Iniciar sessão de disparo
        </Link>
      </div>

      {/* saúde dos chips */}
      {m.saudeChips.length === 0 ? (
        <div className="card py-8 text-center space-y-2">
          <p className="tag-state text-dim">sem_chips</p>
          <p className="text-sm text-dim">
            Cadastre um chip para começar a disparar com segurança.
          </p>
          <Link href="/chips" className="btn-primary mt-1">
            Cadastrar chip
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {m.saudeChips.map((c: any) => {
            const pct = c.limite ? Math.min(100, (c.hoje / c.limite) * 100) : 0;
            return (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-semibold">{c.nome}</p>
                  <span className="font-mono text-[10px] text-dim">{c.preset.idadeDias}d</span>
                </div>
                <p className="font-mono text-[11px] text-dim mb-3">{c.preset.fase}</p>
                <div className="flex items-baseline gap-1">
                  <span className="data text-3xl font-semibold text-lima">{c.hoje}</span>
                  <span className="data text-sm text-dim">/{c.limite} hoje</span>
                </div>
                <div className="mt-2 h-1 rounded-full bg-navy-800 overflow-hidden">
                  <div className="h-full bg-lima/70 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="font-mono text-[11px] text-dim mt-1.5">{c.semana} na semana</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="card flex items-center justify-between">
        <div>
          <div className="data text-3xl font-semibold text-lima">{m.conversaoDemo.taxa}%</div>
          <div className="font-mono text-[11px] text-dim mt-0.5">conversão demo → fechado</div>
        </div>
        <span className="data text-sm text-dim">
          {m.conversaoDemo.fechados}/{m.conversaoDemo.demos}
        </span>
      </div>

      {/* performance por canal de captação (google/instagram/manual) */}
      {m.porOrigem && m.porOrigem.length > 0 && (
        <div className="card">
          <h2 className="tag-state text-dim mb-3">performance_por_origem</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="font-mono text-[10px] uppercase tracking-wider text-dim text-left">
                <tr className="border-b border-navy-800">
                  <th className="py-2 pr-2">Canal</th>
                  <th className="py-2 pr-2 text-right">Leads</th>
                  <th className="py-2 pr-2 text-right">Contatados</th>
                  <th className="py-2 pr-2 text-right">Resposta</th>
                  <th className="py-2 pr-2 text-right">Fechamento</th>
                  <th className="py-2 pr-2 text-right">Tempo até resposta</th>
                </tr>
              </thead>
              <tbody>
                {m.porOrigem.map((o: any) => {
                  const info = ORIGEM_INFO[o.origem] ?? { label: o.origem, icon: "•" };
                  return (
                    <tr key={o.origem} className="border-b border-navy-800/50">
                      <td className="py-2 pr-2 font-medium">
                        {info.icon} {info.label}
                      </td>
                      <td className="py-2 pr-2 text-right data text-dim">{o.total}</td>
                      <td className="py-2 pr-2 text-right data text-dim">{o.contactados}</td>
                      <td className="py-2 pr-2 text-right data font-semibold text-lima">
                        {o.taxaResposta}%
                      </td>
                      <td className="py-2 pr-2 text-right data text-paper">{o.taxaFechamento}%</td>
                      <td className="py-2 pr-2 text-right data text-dim">
                        {formatHoras(o.tempoMedioRespostaHoras)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="font-mono text-[10px] text-dim/60 mt-2">
            resposta = respondidos ÷ contatados · fechamento = fechados ÷ total de leads do canal
          </p>
        </div>
      )}

      {/* ranking de vendedores — só admin */}
      {m.ranking && m.ranking.length > 0 && (
        <div className="card">
          <h2 className="tag-state text-dim mb-3">ranking_vendedores</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="font-mono text-[10px] uppercase tracking-wider text-dim text-left">
                <tr className="border-b border-navy-800">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Vendedor</th>
                  <th className="py-2 pr-2 text-right">Trab.</th>
                  <th className="py-2 pr-2 text-right">Resp.</th>
                  <th className="py-2 pr-2 text-right">Fech.</th>
                  <th className="py-2 pr-2 text-right">Vendas</th>
                </tr>
              </thead>
              <tbody>
                {m.ranking.map((v: any, i: number) => (
                  <tr key={v.id} className="border-b border-navy-800/50">
                    <td className="py-2 pr-2">{MEDALHA[i] ?? <span className="data text-dim">{i + 1}º</span>}</td>
                    <td className="py-2 pr-2 font-medium">{v.nome}</td>
                    <td className="py-2 pr-2 text-right data text-dim">{v.trabalhados}</td>
                    <td className="py-2 pr-2 text-right data text-dim">{v.taxaResposta}%</td>
                    <td className="py-2 pr-2 text-right data text-dim">{v.taxaFechamento}%</td>
                    <td className="py-2 pr-2 text-right data font-semibold text-lima">{v.fechados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {alertas.length > 0 && (
        <div className="card-line !border-amber-800/70 bg-amber-950/20">
          <p className="tag-state text-amber-300 mb-1">taxa_resposta_baixa</p>
          {alertas.map((a: any) => (
            <p key={a.key} className="text-sm text-amber-200/80">
              {a.nome}: <span className="data">{a.taxa}%</span> (limiar {a.limiar}%) — considere
              trocar o template ou o nicho.
            </p>
          ))}
        </div>
      )}

      {/* funil resumido */}
      <div>
        <h2 className="tag-state text-dim mb-2">funil</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {STAGES.map((s) => (
            <Link
              href="/funil"
              key={s.key}
              className="card !p-3 text-center hover:bg-navy-800 transition-colors relative overflow-hidden"
            >
              <span
                className="absolute inset-x-0 top-0 h-0.5"
                style={{ background: STAGE_COLOR[s.key] }}
              />
              <div className="data text-2xl font-semibold" style={{ color: STAGE_COLOR[s.key] }}>
                {m.funil[s.key] ?? 0}
              </div>
              <div className="font-mono text-[10px] text-dim mt-0.5">{s.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* taxas de resposta */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { titulo: "template", rows: m.porTemplate, nome: (r: any) => r.nome },
          { titulo: "nicho", rows: m.porNicho, nome: (r: any) => r.key },
          { titulo: "cidade", rows: m.porCidade, nome: (r: any) => r.key },
        ].map((sec) => (
          <div key={sec.titulo} className="card">
            <h3 className="tag-state text-dim mb-2">resposta_por_{sec.titulo}</h3>
            {sec.rows.length === 0 ? (
              <p className="font-mono text-xs text-dim">sem envios ainda</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {sec.rows.slice(0, 6).map((r: any) => (
                    <tr key={r.key} className="border-t border-navy-800/60">
                      <td className="py-1.5 pr-2 truncate max-w-32">{sec.nome(r)}</td>
                      <td className="py-1.5 data text-dim text-xs">
                        {r.respostas}/{r.enviados}
                      </td>
                      <td className="py-1.5 text-right data font-semibold text-lima">{r.taxa}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
