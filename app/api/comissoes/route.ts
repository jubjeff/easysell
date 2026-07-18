import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireUser, requireAdmin, scopeFilter } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET: comissões. Vendedor vê as próprias; admin vê todas (com nome do
 * vendedor). Retorna a lista crua — a tela agrega por mês/vendedor/status.
 */
export const GET = withJsonError(async function GET() {
  const me = await requireUser();
  const scope = scopeFilter(me);
  let q = db()
    .from("commissions")
    .select("*, leads(nome, cidade, nicho), profiles(nome)")
    .order("fechado_em", { ascending: false });
  if (scope) q = q.eq("vendedor_id", scope);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comissoes: data ?? [], isAdmin: me.role === "admin" });
});

/**
 * PATCH: marca comissões como pagas/a pagar (admin only).
 * body: { ids: string[], status: "pago" | "a_pagar" }
 */
export const PATCH = withJsonError(async function PATCH(req: NextRequest) {
  await requireAdmin();
  const { ids, status } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0 || !["pago", "a_pagar"].includes(status)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  const patch: Record<string, unknown> = {
    status,
    pago_em: status === "pago" ? new Date().toISOString() : null,
  };
  const { error } = await db().from("commissions").update(patch).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
