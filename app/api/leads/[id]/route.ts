import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireUser, scopeFilter } from "@/lib/auth";
import { withJsonError } from "@/lib/api";
import { syncCommission } from "@/lib/comissao";

export const dynamic = "force-dynamic";

/** Busca o lead respeitando o escopo do vendedor (admin vê qualquer um). */
async function fetchScoped(id: string, scope: string | null) {
  let q = db().from("leads").select("*").eq("id", id);
  if (scope) q = q.eq("vendedor_id", scope);
  const { data } = await q.maybeSingle();
  return data;
}

/** GET: lead + notas + histórico de mensagens */
export const GET = withJsonError(async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const me = await requireUser();
  const lead = await fetchScoped(params.id, scopeFilter(me));
  if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const client = db();
  const [{ data: notes }, { data: logs }] = await Promise.all([
    client.from("lead_notes").select("*").eq("lead_id", params.id).order("created_at", { ascending: false }),
    client
      .from("message_logs")
      .select("*, templates(nome)")
      .eq("lead_id", params.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  return NextResponse.json({ lead, notes: notes ?? [], logs: logs ?? [] });
});

/** PATCH: atualiza campos do lead. Ao mover para 'fechado' com valor, gera comissão. */
export const PATCH = withJsonError(async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const me = await requireUser();
  const scope = scopeFilter(me);

  const current = await fetchScoped(params.id, scope);
  if (!current) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const body = await req.json();
  const allowed = [
    "stage",
    "demo_url",
    "valor_proposto",
    "valor_venda",
    "plano",
    "motivo_perda",
    "nome",
    "telefone",
    "cidade",
    "nicho",
  ];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in body) patch[k] = body[k];
  if ("stage" in body && body.stage !== current.stage) {
    patch.stage_changed_at = new Date().toISOString();
  }

  let q = db().from("leads").update(patch).eq("id", params.id);
  if (scope) q = q.eq("vendedor_id", scope);
  const { data, error } = await q.select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  // comissão: mantém o registro em sincronia com o estado fechado/valor do lead
  await syncCommission(data);

  return NextResponse.json({ lead: data });
});

/** DELETE: remove o lead (respeita escopo). */
export const DELETE = withJsonError(async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const me = await requireUser();
  const scope = scopeFilter(me);
  let q = db().from("leads").delete().eq("id", params.id);
  if (scope) q = q.eq("vendedor_id", scope);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
