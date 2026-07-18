import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getSettings } from "@/lib/limits";
import { requireUser } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withJsonError(async function GET() {
  const me = await requireUser();
  const settings = await getSettings(me.id);
  return NextResponse.json({ settings });
});

export const PATCH = withJsonError(async function PATCH(req: NextRequest) {
  const me = await requireUser();
  await getSettings(me.id); // garante que a linha do vendedor existe
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const k of [
    "janela_inicio",
    "janela_fim",
    "dias_uteis",
    "som_ativado",
    "volume",
    "aquecimento_limite_diario",
  ]) {
    if (k in body) patch[k] = body[k];
  }
  const { data, error } = await db()
    .from("settings")
    .update(patch)
    .eq("vendedor_id", me.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
});
