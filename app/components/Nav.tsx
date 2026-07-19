"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Item = { href: string; label: string; icon: string; adminOnly?: boolean };
type Group = { label: string; items: Item[] };

/** Itens soltos no topo, sem rótulo de grupo — os dois destinos mais usados. */
const topItems: Item[] = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/sessao", label: "Sessão de disparo", icon: "🚀" },
];

/** Menu agrupado por função: operação do dia a dia, infra de números,
 *  gestão (admin) e sistema. Grupo sem item visível some com o rótulo. */
const groups: Group[] = [
  {
    label: "Operação",
    items: [
      { href: "/funil", label: "Funil", icon: "📋" },
      { href: "/demos", label: "Demos", icon: "🖼️" },
      { href: "/comissoes", label: "Comissões", icon: "💰" },
    ],
  },
  {
    label: "Números",
    items: [
      { href: "/chips", label: "Chips", icon: "📱" },
      { href: "/maturacao", label: "Maturação", icon: "🌱" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/captacao", label: "Captação", icon: "🔎", adminOnly: true },
      { href: "/distribuicao", label: "Distribuição", icon: "🗂️", adminOnly: true },
      { href: "/campanhas", label: "Campanhas", icon: "🎯", adminOnly: true },
      { href: "/templates", label: "Templates", icon: "✉️", adminOnly: true },
      { href: "/vendedores", label: "Vendedores", icon: "👥", adminOnly: true },
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/config", label: "Configurações", icon: "⚙️" }],
  },
];

const allItems: Item[] = [...topItems, ...groups.flatMap((g) => g.items)];

/** Itens fixos da bottom nav mobile (o resto vive na aba "Mais"). */
const bottomHrefs = ["/", "/sessao", "/funil", "/comissoes"];

function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`inline-flex flex-col ${small ? "items-center" : "items-start"}`}>
      <span className={`font-mono font-semibold leading-tight ${small ? "text-base" : "text-lg"}`}>
        <span className="text-lima">&lt;</span>
        <span className="text-paper">Tégui</span>
        <span className="text-lima"> /&gt;</span>
      </span>
      <span className="font-mono text-[9px] tracking-wide text-dim/70">
        powered by EasySell
      </span>
    </span>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [maisAberto, setMaisAberto] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe(d.profile))
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    setMaisAberto(false);
  }, [pathname]);

  if (pathname === "/login") return null;

  const isAdmin = me?.role === "admin";
  const canSee = (it: Item) => !it.adminOnly || isAdmin;

  // grupos com pelo menos 1 item visível para este papel
  const visibleGroups = groups
    .map((g) => ({ label: g.label, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);

  const visible = allItems.filter(canSee);
  const bottomItems = visible.filter((it) => bottomHrefs.includes(it.href));
  const isInBottom = (it: Item) => bottomHrefs.includes(it.href);

  // itens soltos que sobram para o sheet "Mais" (fora da bottom nav)
  const maisTop = topItems.filter((it) => canSee(it) && !isInBottom(it));

  // grupos com os itens que sobram para o sheet "Mais" (fora da bottom nav)
  const maisGroups = visibleGroups
    .map((g) => ({ label: g.label, items: g.items.filter((it) => !isInBottom(it)) }))
    .filter((g) => g.items.length > 0);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* ===== desktop: sidebar agrupada ===== */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-navy-800 bg-navy-900/40 p-4 flex-col sticky top-0 h-screen">
        <div className="px-2 mb-6">
          <Brand />
        </div>
        <nav className="flex flex-col gap-4 overflow-y-auto">
          {/* soltos, sem rótulo */}
          <div className="flex flex-col gap-0.5">
            {topItems.filter(canSee).map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-viola-faint text-paper font-medium"
                      : "text-dim hover:text-paper hover:bg-navy-800/70"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-viola" />
                  )}
                  <span className="text-base leading-none">{it.icon}</span> {it.label}
                </Link>
              );
            })}
          </div>
          {visibleGroups.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <span className="px-3 mb-1 font-mono text-[10px] uppercase tracking-wider text-dim/60">
                {g.label}
              </span>
              {g.items.map((it) => {
                const active = isActive(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-viola-faint text-paper font-medium"
                        : "text-dim hover:text-paper hover:bg-navy-800/70"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-viola" />
                    )}
                    <span className="text-base leading-none">{it.icon}</span> {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-navy-800">
          {me && (
            <p className="px-3 font-mono text-[11px] text-dim mb-2 truncate">
              {me.nome}
              {isAdmin && <span className="text-viola"> · admin</span>}
            </p>
          )}
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-dim hover:text-red-300 hover:bg-red-950/40 transition-colors"
          >
            <span>↩</span> Sair
          </button>
        </div>
      </aside>

      {/* ===== mobile: topo mínimo com a marca ===== */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-center border-b border-navy-800 bg-navy-950/90 backdrop-blur px-4 py-3">
        <Brand small />
      </div>

      {/* ===== mobile: sheet "Mais" (também agrupado) ===== */}
      {maisAberto && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMaisAberto(false)}
        >
          <div
            className="absolute bottom-16 inset-x-2 rounded-2xl bg-navy-900 border border-navy-700 p-3 animate-settle-in max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {maisTop.length > 0 && (
              <div className="grid grid-cols-2 gap-1 mb-2">
                {maisTop.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ${
                      isActive(it.href)
                        ? "bg-viola-faint text-paper font-medium"
                        : "text-dim hover:text-paper hover:bg-navy-800"
                    }`}
                  >
                    <span>{it.icon}</span> {it.label}
                  </Link>
                ))}
              </div>
            )}
            {maisGroups.map((g) => (
              <div key={g.label} className="mb-2 last:mb-0">
                <span className="block px-1 mb-1 font-mono text-[10px] uppercase tracking-wider text-dim/60">
                  {g.label}
                </span>
                <div className="grid grid-cols-2 gap-1">
                  {g.items.map((it) => (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ${
                        isActive(it.href)
                          ? "bg-viola-faint text-paper font-medium"
                          : "text-dim hover:text-paper hover:bg-navy-800"
                      }`}
                    >
                      <span>{it.icon}</span> {it.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-navy-800 flex items-center justify-between px-3">
              {me && (
                <p className="font-mono text-[11px] text-dim truncate">
                  {me.nome}
                  {isAdmin && <span className="text-viola"> · admin</span>}
                </p>
              )}
              <button onClick={logout} className="text-sm text-dim hover:text-red-300 py-1.5">
                ↩ Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== mobile: bottom nav — polegar primeiro ===== */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-navy-800 bg-navy-950/95 backdrop-blur flex items-stretch">
        {bottomItems.map((it) => {
          const active = isActive(it.href);
          const central = it.href === "/sessao";
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-2.5 text-[10px] font-mono transition-colors ${
                active ? "text-lima" : "text-dim"
              }`}
            >
              <span
                className={`text-lg leading-none ${
                  central && active ? "drop-shadow-[0_0_6px_rgba(163,230,53,0.5)]" : ""
                }`}
              >
                {it.icon}
              </span>
              {it.label.split(" ")[0]}
            </Link>
          );
        })}
        <button
          onClick={() => setMaisAberto((v) => !v)}
          className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-2.5 text-[10px] font-mono ${
            maisAberto ? "text-paper" : "text-dim"
          }`}
        >
          <span className="text-lg leading-none">☰</span>
          Mais
        </button>
      </nav>
    </>
  );
}
