import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const client = db();
  const patch: Record<string, unknown> = {};
  for (const k of ["nome", "nicho", "cidade", "limite_diario", "limiar_taxa_resposta", "ativa"]) {
    if (k in body) patch[k] = body[k];
  }
  if (Object.keys(patch).length > 0) {
    const { error } = await client.from("campaigns").update(patch).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (Array.isArray(body.template_ids)) {
    await client.from("campaign_templates").delete().eq("campaign_id", params.id);
    if (body.template_ids.length > 0) {
      await client
        .from("campaign_templates")
        .insert(
          body.template_ids.map((template_id: string) => ({
            campaign_id: params.id,
            template_id,
          }))
        );
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await db().from("campaigns").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível excluir (campanha com sessões registradas). Desative-a em vez de excluir." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
