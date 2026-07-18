"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Item = { href: string; label: string; icon: string; adminOnly?: boolean };

const items: Item[] = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/sessao", label: "Sessão de disparo", icon: "🚀" },
  { href: "/chips", label: "Chips", icon: "📱" },
  { href: "/maturacao", label: "Maturação", icon: "🌱" },
  { href: "/captacao", label: "Captação", icon: "🔎", adminOnly: true },
  { href: "/distribuicao", label: "Distribuição", icon: "🗂️", adminOnly: true },
  { href: "/funil", label: "Funil", icon: "📋" },
  { href: "/comissoes", label: "Comissões", icon: "💰" },
  { href: "/campanhas", label: "Campanhas", icon: "🎯", adminOnly: true },
  { href: "/templates", label: "Templates", icon: "✉️", adminOnly: true },
  { href: "/vendedores", label: "Vendedores", icon: "👥", adminOnly: true },
  { href: "/config", label: "Configurações", icon: "⚙️" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe(d.profile))
      .catch(() => {});
  }, [pathname]);

  if (pathname === "/login") return null;

  const isAdmin = me?.role === "admin";
  const visible = items.filter((it) => !it.adminOnly || isAdmin);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const navBody = (
    <>
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="text-lg font-bold text-emerald-400">EasySell</div>
        <button
          className="sm:hidden text-zinc-400 text-xl leading-none"
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
        >
          ✕
        </button>
      </div>
      <nav className="flex flex-col gap-1">
        {visible.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-emerald-600/15 text-emerald-300 font-medium"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
              }`}
            >
              <span>{it.icon}</span> {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-4 border-t border-zinc-800">
        {me && (
          <p className="px-3 text-xs text-zinc-500 mb-2">
            {me.nome}
            {isAdmin && <span className="text-emerald-400"> · admin</span>}
          </p>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-red-300 hover:bg-red-950/40"
        >
          <span>↩</span> Sair
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* topbar mobile */}
      <div className="sm:hidden sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 backdrop-blur px-4 py-3">
        <div className="text-base font-bold text-emerald-400">EasySell</div>
        <button className="text-zinc-300 text-xl" onClick={() => setOpen(true)} aria-label="Abrir menu">
          ☰
        </button>
      </div>

      {/* overlay mobile */}
      {open && (
        <div className="sm:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)}>
          <aside
            className="absolute left-0 top-0 h-full w-64 bg-zinc-900 border-r border-zinc-800 p-4 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {navBody}
          </aside>
        </div>
      )}

      {/* sidebar desktop */}
      <aside className="hidden sm:flex w-56 shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-4 flex-col sticky top-0 h-screen">
        {navBody}
      </aside>
    </>
  );
}
