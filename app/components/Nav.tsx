"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/sessao", label: "Sessão de disparo", icon: "🚀" },
  { href: "/chips", label: "Chips", icon: "📱" },
  { href: "/captacao", label: "Captação", icon: "🔎" },
  { href: "/funil", label: "Funil", icon: "📋" },
  { href: "/campanhas", label: "Campanhas", icon: "🎯" },
  { href: "/templates", label: "Templates", icon: "✉️" },
  { href: "/config", label: "Configurações", icon: "⚙️" },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-1 sticky top-0 h-screen">
      <div className="text-lg font-bold text-emerald-400 mb-4 px-2">
        EasySell
      </div>
      {items.map((it) => {
        const active =
          it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
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
    </aside>
  );
}
