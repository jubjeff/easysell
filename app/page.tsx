"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STAGES } from "@/lib/types";

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
      <div className="card border-red-900 text-sm text-red-300">
        <p className="font-bold mb-1">Erro ao carregar</p>
        <p>{error}</p>
        <p className="mt-2 text-zinc-400">
          Verifique se o .env.local está preenchido e se o schema.sql foi executado no Supabase.
        </p>
      </div>
    );
  if (!m) return <p className="text-zinc-500">Carregando…</p>;

  const alertas = (m.porCampanha ?? []).filter(
    (c: any) => c.limiar != null && c.enviados >= 10 && c.taxa < Number(c.limiar)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <Link href="/sessao" className="btn-primary self-start sm:self-auto">
          🚀 Iniciar sessão de disparo
        </Link>
      </div>

      {/* saúde dos chips */}
      {m.saudeChips.length === 0 ? (
        <div className="card text-sm text-zinc-400">
          Nenhum chip cadastrado.{" "}
          <a href="/chips" className="text-emerald-400 underline">
            Cadastre um chip
          </a>{" "}
          para começar a disparar.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {m.saudeChips.map((c: any) => (
            <div key={c.id} className="card">
              <p className="text-sm font-bold">{c.nome}</p>
              <p className="text-xs text-zinc-500 mb-2">
                {c.preset.fase} · {c.preset.idadeDias}d
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-emerald-400">{c.hoje}</span>
                <span className="text-sm text-zinc-500">/{c.limite} hoje</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">{c.semana} na semana</p>
            </div>
          ))}
        </div>
      )}

      <div className="card text-center">
        <div className="text-3xl font-bold text-emerald-400">{m.conversaoDemo.taxa}%</div>
        <div className="text-xs text-zinc-400 mt-1">
          conversão demo → fechado ({m.conversaoDemo.fechados}/{m.conversaoDemo.demos})
        </div>
      </div>

      {/* ranking de vendedores — só admin */}
      {m.ranking && m.ranking.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-bold text-zinc-400 mb-3">🏆 Desempenho por vendedor</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Vendedor</th>
                  <th className="py-2 pr-2 text-right">Trabalhados</th>
                  <th className="py-2 pr-2 text-right">Resposta</th>
                  <th className="py-2 pr-2 text-right">Fechamento</th>
                  <th className="py-2 pr-2 text-right">Fechados</th>
                </tr>
              </thead>
              <tbody>
                {m.ranking.map((v: any, i: number) => (
                  <tr key={v.id} className="border-b border-zinc-800/50">
                    <td className="py-1.5 pr-2 text-zinc-500">{i + 1}º</td>
                    <td className="py-1.5 pr-2 font-medium">{v.nome}</td>
                    <td className="py-1.5 pr-2 text-right text-zinc-400">{v.trabalhados}</td>
                    <td className="py-1.5 pr-2 text-right text-zinc-300">{v.taxaResposta}%</td>
                    <td className="py-1.5 pr-2 text-right text-zinc-300">{v.taxaFechamento}%</td>
                    <td className="py-1.5 pr-2 text-right font-bold text-emerald-400">{v.fechados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {alertas.length > 0 && (
        <div className="card border-amber-800 bg-amber-950/30">
          <p className="text-sm font-bold text-amber-300 mb-1">⚠️ Taxa de resposta baixa</p>
          {alertas.map((a: any) => (
            <p key={a.key} className="text-sm text-amber-200/80">
              {a.nome}: {a.taxa}% (limiar {a.limiar}%) — considere trocar o template ou o nicho.
            </p>
          ))}
        </div>
      )}

      {/* funil resumido */}
      <div>
        <h2 className="text-sm font-bold text-zinc-400 mb-2">Funil</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {STAGES.map((s) => (
            <Link
              href="/funil"
              key={s.key}
              className="card text-center hover:border-zinc-600 p-2.5 md:p-4"
            >
              <div className="text-xl font-bold">{m.funil[s.key] ?? 0}</div>
              <div className="text-[11px] text-zinc-400">{s.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* taxas de resposta */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { titulo: "Por template", rows: m.porTemplate, nome: (r: any) => r.nome },
          { titulo: "Por nicho", rows: m.porNicho, nome: (r: any) => r.key },
          { titulo: "Por cidade", rows: m.porCidade, nome: (r: any) => r.key },
        ].map((sec) => (
          <div key={sec.titulo} className="card">
            <h3 className="text-sm font-bold text-zinc-400 mb-2">
              Taxa de resposta · {sec.titulo}
            </h3>
            {sec.rows.length === 0 ? (
              <p className="text-xs text-zinc-500">Sem envios ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {sec.rows.slice(0, 6).map((r: any) => (
                    <tr key={r.key} className="border-t border-zinc-800/60">
                      <td className="py-1.5 pr-2 truncate max-w-32">{sec.nome(r)}</td>
                      <td className="py-1.5 text-zinc-500 text-xs">
                        {r.respostas}/{r.enviados}
                      </td>
                      <td className="py-1.5 text-right font-bold text-emerald-400">{r.taxa}%</td>
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
