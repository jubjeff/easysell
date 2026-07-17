import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getSettings } from "@/lib/limits";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
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
    .eq("id", 1)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
