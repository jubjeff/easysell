"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Demo } from "@/lib/types";
import { normalizeText } from "@/lib/text";

/** Copia texto no clipboard. Usa a API moderna e cai num fallback que
 *  funciona em navegadores de celular / contextos sem clipboard async. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* cai no fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Resolve {nome_negocio} no script. Vazio → mantém o token pro vendedor ver. */
function resolveScript(script: string, negocio: string): string {
  const n = negocio.trim();
  return n ? script.replaceAll("{nome_negocio}", n) : script;
}

type EditState = Partial<Demo> & { _isNew?: boolean };

export default function DemosClient() {
  const params = useSearchParams();
  const [demos, setDemos] = useState<Demo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"uso" | "az">("uso");
  const [negocio, setNegocio] = useState(""); // {nome_negocio} — vem do lead ou editável

  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [erro, setErro] = useState("");
  const [capturing, setCapturing] = useState<Set<string>>(new Set());
  const [reordering, setReordering] = useState(false);
  const dragId = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // pré-preenchimento vindo do Kanban: ?nicho=…&negocio=…
  useEffect(() => {
    const n = params.get("nicho");
    const neg = params.get("negocio");
    if (n) setQuery(n);
    if (neg) setNegocio(neg);
  }, [params]);

  const load = useCallback(async () => {
    const me = await fetch("/api/me").then((r) => r.json());
    setIsAdmin(me.profile?.role === "admin");
    const d = await fetch("/api/demos").then((r) => r.json());
    setDemos(d.demos ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  // ---- ações do vendedor ----
  async function copyLink(d: Demo) {
    const ok = await copyText(d.url);
    if (!ok) return flash("Não consegui copiar 🙁");
    flash("Link copiado");
    // contador (ordenação "mais usadas") — otimista
    setDemos((ds) =>
      ds.map((x) => (x.id === d.id ? { ...x, contador_copias: x.contador_copias + 1 } : x))
    );
    fetch(`/api/demos/${d.id}/copiar`, { method: "POST" }).catch(() => {});
  }
  async function copyScript(d: Demo) {
    const ok = await copyText(resolveScript(d.script_padrao, negocio));
    flash(ok ? "Script copiado" : "Não consegui copiar 🙁");
  }
  function openDemo(d: Demo) {
    window.open(d.url, "_blank", "noopener,noreferrer");
  }

  // ---- ações do admin ----
  async function recapturar(id: string) {
    setCapturing((s) => new Set(s).add(id));
    const res = await fetch(`/api/demos/${id}/recapturar`, { method: "POST" });
    const d = await res.json();
    if (res.ok && d.demo) {
      setDemos((ds) => ds.map((x) => (x.id === id ? d.demo : x)));
      if (d.demo.thumbnail_status === "failed") flash("Captura falhou — recapture depois");
    }
    setCapturing((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  async function save() {
    if (!editing) return;
    setErro("");
    const isNew = editing._isNew;
    const body = {
      nicho: editing.nicho,
      url: editing.url,
      script_padrao: editing.script_padrao ?? "",
      script_dm: editing.script_dm ?? "",
      ativo: editing.ativo ?? true,
    };
    const res = await fetch(isNew ? "/api/demos" : `/api/demos/${editing.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) {
      setErro(d.error ?? "Erro ao salvar.");
      return;
    }
    const demo: Demo = d.demo;
    setDemos((ds) => (isNew ? [...ds, demo] : ds.map((x) => (x.id === demo.id ? demo : x))));
    setEditing(null);
    // captura automática ao criar, ou ao trocar a URL numa edição
    if (isNew || d.recapture) recapturar(demo.id);
  }

  async function toggleAtivo(d: Demo) {
    const res = await fetch(`/api/demos/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !d.ativo }),
    });
    const j = await res.json();
    if (res.ok) setDemos((ds) => ds.map((x) => (x.id === d.id ? j.demo : x)));
  }

  async function remove(d: Demo) {
    if (!confirm(`Excluir a demo do nicho "${d.nicho}"?`)) return;
    const res = await fetch(`/api/demos/${d.id}`, { method: "DELETE" });
    if (res.ok) setDemos((ds) => ds.filter((x) => x.id !== d.id));
    else flash((await res.json()).error ?? "Erro ao excluir");
  }

  // ---- reordenação (admin) ----
  function onDrop(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    setDemos((ds) => {
      const arr = [...ds];
      const fi = arr.findIndex((x) => x.id === from);
      const ti = arr.findIndex((x) => x.id === targetId);
      if (fi < 0 || ti < 0) return ds;
      const [moved] = arr.splice(fi, 1);
      arr.splice(ti, 0, moved);
      fetch("/api/demos/reordenar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: arr.map((x) => x.id) }),
      }).catch(() => {});
      return arr;
    });
  }

  // lista visível (busca + ordenação). Em modo reordenar mostra a ordem crua.
  const visible = useMemo(() => {
    let arr = demos;
    if (!reordering) {
      const q = normalizeText(query);
      if (q) arr = arr.filter((d) => normalizeText(d.nicho).includes(q));
      arr = [...arr].sort((a, b) =>
        sort === "az"
          ? a.nicho.localeCompare(b.nicho, "pt-BR")
          : b.contador_copias - a.contador_copias
      );
    }
    return arr;
  }, [demos, query, sort, reordering]);

  if (loading)
    return <p className="font-mono text-sm text-dim animate-pulse">carregando demos…</p>;

  const ativas = demos.filter((d) => d.ativo).length;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* ===== cabeçalho ===== */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="tag-state text-dim">demos{isAdmin ? " · admin" : ""}</span>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            Demos
            <span className="data text-dim text-base font-normal ml-2">{ativas} ativas</span>
          </h1>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              className={`btn-secondary !py-1.5 ${reordering ? "!border-viola !text-viola" : ""}`}
              onClick={() => {
                setReordering((v) => !v);
                setEditing(null);
              }}
            >
              {reordering ? "✓ Concluir ordem" : "↕ Reordenar"}
            </button>
            <button
              className="btn-primary !py-1.5"
              onClick={() => {
                setReordering(false);
                setEditing({
                  _isNew: true,
                  nicho: "",
                  url: "",
                  script_padrao: "",
                  script_dm: "",
                  ativo: true,
                });
                setErro("");
              }}
            >
              + Nova demo
            </button>
          </div>
        )}
      </div>

      {/* ===== barra de busca + ordenação + nome_negocio ===== */}
      {!reordering && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dim text-sm">🔎</span>
              <input
                className="input !pl-9"
                placeholder="buscar nicho…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex rounded-xl border border-navy-700 overflow-hidden text-xs font-mono">
              {(["uso", "az"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`px-3 py-2 transition-colors ${
                    sort === s ? "bg-lima-faint text-lima" : "text-dim hover:text-paper"
                  }`}
                >
                  {s === "uso" ? "mais usadas" : "A–Z"}
                </button>
              ))}
            </div>
          </div>
          {/* {nome_negocio}: pré-preenchido pelo lead ou editável */}
          <div className="flex items-center gap-2 text-sm">
            <label className="font-mono text-[11px] uppercase tracking-wider text-dim">
              nome do negócio
            </label>
            <input
              className="input !w-auto !py-1.5 flex-1 max-w-xs"
              placeholder="{nome_negocio} no script…"
              value={negocio}
              onChange={(e) => setNegocio(e.target.value)}
            />
            <span className="font-mono text-[10px] text-dim/70 hidden sm:inline">
              entra no “Copiar script”
            </span>
          </div>
        </div>
      )}

      {/* ===== form de edição (admin) ===== */}
      {editing && (
        <div className="card space-y-3 border border-lima-deep">
          <h2 className="font-bold text-sm">
            {editing._isNew ? "Nova demo" : `Editando · ${editing.nicho}`}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome do nicho</label>
              <input
                className="input"
                placeholder="ex: Clínica Odontológica"
                value={editing.nicho ?? ""}
                onChange={(e) => setEditing({ ...editing, nicho: e.target.value })}
              />
            </div>
            <div>
              <label className="label">URL da demo</label>
              <input
                className="input font-mono text-xs"
                placeholder="https://…"
                value={editing.url ?? ""}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Script padrão (WhatsApp)</label>
            <textarea
              className="input font-mono text-sm min-h-24"
              rows={4}
              placeholder="Oi! Vi as avaliações da {nome_negocio}…"
              value={editing.script_padrao ?? ""}
              onChange={(e) => setEditing({ ...editing, script_padrao: e.target.value })}
            />
            <p className="font-mono text-[11px] text-dim/70 mt-1.5">
              variável: <span className="text-lima">{"{nome_negocio}"}</span> — resolvida a partir do
              lead quando aberto pelo Kanban.
            </p>
          </div>
          <div>
            <label className="label">Script de DM (Instagram)</label>
            <textarea
              className="input font-mono text-sm min-h-20"
              rows={3}
              placeholder="Versão mais curta, pensada pra DM — ex: Oi! Vi o perfil da {nome_negocio}…"
              value={editing.script_dm ?? ""}
              onChange={(e) => setEditing({ ...editing, script_dm: e.target.value })}
            />
            <p className="font-mono text-[11px] text-dim/70 mt-1.5">
              usado na sessão assistida de DM (aba Sessão de disparo → 📸 DM). Vazio = esse nicho
              não entra em fila de DM.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
            <input
              type="checkbox"
              className="accent-lima w-4 h-4"
              checked={editing.ativo ?? true}
              onChange={(e) => setEditing({ ...editing, ativo: e.target.checked })}
            />
            Ativa <span className="text-dim text-xs">(inativa some pro vendedor)</span>
          </label>
          {erro && <p className="text-red-300 text-sm">{erro}</p>}
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={save}
              disabled={!editing.nicho?.trim() || !editing.url?.trim()}
            >
              Salvar
            </button>
            <button className="btn-secondary" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ===== modo reordenar (admin): lista vertical arrastável ===== */}
      {reordering ? (
        <div className="card-line space-y-1">
          <p className="font-mono text-[11px] text-dim mb-2">arraste para definir a ordem exibida</p>
          {demos.map((d) => (
            <div
              key={d.id}
              draggable
              onDragStart={() => (dragId.current = d.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(d.id)}
              className={`flex items-center gap-3 rounded-xl px-2 py-2 cursor-grab active:cursor-grabbing hover:bg-navy-800 ${
                d.ativo ? "" : "opacity-50"
              }`}
            >
              <span className="font-mono text-dim/60">⣿</span>
              <Thumb demo={d} capturing={false} mini />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{d.nicho}</p>
                <p className="data text-[10px] text-dim truncate">{d.url}</p>
              </div>
              <span className={`badge ${d.ativo ? "text-lima" : "bg-zinc-800 text-zinc-400"}`}>
                {d.ativo ? "ativa" : "inativa"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        // ===== grid de cards =====
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((d) => (
            <DemoCard
              key={d.id}
              demo={d}
              isAdmin={isAdmin}
              capturing={capturing.has(d.id)}
              negocio={negocio}
              onCopyLink={() => copyLink(d)}
              onCopyScript={() => copyScript(d)}
              onOpen={() => openDemo(d)}
              onEdit={() => {
                setEditing({ ...d });
                setErro("");
              }}
              onRecapturar={() => recapturar(d.id)}
              onToggle={() => toggleAtivo(d)}
              onRemove={() => remove(d)}
            />
          ))}
          {visible.length === 0 && (
            <p className="card text-center font-mono text-sm text-dim py-10 col-span-full">
              {query ? `nenhum nicho com “${query}”` : "nenhuma demo cadastrada ainda"}
            </p>
          )}
        </div>
      )}

      {/* ===== toast ===== */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-navy-800 border border-lima-deep text-lima font-mono text-sm px-4 py-2.5 shadow-xl animate-settle-in">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

/** Thumbnail com os 3 estados: pronta (imagem), capturando (skeleton), falha/vazia (placeholder). */
function Thumb({
  demo: d,
  capturing,
  mini = false,
}: {
  demo: Demo;
  capturing: boolean;
  mini?: boolean;
}) {
  const box = mini
    ? "w-12 h-8 rounded-md shrink-0"
    : "aspect-[16/10] w-full rounded-t-2xl";
  const pending = capturing || d.thumbnail_status === "pending";

  if (pending) {
    return (
      <div className={`${box} relative overflow-hidden bg-navy-800`}>
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        {!mini && (
          <span className="absolute inset-x-0 bottom-2 text-center font-mono text-[10px] text-dim">
            capturando thumbnail…
          </span>
        )}
        <style>{`@keyframes shimmer{100%{transform:translateX(100%)}}`}</style>
      </div>
    );
  }
  if (d.thumbnail_status === "ready" && d.thumbnail_url) {
    return (
      <img
        src={d.thumbnail_url}
        alt={`Prévia da demo de ${d.nicho}`}
        className={`${box} object-cover object-top border-b border-navy-800`}
      />
    );
  }
  // failed ou sem thumbnail → placeholder com o nome do nicho (nunca ícone quebrado)
  return (
    <div
      className={`${box} flex flex-col items-center justify-center gap-1 border-b border-navy-800`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg,#141d31,#141d31 9px,#111827 9px,#111827 18px)",
      }}
    >
      <span className={`font-bold text-paper text-center px-2 ${mini ? "text-[8px]" : "text-sm"}`}>
        {d.nicho}
      </span>
      {!mini && (
        <span className="font-mono text-[9px] uppercase tracking-wide text-amber-400/90">
          thumb indisponível
        </span>
      )}
    </div>
  );
}

function DemoCard({
  demo: d,
  isAdmin,
  capturing,
  negocio,
  onCopyLink,
  onCopyScript,
  onOpen,
  onEdit,
  onRecapturar,
  onToggle,
  onRemove,
}: {
  demo: Demo;
  isAdmin: boolean;
  capturing: boolean;
  negocio: string;
  onCopyLink: () => void;
  onCopyScript: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onRecapturar: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const scriptPreview = negocio.trim()
    ? d.script_padrao.replaceAll("{nome_negocio}", negocio.trim())
    : d.script_padrao;

  return (
    <div
      className={`bg-navy-900 border border-navy-700 rounded-2xl overflow-hidden flex flex-col animate-settle-in ${
        !d.ativo ? "opacity-60" : ""
      }`}
    >
      <div className="relative">
        <Thumb demo={d} capturing={capturing} />
        <span className="absolute top-2 right-2 font-mono text-[10px] bg-navy-950/80 border border-navy-700 rounded-lg px-2 py-0.5 text-dim">
          ▲ {d.contador_copias}
        </span>
        {isAdmin && !d.ativo && (
          <span className="absolute top-2 left-2 badge bg-zinc-800 text-zinc-400">inativa</span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2.5 flex-1">
        <h3 className="font-semibold text-sm leading-snug">{d.nicho}</h3>
        {d.script_padrao && (
          <p className="font-mono text-[10.5px] leading-relaxed text-dim bg-navy-950/40 border border-navy-800 rounded-lg p-2 line-clamp-3">
            {scriptPreview}
          </p>
        )}

        <div className="flex gap-1.5 mt-auto">
          <button className="btn-primary !py-1.5 !px-2 text-xs flex-1" onClick={onCopyLink}>
            Copiar link
          </button>
          <button className="btn-secondary !py-1.5 !px-2 text-xs" onClick={onOpen}>
            Abrir
          </button>
          <button
            className="btn-secondary !py-1.5 !px-2 text-xs"
            onClick={onCopyScript}
            disabled={!d.script_padrao}
          >
            Script
          </button>
        </div>

        {isAdmin && (
          <div className="flex gap-1.5 flex-wrap pt-2 border-t border-navy-800 text-xs">
            <button className="btn-ghost !py-1 !px-2 text-xs" onClick={onEdit}>
              ✎ Editar
            </button>
            <button
              className="btn-ghost !py-1 !px-2 text-xs"
              onClick={onRecapturar}
              disabled={capturing}
            >
              ↻ {capturing ? "capturando…" : "Recapturar"}
            </button>
            <button className="btn-ghost !py-1 !px-2 text-xs" onClick={onToggle}>
              {d.ativo ? "Desativar" : "Ativar"}
            </button>
            <button className="btn-ghost !py-1 !px-2 text-xs !text-red-300" onClick={onRemove}>
              Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
