import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { chipPreset, sentCounts } from "@/lib/limits";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET: lista chips com preset/idade e contagem de envios já calculados. */
export const GET = withJsonError(async function GET() {
  const { data, error } = await db()
    .from("chips")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const chips = await Promise.all(
    (data ?? []).map(async (c) => ({
      ...c,
      preset: chipPreset(c.ativado_em),
      ...(await sentCounts(c.id)),
    }))
  );
  return NextResponse.json({ chips });
});

export const POST = withJsonError(async function POST(req: NextRequest) {
  const { nome, telefone, ativado_em, limite_diario_override } = await req.json();
  if (!nome?.trim() || !ativado_em) {
    return NextResponse.json(
      { error: "Nome e data de ativação são obrigatórios." },
      { status: 400 }
    );
  }
  const { data, error } = await db()
    .from("chips")
    .insert({
      nome: nome.trim(),
      telefone: telefone || null,
      ativado_em,
      limite_diario_override: limite_diario_override ? Number(limite_diario_override) : null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chip: data });
});
