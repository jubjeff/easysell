"use client";

import { useEffect, useState } from "react";
import { playAlarm, unlockAudio } from "@/lib/alarm";

const DIAS = [
  { n: 1, label: "Seg" },
  { n: 2, label: "Ter" },
  { n: 3, label: "Qua" },
  { n: 4, label: "Qui" },
  { n: 5, label: "Sex" },
  { n: 6, label: "Sáb" },
  { n: 7, label: "Dom" },
];

export default function ConfigPage() {
  const [data, setData] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <p className="text-zinc-500">Carregando…</p>;
  if (data.error) return <p className="card border-red-900 text-red-300 text-sm">{data.error}</p>;

  const s = data.settings;

  async function patch(fields: Record<string, unknown>) {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      const full = await fetch("/api/settings").then((r) => r.json());
      setData(full);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  function toggleDia(n: number) {
    const dias = s.dias_uteis.includes(n)
      ? s.dias_uteis.filter((d: number) => d !== n)
      : [...s.dias_uteis, n].sort();
    patch({ dias_uteis: dias });
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Configurações</h1>
        {saved && <span className="text-sm text-emerald-400">✓ salvo</span>}
      </div>

      {/* aquecimento */}
      <div className="card space-y-3">
        <h2 className="text-sm font-bold text-zinc-400">Aquecimento de chip</h2>
        <div>
          <label className="label">Teto diário para sessões de aquecimento</label>
          <input
            type="number"
            min={1}
            className="input max-w-40"
            defaultValue={s.aquecimento_limite_diario}
            onBlur={(e) =>
              e.target.value && patch({ aquecimento_limite_diario: Number(e.target.value) })
            }
          />
        </div>
        <p className="text-xs text-zinc-500">
          Esse teto vale para <b>qualquer</b> chip enquanto a sessão é do tipo aquecimento — mesmo
          que o chip já esteja &ldquo;maduro&rdquo;. Cadastre e gerencie os chips em{" "}
          <a href="/chips" className="text-emerald-400 underline">
            Chips
          </a>
          .
        </p>
      </div>

      {/* janela */}
      <div className="card space-y-3">
        <h2 className="text-sm font-bold text-zinc-400">Janela de envio</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Início</label>
            <input
              type="time"
              className="input"
              defaultValue={s.janela_inicio.slice(0, 5)}
              onBlur={(e) => patch({ janela_inicio: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Fim</label>
            <input
              type="time"
              className="input"
              defaultValue={s.janela_fim.slice(0, 5)}
              onBlur={(e) => patch({ janela_fim: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="label">Dias de envio</label>
          <div className="flex gap-2">
            {DIAS.map((d) => (
              <button
                key={d.n}
                onClick={() => toggleDia(d.n)}
                className={`badge cursor-pointer border px-3 py-1.5 ${
                  s.dias_uteis.includes(d.n)
                    ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                    : "bg-zinc-800 text-zinc-500 border-zinc-700"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* som */}
      <div className="card space-y-3">
        <h2 className="text-sm font-bold text-zinc-400">Sinalização sonora</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.som_ativado}
              onChange={(e) => patch({ som_ativado: e.target.checked })}
            />
            Som ativado
          </label>
          <label className="flex items-center gap-2 text-sm">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              defaultValue={s.volume}
              onMouseUp={(e: any) => patch({ volume: Number(e.target.value) })}
            />
          </label>
          <button
            className="btn-secondary !py-1"
            onClick={() => {
              unlockAudio();
              playAlarm(Number(s.volume));
            }}
          >
            🔔 Testar som
          </button>
        </div>
      </div>
    </div>
  );
}
