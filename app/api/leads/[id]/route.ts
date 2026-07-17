import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET: lead + notas + histórico de mensagens */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const client = db();
  const [{ data: lead }, { data: notes }, { data: logs }] = await Promise.all([
    client.from("leads").select("*").eq("id", params.id).single(),
    client
      .from("lead_notes")
      .select("*")
      .eq("lead_id", params.id)
      .order("created_at", { ascending: false }),
    client
      .from("message_logs")
      .select("*, templates(nome)")
      .eq("lead_id", params.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
  return NextResponse.json({ lead, notes: notes ?? [], logs: logs ?? [] });
}

/** PATCH: atualiza campos do lead (stage, demo_url, valor_proposto, plano...) */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const allowed = [
    "stage",
    "demo_url",
    "valor_proposto",
    "plano",
    "motivo_perda",
    "nome",
    "telefone",
    "cidade",
    "nicho",
  ];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in body) patch[k] = body[k];
  if ("stage" in body) patch.stage_changed_at = new Date().toISOString();

  const { data, error } = await db()
    .from("leads")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data });
}

/** DELETE: remove o lead */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await db().from("leads").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
