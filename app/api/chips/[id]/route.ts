import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ["nome", "telefone", "ativado_em", "limite_diario_override", "ativo"]) {
    if (k in body) patch[k] = body[k];
  }
  const { data, error } = await db()
    .from("chips")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chip: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await db().from("chips").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível excluir (chip já usado em sessões). Desative-o em vez de excluir." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
