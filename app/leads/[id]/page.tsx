"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { STAGES } from "@/lib/types";
import { formatPhone, waLink } from "@/lib/phone";

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/leads/${id}`);
    if (res.ok) setData(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <p className="text-zinc-500">Carregando…</p>;
  const { lead, notes, logs } = data;

  async function patch(fields: Record<string, unknown>) {
    setSaving(true);
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setSaving(false);
    load();
  }

  async function addNote() {
    if (!nota.trim()) return;
    await fetch(`/api/leads/${id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: nota }),
    });
    setNota("");
    load();
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{lead.nome}</h1>
          <p className="text-sm text-zinc-400">
            {lead.cidade} · {lead.nicho} · {formatPhone(lead.telefone)}
            {lead.rating ? ` · ${lead.rating}⭐ (${lead.qtd_avaliacoes})` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            className="btn-primary"
            href={waLink(lead.telefone)}
            target="_blank"
            rel="noopener noreferrer"
          >
            🟢 WhatsApp
          </a>
          <button
            className="btn-danger"
            onClick={async () => {
              if (confirm("Excluir este lead e todo o histórico dele?")) {
                await fetch(`/api/leads/${id}`, { method: "DELETE" });
                router.push("/funil");
              }
            }}
          >
            Excluir
          </button>
        </div>
      </div>

      {/* CRM */}
      <div className="card grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Estágio</label>
          <select
            className="input"
            value={lead.stage}
            onChange={(e) => patch({ stage: e.target.value })}
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Link da demo</label>
          <input
            className="input"
            defaultValue={lead.demo_url ?? ""}
            placeholder="https://…"
            onBlur={(e) => e.target.value !== (lead.demo_url ?? "") && patch({ demo_url: e.target.value || null })}
          />
        </div>
        <div>
          <label className="label">Valor proposto (R$)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            defaultValue={lead.valor_proposto ?? ""}
            onBlur={(e) =>
              patch({ valor_proposto: e.target.value ? Number(e.target.value) : null })
            }
          />
        </div>
        <div>
          <label className="label">Plano / tier</label>
          <input
            className="input"
            defaultValue={lead.plano ?? ""}
            placeholder="ex: básico, premium…"
            onBlur={(e) => e.target.value !== (lead.plano ?? "") && patch({ plano: e.target.value || null })}
          />
        </div>
        {lead.stage === "perdido" && (
          <div className="md:col-span-2">
            <label className="label">Motivo da perda</label>
            <input
              className="input"
              defaultValue={lead.motivo_perda ?? ""}
              onBlur={(e) => patch({ motivo_perda: e.target.value || null })}
            />
          </div>
        )}
        {saving && <p className="text-xs text-zinc-500 md:col-span-2">Salvando…</p>}
      </div>

      {/* notas */}
      <div className="card space-y-3">
        <h2 className="text-sm font-bold text-zinc-400">Notas</h2>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Nova nota…"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNote()}
          />
          <button className="btn-secondary" onClick={addNote}>
            Adicionar
          </button>
        </div>
        {notes.map((n: any) => (
          <div key={n.id} className="text-sm border-t border-zinc-800/60 pt-2">
            <p>{n.texto}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {new Date(n.created_at).toLocaleString("pt-BR")}
            </p>
          </div>
        ))}
      </div>

      {/* histórico de mensagens */}
      <div className="card space-y-3">
        <h2 className="text-sm font-bold text-zinc-400">Histórico de mensagens</h2>
        {logs.length === 0 && <p className="text-xs text-zinc-500">Nenhuma mensagem ainda.</p>}
        {logs.map((l: any) => (
          <div key={l.id} className="text-sm border-t border-zinc-800/60 pt-2">
            <p className="text-xs text-zinc-500">
              <span className="badge bg-zinc-800 text-zinc-300 mr-2">{l.evento}</span>
              {l.templates?.nome ? `${l.templates.nome} · ` : ""}
              {new Date(l.created_at).toLocaleString("pt-BR")}
            </p>
            <p className="mt-1 text-zinc-300 whitespace-pre-wrap">{l.texto}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
