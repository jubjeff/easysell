import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";
import { isValidHttpUrl } from "@/lib/screenshot";

export const dynamic = "force-dynamic";

/**
 * PATCH — admin edita a demo. Se a URL mudar, a thumbnail volta a 'pending' e
 * a resposta traz `recapture: true` para o client disparar a recaptura.
 * Registra sempre o histórico simples (editado_por + atualizado_em).
 */
export const PATCH = withJsonError(async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin();
  const body = await req.json();

  const { data: atual, error: e0 } = await db()
    .from("demos")
    .select("url")
    .eq("id", params.id)
    .single();
  if (e0 || !atual) return NextResponse.json({ error: "Demo não encontrada." }, { status: 404 });

  const patch: Record<string, unknown> = { editado_por: admin.id, atualizado_em: new Date().toISOString() };
  for (const k of ["nicho", "script_padrao", "ativo", "ordem"]) {
    if (k in body) patch[k] = typeof body[k] === "string" ? body[k].trim() : body[k];
  }

  let recapture = false;
  if ("url" in body) {
    const url = (body.url ?? "").trim();
    if (!isValidHttpUrl(url)) {
      return NextResponse.json({ error: "URL inválida (use http/https)." }, { status: 400 });
    }
    patch.url = url;
    if (url !== atual.url) {
      patch.thumbnail_status = "pending";
      recapture = true;
    }
  }

  const { data, error } = await db()
    .from("demos")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json(
      { error: dup ? "Já existe uma demo para esse nicho." : error.message },
      { status: dup ? 409 : 500 }
    );
  }
  return NextResponse.json({ demo: data, recapture });
});

/** DELETE — admin. Remove a linha e, best-effort, a thumbnail no Storage. */
export const DELETE = withJsonError(async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAdmin();
  const { error } = await db().from("demos").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db().storage.from("demo-thumbnails").remove([`${params.id}.png`]).catch(() => {});
  return NextResponse.json({ ok: true });
});
