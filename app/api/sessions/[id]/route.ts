import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireUser, scopeFilter } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** PATCH: pausar / retomar / encerrar sessão (só a própria). body: { status } */
export const PATCH = withJsonError(async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const me = await requireUser();
  const scope = scopeFilter(me);
  const { status } = await req.json();
  if (!["ativa", "pausada", "encerrada", "concluida"].includes(status)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }
  const patch: Record<string, unknown> = { status };
  if (status === "encerrada" || status === "concluida") {
    patch.ended_at = new Date().toISOString();
  }
  let q = db().from("dispatch_sessions").update(patch).eq("id", params.id);
  if (scope) q = q.eq("vendedor_id", scope);
  const { data, error } = await q.select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  return NextResponse.json({ session: data });
});
