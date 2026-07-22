"use client";

import { useCallback, useEffect, useState } from "react";
import { maskPhoneBr } from "@/lib/phone";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function PerfilPage() {
  const [profile, setProfile] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [msgSenha, setMsgSenha] = useState("");
  const [erroSenha, setErroSenha] = useState("");

  const load = useCallback(async () => {
    const [meRes, userRes] = await Promise.all([
      fetch("/api/me").then((r) => r.json()),
      supabaseBrowser().auth.getUser(),
    ]);
    setProfile(meRes.profile);
    setNome(meRes.profile?.nome ?? "");
    setWhatsapp(meRes.profile?.whatsapp_numero ?? "");
    setEmail(userRes.data.user?.email ?? "");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function salvar() {
    setErro("");
    setMsg("");
    if (!nome.trim()) {
      setErro("O nome não pode ficar vazio.");
      return;
    }
    setSalvando(true);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), whatsapp_numero: whatsapp || null }),
    });
    const d = await res.json();
    setSalvando(false);
    if (!res.ok) {
      setErro(d.error ?? "Erro ao salvar.");
      return;
    }
    setProfile(d.profile);
    setMsg("Alterações salvas.");
    setTimeout(() => setMsg(""), 2500);
  }

  async function trocarSenha() {
    setErroSenha("");
    setMsgSenha("");
    if (novaSenha.length < 6) {
      setErroSenha("A senha precisa ter ao menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmaSenha) {
      setErroSenha("As senhas não coincidem.");
      return;
    }
    setTrocandoSenha(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: novaSenha });
    setTrocandoSenha(false);
    if (error) {
      setErroSenha(error.message);
      return;
    }
    setNovaSenha("");
    setConfirmaSenha("");
    setMsgSenha("Senha atualizada.");
    setTimeout(() => setMsgSenha(""), 2500);
  }

  if (!profile) return <p className="font-mono text-sm text-dim animate-pulse">carregando perfil…</p>;

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <span className="tag-state text-dim">perfil</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Meu perfil</h1>
      </div>

      {/* dados pessoais */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm">Dados</h2>
          {profile.role === "admin" && (
            <span className="badge bg-viola-faint text-viola">admin</span>
          )}
        </div>
        <div>
          <label className="label">Nome</label>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <label className="label">WhatsApp</label>
          <input
            className="input data"
            inputMode="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(maskPhoneBr(e.target.value))}
            placeholder="(81) 99999-9999"
          />
        </div>
        <div>
          <label className="label">E-mail (login)</label>
          <input className="input opacity-60" value={email} disabled />
          <p className="font-mono text-[10px] text-dim/70 mt-1">
            e-mail não é editável por aqui — fale com o suporte se precisar trocar.
          </p>
        </div>
        {profile.role === "vendedor" && (
          <div>
            <label className="label">Comissão padrão</label>
            <input className="input data opacity-60" value={`${profile.comissao_percentual}%`} disabled />
          </div>
        )}
        {erro && <p className="text-red-300 text-sm">{erro}</p>}
        {msg && <p className="text-lima text-sm font-mono">✓ {msg}</p>}
        <button className="btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>

      {/* trocar senha */}
      <div className="card space-y-3">
        <h2 className="font-bold text-sm">Trocar senha</h2>
        <div>
          <label className="label">Nova senha</label>
          <input
            type="password"
            className="input"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            placeholder="mín. 6 caracteres"
          />
        </div>
        <div>
          <label className="label">Confirmar nova senha</label>
          <input
            type="password"
            className="input"
            value={confirmaSenha}
            onChange={(e) => setConfirmaSenha(e.target.value)}
          />
        </div>
        {erroSenha && <p className="text-red-300 text-sm">{erroSenha}</p>}
        {msgSenha && <p className="text-lima text-sm font-mono">✓ {msgSenha}</p>}
        <button
          className="btn-secondary"
          onClick={trocarSenha}
          disabled={trocandoSenha || !novaSenha || !confirmaSenha}
        >
          {trocandoSenha ? "Salvando…" : "Salvar nova senha"}
        </button>
      </div>
    </div>
  );
}
