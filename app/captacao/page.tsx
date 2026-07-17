"use client";

import { useState } from "react";
import { formatPhone } from "@/lib/phone";

const tempBadge: Record<string, string> = {
  quente: "bg-red-900/60 text-red-300",
  morno: "bg-amber-900/60 text-amber-300",
  frio: "bg-sky-900/60 text-sky-300",
};

/** Parser CSV simples com suporte a aspas. Separador , ou ; */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === sep && !inQ) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase().trim());
  return lines.slice(1).map((line) => {
    const vals = split(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = vals[i] ?? ""));
    return row;
  });
}

export default function CaptacaoPage() {
  const [nicho, setNicho] = useState("");
  const [cidade, setCidade] = useState("");
  const [provider, setProvider] = useState<"osm" | "google">("osm");
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [csvInfo, setCsvInfo] = useState("");

  async function search(pageToken?: string) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/places/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nicho, cidade, pageToken, provider }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Erro na busca.");
      return;
    }
    if (data.aviso) setMsg(data.aviso);
    const novos = pageToken ? [...results, ...data.results] : data.results;
    setResults(novos);
    setNextToken(data.nextPageToken);
    // pré-seleciona: com telefone, não duplicado, não frio
    setSelected(
      new Set(
        novos
          .filter((r: any) => !r.duplicado && !r.sem_telefone && r.temperatura !== "frio")
          .map((r: any) => r.google_place_id)
      )
    );
  }

  async function importSelected() {
    const leads = results.filter((r) => selected.has(r.google_place_id));
    if (leads.length === 0) return;
    setBusy(true);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads, source: "places" }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(
      res.ok
        ? `✅ ${data.inserted} leads importados · ${data.duplicated} duplicados ignorados · ${data.invalid} inválidos`
        : data.error
    );
    if (res.ok) search(); // refaz para atualizar flags de duplicado
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      setCsvInfo("CSV vazio ou sem cabeçalho. Esperado: nome,telefone,cidade,nicho[,endereco,rating,qtd_avaliacoes,website]");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads: rows, source: "csv" }),
    });
    const data = await res.json();
    setBusy(false);
    setCsvInfo(
      res.ok
        ? `✅ ${data.inserted} importados · ${data.duplicated} duplicados · ${data.invalid} inválidos${
            data.invalidos?.length ? ` (${data.invalidos.slice(0, 5).join(", ")})` : ""
          }`
        : data.error
    );
  }

  function toggle(id: string) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Captação de leads</h1>

      {/* busca Places */}
      <div className="card space-y-3">
        <h2 className="text-sm font-bold text-zinc-400">Buscar negócios</h2>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={provider === "osm"}
              onChange={() => setProvider("osm")}
            />
            OpenStreetMap <span className="text-emerald-400 text-xs">(grátis, sem rating)</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={provider === "google"}
              onChange={() => setProvider("google")}
            />
            Google Places <span className="text-zinc-500 text-xs">(requer API key)</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-40"
            placeholder="Nicho (ex: advogado)"
            value={nicho}
            onChange={(e) => setNicho(e.target.value)}
          />
          <input
            className="input flex-1 min-w-40"
            placeholder="Cidade (ex: Caruaru)"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={busy || !nicho || !cidade}
            onClick={() => search()}
          >
            {busy ? "Buscando…" : "🔎 Buscar"}
          </button>
        </div>
        {msg && <p className="text-sm text-zinc-300">{msg}</p>}
      </div>

      {/* resultados */}
      {results.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-400">
              {results.length} resultados · {selected.size} selecionados
            </h2>
            <button className="btn-primary" disabled={busy || selected.size === 0} onClick={importSelected}>
              ⬇️ Importar selecionados
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 text-left">
                <tr>
                  <th className="p-2"></th>
                  <th className="p-2">Nome</th>
                  <th className="p-2">Telefone</th>
                  <th className="p-2">Rating</th>
                  <th className="p-2">Site</th>
                  <th className="p-2">Temp.</th>
                  <th className="p-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.google_place_id}
                    className={`border-t border-zinc-800/60 ${
                      r.duplicado || r.sem_telefone ? "opacity-40" : ""
                    }`}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.google_place_id)}
                        disabled={r.duplicado || r.sem_telefone}
                        onChange={() => toggle(r.google_place_id)}
                      />
                    </td>
                    <td className="p-2 font-medium">
                      {r.nome}
                      {r.duplicado && <span className="ml-1 text-xs text-zinc-500">(já na base)</span>}
                      {r.sem_telefone && <span className="ml-1 text-xs text-zinc-500">(sem telefone)</span>}
                    </td>
                    <td className="p-2 text-zinc-400">{r.telefone ? formatPhone(r.telefone) : "—"}</td>
                    <td className="p-2 text-zinc-400">
                      {r.rating ? `${r.rating}⭐ (${r.qtd_avaliacoes})` : "—"}
                    </td>
                    <td className="p-2 text-zinc-400 max-w-40 truncate">{r.website ?? "—"}</td>
                    <td className="p-2">
                      <span className={`badge ${tempBadge[r.temperatura]}`}>{r.temperatura}</span>
                    </td>
                    <td className="p-2 font-bold text-emerald-400">{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextToken && (
            <button className="btn-secondary" disabled={busy} onClick={() => search(nextToken)}>
              Carregar mais resultados
            </button>
          )}
        </div>
      )}

      {/* CSV */}
      <div className="card space-y-3">
        <h2 className="text-sm font-bold text-zinc-400">Importar CSV</h2>
        <p className="text-xs text-zinc-500">
          Cabeçalho esperado: <code>nome,telefone,cidade,nicho</code> (opcionais:{" "}
          <code>endereco,rating,qtd_avaliacoes,website</code>). Separador vírgula ou ponto e vírgula.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          className="text-sm"
          onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
        />
        {csvInfo && <p className="text-sm text-zinc-300">{csvInfo}</p>}
      </div>
    </div>
  );
}
