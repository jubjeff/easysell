"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Captura = { handle: string; nicho: string; cidade: string; canal: "whatsapp" | "instagram_dm" };

const VAZIO = {
  handle: "",
  nome: "",
  nicho: "",
  cidade: "",
  temWhats: false,
  whatsapp: "",
  linkSite: false,
  notas: "",
};

export default function InstagramPage() {
  const [nichos, setNichos] = useState<string[]>([]);
  const [cidades, setCidades] = useState<string[]>([]);
  const [form, setForm] = useState({ ...VAZIO });
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [capturados, setCapturados] = useState<Captura[]>([]);
  const handleRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [d, c] = await Promise.all([
      fetch("/api/demos").then((r) => r.json()),
      fetch("/api/campaigns").then((r) => r.json()),
    ]);
    const listaNichos = Array.from(
      new Set((d.demos ?? []).map((x: any) => x.nicho))
    ).sort((a: any, b: any) => a.localeCompare(b, "pt-BR"));
    const listaCidades = Array.from(
      new Set((c.campaigns ?? []).map((x: any) => x.cidade))
    ).sort((a: any, b: any) => a.localeCompare(b, "pt-BR"));
    setNichos(listaNichos as string[]);
    setCidades(listaCidades as string[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function salvar() {
    setErro("");
    setMsg("");
    if (!form.handle.trim()) {
      setErro("Informe o @ do perfil.");
      return;
    }
    if (!form.nicho) {
      setErro("Escolha o nicho.");
      return;
    }
    if (!form.cidade.trim()) {
      setErro("Informe a cidade.");
      return;
    }
    if (form.temWhats && !form.whatsapp.trim()) {
      setErro("Marcou WhatsApp na bio — cole o número.");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/leads/instagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instagram_handle: form.handle,
        nome: form.nome,
        nicho: form.nicho,
        cidade: form.cidade,
        tem_whatsapp_na_bio: form.temWhats,
        whatsapp_numero: form.whatsapp,
        link_bio_aponta_site: form.linkSite,
        notas: form.notas,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErro(data.error ?? "Erro ao salvar.");
      return;
    }

    setCapturados((c) => [
      {
        handle: data.lead.instagram_handle,
        nicho: data.lead.nicho,
        cidade: data.lead.cidade,
        canal: data.lead.canal_contato_ativo,
      },
      ...c,
    ]);
    setMsg(
      `✅ @${data.lead.instagram_handle} salvo` +
        (data.campanhas_criadas ? ` · 🎯 campanha criada: ${data.campanhas.join(", ")}` : "")
    );
    if (!cidades.includes(form.cidade)) setCidades((c) => [...c, form.cidade].sort());

    // mantém nicho/cidade (capturando em sequência da mesma busca), limpa o resto
    setForm((f) => ({ ...VAZIO, nicho: f.nicho, cidade: f.cidade }));
    handleRef.current?.focus();
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <span className="tag-state text-dim">instagram</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Captura rápida</h1>
        <p className="text-sm text-dim mt-1">
          Sem busca automática — encontre o perfil navegando no app e registre aqui em segundos.
        </p>
      </div>

      <div className="card space-y-3">
        <div>
          <label className="label">@ do perfil</label>
          <input
            ref={handleRef}
            className="input font-mono"
            placeholder="@nomedaclinica"
            value={form.handle}
            onChange={(e) => set("handle", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && salvar()}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nicho</label>
            <select className="input" value={form.nicho} onChange={(e) => set("nicho", e.target.value)}>
              <option value="">Selecione…</option>
              {nichos.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {nichos.length === 0 && (
              <p className="font-mono text-[10px] text-amber-300/80 mt-1">
                nenhum nicho em Demos ainda — cadastre um lá primeiro
              </p>
            )}
          </div>
          <div>
            <label className="label">Cidade</label>
            <input
              className="input"
              list="cidades-instagram"
              placeholder="ex: Recife"
              value={form.cidade}
              onChange={(e) => set("cidade", e.target.value)}
            />
            <datalist id="cidades-instagram">
              {cidades.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <label className="label">Nome do negócio (opcional)</label>
          <input
            className="input"
            placeholder="se já visível na bio…"
            value={form.nome}
            onChange={(e) => set("nome", e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="accent-lima w-4 h-4"
            checked={form.temWhats}
            onChange={(e) => set("temWhats", e.target.checked)}
          />
          Tem WhatsApp na bio/link
        </label>
        {form.temWhats && (
          <input
            className="input font-mono"
            placeholder="(81) 99999-9999"
            value={form.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
          />
        )}

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="accent-lima w-4 h-4"
            checked={form.linkSite}
            onChange={(e) => set("linkSite", e.target.checked)}
          />
          Link na bio aponta para site
        </label>

        <div>
          <label className="label">Notas rápidas</label>
          <input
            className="input"
            placeholder="ex: muitos seguidores, poucos posts recentes"
            value={form.notas}
            onChange={(e) => set("notas", e.target.value)}
          />
        </div>

        {erro && <p className="text-red-300 text-sm">{erro}</p>}
        {msg && <p className="text-lima text-sm font-mono">{msg}</p>}

        <button className="btn-primary w-full !py-3" onClick={salvar} disabled={busy}>
          {busy ? "Salvando…" : "Salvar e continuar →"}
        </button>
        <p className="font-mono text-[10px] text-dim/60 text-center">
          Enter salva e já foca no próximo @
        </p>
      </div>

      {capturados.length > 0 && (
        <div className="card-line space-y-2">
          <p className="font-mono text-[11px] text-dim uppercase tracking-wider">
            capturados agora · {capturados.length}
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {capturados.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-mono">@{c.handle}</span>
                <span className="font-mono text-[11px] text-dim">
                  {c.nicho} · {c.cidade} · {c.canal === "whatsapp" ? "🟢 whatsapp" : "📸 dm"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
