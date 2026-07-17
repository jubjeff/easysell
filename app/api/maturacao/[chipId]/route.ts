import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getSettings } from "@/lib/limits";
import { maturationState } from "@/lib/maturacao";
import { withJsonError } from "@/lib/api";
import { Chip, MaturationDay } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * PATCH em um chip no contexto de maturação.
 * body.action:
 *  - "iniciar": coloca o chip em maturação (Dia 1)
 *  - "cancelar": tira da maturação sem liberar (mantém histórico)
 *  - "liberar": valida o gate de segurança e libera para disparo
 *  - "perfil": atualiza checkboxes perfil_foto/perfil_nome/perfil_descricao
 */
export const PATCH = withJsonError(async function PATCH(
  req: NextRequest,
  { params }: { params: { chipId: string } }
) {
  const body = await req.json();
  const client = db();

  const { data: chip } = await client.from("chips").select("*").eq("id", params.chipId).single();
  if (!chip) return NextResponse.json({ error: "Chip não encontrado." }, { status: 404 });

  if (body.action === "iniciar") {
    const { data, error } = await client
      .from("chips")
      .update({ maturando: true, maturacao_inicio: new Date().toISOString().slice(0, 10) })
      .eq("id", params.chipId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ chip: data });
  }

  if (body.action === "cancelar") {
    const { data, error } = await client
      .from("chips")
      .update({ maturando: false })
      .eq("id", params.chipId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ chip: data });
  }

  if (body.action === "perfil") {
    const patch: Record<string, boolean> = {};
    for (const k of ["perfil_foto", "perfil_nome", "perfil_descricao"]) {
      if (k in body) patch[k] = !!body[k];
    }
    const { data, error } = await client
      .from("chips")
      .update(patch)
      .eq("id", params.chipId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ chip: data });
  }

  if (body.action === "liberar") {
    const [{ data: days }, settings] = await Promise.all([
      client.from("maturation_days").select("*").eq("chip_id", params.chipId).order("created_at"),
      getSettings(),
    ]);
    const state = maturationState(chip as Chip, (days ?? []) as MaturationDay[], settings);
    if (!state.liberavel) {
      return NextResponse.json(
        {
          error: "O chip ainda não cumpre todos os critérios de liberação.",
          criterios: state.criterios,
        },
        { status: 422 }
      );
    }
    const { data, error } = await client
      .from("chips")
      .update({ maturando: false, liberado_em: new Date().toISOString() })
      .eq("id", params.chipId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ chip: data });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
});
