import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireUser, requireAdmin } from "@/lib/auth";
import { withJsonError } from "@/lib/api";
import { isValidHttpUrl } from "@/lib/screenshot";

export const dynamic = "force-dynamic";

/**
 * GET — vendedor recebe só demos ativas; admin recebe todas (inclui inativas
 * para gerir). Ordena por `ordem` (manual do admin) e desempata por uso.
 */
export const GET = withJsonError(async function GET() {
  const profile = await requireUser();
  let q = db()
    .from("demos")
    .select("*")
    .order("ordem", { ascending: true })
    .order("contador_copias", { ascending: false });
  if (profile.role !== "admin") q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ demos: data });
});

/** POST — admin cria a demo. A captura da thumbnail é disparada pelo client
 *  (POST /api/demos/[id]/recapturar) logo após, mantendo a resposta rápida
 *  e o card em skeleton enquanto captura. */
export const POST = withJsonError(async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const { nicho, url, script_padrao, ativo } = await req.json();
  if (!nicho?.trim()) {
    return NextResponse.json({ error: "O nicho é obrigatório." }, { status: 400 });
  }
  if (!isValidHttpUrl((url ?? "").trim())) {
    return NextResponse.json({ error: "URL inválida (use http/https)." }, { status: 400 });
  }

  // nova demo entra no fim da ordem manual
  const { data: last } = await db()
    .from("demos")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordem = (last?.ordem ?? -1) + 1;

  const { data, error } = await db()
    .from("demos")
    .insert({
      nicho: nicho.trim(),
      url: url.trim(),
      script_padrao: (script_padrao ?? "").trim(),
      ativo: ativo ?? true,
      ordem,
      thumbnail_status: "pending",
      criado_por: admin.id,
      editado_por: admin.id,
    })
    .select()
    .single();
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json(
      { error: dup ? "Já existe uma demo para esse nicho." : error.message },
      { status: dup ? 409 : 500 }
    );
  }
  return NextResponse.json({ demo: data });
});
