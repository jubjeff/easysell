import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const PATCH = withJsonError(async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAdmin();
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ["nome", "corpo", "social_proof", "ativo"]) {
    if (k in body) patch[k] = body[k];
  }
  const { data, error } = await db()
    .from("templates")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
});

export const DELETE = withJsonError(async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAdmin();
  const { error } = await db().from("templates").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível excluir (template já usado em disparos?). Desative-o em vez de excluir." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
});
