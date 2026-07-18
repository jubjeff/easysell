import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireUser, scopeFilter } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const PATCH = withJsonError(async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const me = await requireUser();
  const scope = scopeFilter(me);
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ["nome", "telefone", "ativado_em", "limite_diario_override", "ativo"]) {
    if (k in body) patch[k] = body[k];
  }
  let q = db().from("chips").update(patch).eq("id", params.id);
  if (scope) q = q.eq("vendedor_id", scope);
  const { data, error } = await q.select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Chip não encontrado." }, { status: 404 });
  return NextResponse.json({ chip: data });
});

export const DELETE = withJsonError(async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const me = await requireUser();
  const scope = scopeFilter(me);
  let q = db().from("chips").delete().eq("id", params.id);
  if (scope) q = q.eq("vendedor_id", scope);
  const { error } = await q;
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível excluir (chip já usado em sessões). Desative-o em vez de excluir." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
});
