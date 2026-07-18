"use client";

import { useState } from "react";
import { formatPhone } from "@/lib/phone";

/** Cor semântica da temperatura: quente = alvo (sem site) … frio = tem site pro. */
const TEMP: Record<string, { cor: string; label: string }> = {
  quente: { cor: "#F87171", label: "quente" },
  morno: { cor: "#FBBF24", label: "morno" },
  frio: { cor: "#5FA8E6", label: "frio" },
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
      setCsvInfo(
        "CSV vazio ou sem cabeçalho. Esperado: nome,telefone,cidade,nicho[,endereco,rating,qtd_avaliacoes,website]"
      );
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

  const elegiveis = results.filter((r) => !r.duplicado && !r.sem_telefone);
  function selecionarElegiveis() {
    setSelected(new Set(elegiveis.map((r) => r.google_place_id)));
  }
  function limpar() {
    setSelected(new Set());
  }

  return (
    <div className="space-y-5">
      <div>
        <span className="tag-state text-dim">captação</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Trazer novos leads</h1>
      </div>

      {/* dois caminhos lado a lado no desktop */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* buscar negócios */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-sm">Buscar negócios</h2>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-navy-950/70 p-1 text-sm">
            <button
              className={`rounded-lg px-2 py-1.5 font-medium transition-colors ${
                provider === "osm" ? "bg-navy-700 text-paper" : "text-dim hover:text-paper"
              }`}
              onClick={() => setProvider("osm")}
            >
              OpenStreetMap
              <span className="block font-mono text-[10px] text-lima/80">grátis · sem rating</span>
            </button>
            <button
              className={`rounded-lg px-2 py-1.5 font-medium transition-colors ${
                provider === "google" ? "bg-navy-700 text-paper" : "text-dim hover:text-paper"
              }`}
              onClick={() => setProvider("google")}
            >
              Google Places
              <span className="block font-mono text-[10px] text-dim">requer API key</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              placeholder="Nicho (ex: advogado)"
              value={nicho}
              onChange={(e) => setNicho(e.target.value)}
            />
            <input
              className="input"
              placeholder="Cidade (ex: Caruaru)"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            />
          </div>
          <button
            className="btn-primary w-full"
            disabled={busy || !nicho || !cidade}
            onClick={() => search()}
          >
            {busy ? "Buscando…" : "🔎 Buscar negócios"}
          </button>
          {msg && <p className="font-mono text-xs text-dim">{msg}</p>}
        </div>

        {/* importar CSV */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-sm">
            Importar CSV
            <span className="ml-2 badge bg-lima-faint text-lima">confiável</span>
          </h2>
          <p className="text-xs text-dim leading-relaxed">
            Capte por chat (ChatGPT/Gemini com busca) e importe aqui. Cabeçalho:{" "}
            <code className="font-mono text-paper/90">nome,telefone,cidade,nicho</code>
            <br />
            opcionais:{" "}
            <code className="font-mono text-dim">endereco,rating,qtd_avaliacoes,website</code>
          </p>
          <label className="btn-secondary w-full cursor-pointer">
            📄 Escolher arquivo .csv
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
            />
          </label>
          {csvInfo && <p className="font-mono text-xs text-dim">{csvInfo}</p>}
        </div>
      </div>

      {/* resultados da busca */}
      {results.length > 0 && (
        <div className="card space-y-3">
          {/* barra: pré-seleção VISÍVEL */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                <span className="data text-lima">{selected.size}</span> de{" "}
                <span className="data">{results.length}</span> selecionados
              </p>
              <p className="font-mono text-[11px] text-dim mt-0.5">
                pré-marcamos os que têm telefone, não estão na base e não são “frios”
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost !px-3 text-xs" onClick={selecionarElegiveis}>
                todos elegíveis ({elegiveis.length})
              </button>
              <button className="btn-ghost !px-3 text-xs" onClick={limpar}>
                limpar
              </button>
              <button
                className="btn-primary"
                disabled={busy || selected.size === 0}
                onClick={importSelected}
              >
                ⬇️ Importar {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
            </div>
          </div>

          {/* desktop: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="font-mono text-[11px] uppercase tracking-wider text-dim text-left">
                <tr className="border-b border-navy-800">
                  <th className="p-2 w-8"></th>
                  <th className="p-2">Nome</th>
                  <th className="p-2">Telefone</th>
                  <th className="p-2">Rating</th>
                  <th className="p-2">Temp.</th>
                  <th className="p-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const bloqueado = r.duplicado || r.sem_telefone;
                  return (
                    <tr
                      key={r.google_place_id}
                      className={`border-b border-navy-800/50 ${bloqueado ? "opacity-40" : "hover:bg-navy-800/40"}`}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.google_place_id)}
                          disabled={bloqueado}
                          onChange={() => toggle(r.google_place_id)}
                        />
                      </td>
                      <td className="p-2">
                        <span className="font-medium text-paper">{r.nome}</span>
                        {r.duplicado && (
                          <span className="ml-1.5 font-mono text-[10px] text-dim">já na base</span>
                        )}
                        {r.sem_telefone && (
                          <span className="ml-1.5 font-mono text-[10px] text-amber-400/80">
                            sem telefone
                          </span>
                        )}
                      </td>
                      <td className="p-2 data text-dim">
                        {r.telefone ? formatPhone(r.telefone) : "—"}
                      </td>
                      <td className="p-2 data text-dim">
                        {r.rating ? `${r.rating}★ (${r.qtd_avaliacoes})` : "—"}
                      </td>
                      <td className="p-2">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: TEMP[r.temperatura]?.cor }}
                          />
                          {TEMP[r.temperatura]?.label}
                        </span>
                      </td>
                      <td className="p-2 data text-right text-paper">{r.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* mobile: cards */}
          <div className="md:hidden space-y-2">
            {results.map((r) => {
              const bloqueado = r.duplicado || r.sem_telefone;
              return (
                <label
                  key={r.google_place_id}
                  className={`flex items-start gap-3 rounded-xl bg-navy-800/60 p-3 ${
                    bloqueado ? "opacity-40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(r.google_place_id)}
                    disabled={bloqueado}
                    onChange={() => toggle(r.google_place_id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm text-paper leading-snug">{r.nome}</span>
                      <span className="data text-[11px] text-dim shrink-0">{r.score}</span>
                    </div>
                    <p className="data text-[11px] text-dim mt-0.5">
                      {r.telefone ? formatPhone(r.telefone) : "sem telefone"}
                      {r.rating ? ` · ${r.rating}★` : ""}
                    </p>
                    <div className="flex items-center gap-1.5 font-mono text-[11px] mt-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: TEMP[r.temperatura]?.cor }}
                      />
                      {TEMP[r.temperatura]?.label}
                      {r.duplicado && <span className="text-dim">· já na base</span>}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {nextToken && (
            <button className="btn-secondary w-full" disabled={busy} onClick={() => search(nextToken)}>
              Carregar mais resultados
            </button>
          )}
        </div>
      )}
    </div>
  );
}
