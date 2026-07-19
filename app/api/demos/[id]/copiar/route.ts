import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST — registra 1 cópia do link (usado na ordenação "mais usadas").
 * Disponível a qualquer usuário logado; incremento atômico via RPC para
 * evitar corrida entre vendedores copiando ao mesmo tempo.
 */
export const POST = withJsonError(async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireUser();
  const { error } = await db().rpc("bump_demo_copias", { demo_id: params.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = await db()
    .from("demos")
    .select("contador_copias")
    .eq("id", params.id)
    .single();
  return NextResponse.json({ ok: true, contador_copias: data?.contador_copias ?? null });
});
