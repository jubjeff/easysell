"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const items = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/sessao", label: "Sessão de disparo", icon: "🚀" },
  { href: "/chips", label: "Chips", icon: "📱" },
  { href: "/maturacao", label: "Maturação", icon: "🌱" },
  { href: "/captacao", label: "Captação", icon: "🔎" },
  { href: "/funil", label: "Funil", icon: "📋" },
  { href: "/campanhas", label: "Campanhas", icon: "🎯" },
  { href: "/templates", label: "Templates", icon: "✉️" },
  { href: "/config", label: "Configurações", icon: "⚙️" },
];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  if (pathname === "/login") return null;

  const links = (
    <>
      {items.map((it) => {
        const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
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
    </>
  );

  return (
    <>
      {/* barra superior — só no mobile */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 backdrop-blur px-4 py-3">
        <span className="text-lg font-bold text-emerald-400">EasySell</span>
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="text-2xl leading-none text-zinc-300 p-1"
        >
          ☰
        </button>
      </div>

      {/* drawer — só no mobile */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-zinc-900 border-r border-zinc-800 p-4 flex flex-col gap-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-4 px-2">
              <span className="text-lg font-bold text-emerald-400">EasySell</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="text-2xl leading-none text-zinc-400 p-1"
              >
                ×
              </button>
            </div>
            {links}
          </aside>
        </div>
      )}

      {/* sidebar fixa — só no desktop */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-4 flex-col gap-1 sticky top-0 h-screen">
        <div className="text-lg font-bold text-emerald-400 mb-4 px-2">EasySell</div>
        {links}
      </aside>
    </>
  );
}
