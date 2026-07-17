import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getSettings } from "@/lib/limits";
import { maturationState, faseDoDia, FATOR_CONGELAMENTO } from "@/lib/maturacao";
import { withJsonError } from "@/lib/api";
import { Chip, MaturationDay } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST: registra a atividade de hoje de um chip em maturação.
 * body: { msgs_enviadas, msgs_recebidas, contatos_ativos, contatos_novos,
 *         status_postado, bloqueios, notas }
 *
 * Regras (motor de alertas):
 *  - 1 registro por dia de calendário
 *  - contatos novos: no máximo 1/dia, nunca em lote
 *  - volume > 2× o teto da fase → registra mas CONGELA a progressão
 *  - bloqueios/denúncias > 0 → pausa o chip por 48h (status "Em risco")
 */
export const POST = withJsonError(async function POST(
  req: NextRequest,
  { params }: { params: { chipId: string } }
) {
  const body = await req.json();
  const client = db();

  const { data: chip } = await client.from("chips").select("*").eq("id", params.chipId).single();
  if (!chip) return NextResponse.json({ error: "Chip não encontrado." }, { status: 404 });
  if (!chip.maturando) {
    return NextResponse.json({ error: "Este chip não está em maturação." }, { status: 422 });
  }

  const [{ data: days }, settings] = await Promise.all([
    client.from("maturation_days").select("*").eq("chip_id", params.chipId).order("created_at"),
    getSettings(),
  ]);
  const state = maturationState(chip as Chip, (days ?? []) as MaturationDay[], settings);

  if (state.registrouHoje) {
    return NextResponse.json(
      { error: "A atividade de hoje já foi registrada. Volte amanhã." },
      { status: 409 }
    );
  }

  const enviadas = Math.max(0, Number(body.msgs_enviadas) || 0);
  const recebidas = Math.max(0, Number(body.msgs_recebidas) || 0);
  const ativos = Math.max(0, Number(body.contatos_ativos) || 0);
  const novos = Math.max(0, Number(body.contatos_novos) || 0);
  const bloqueios = Math.max(0, Number(body.bloqueios) || 0);

  if (novos > 1) {
    return NextResponse.json(
      { error: "No máximo 1 contato novo por dia — nunca adicione contatos em lote." },
      { status: 400 }
    );
  }

  const fase = faseDoDia(Math.min(state.diaAtual, 21));
  const volume = enviadas + recebidas;
  const congelou = volume > FATOR_CONGELAMENTO * fase.msgsMax;

  const { data: registro, error } = await client
    .from("maturation_days")
    .insert({
      chip_id: params.chipId,
      dia: state.diaAtual,
      msgs_enviadas: enviadas,
      msgs_recebidas: recebidas,
      contatos_ativos: ativos,
      contatos_novos: novos,
      status_postado: !!body.status_postado,
      bloqueios,
      congelou,
      notas: body.notas?.trim() || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const avisos: string[] = [];
  if (congelou) {
    avisos.push(
      `Volume muito acima do sugerido para a fase (${volume} msgs vs teto de ${fase.msgsMax}). ` +
        "Aquecimento acelerado = risco de ban. A progressão de hoje NÃO contou — repita o dia com volume menor."
    );
  }
  if (bloqueios > 0) {
    await client
      .from("chips")
      .update({ risco_ate: new Date(Date.now() + 48 * 3600 * 1000).toISOString() })
      .eq("id", params.chipId);
    avisos.push(
      "Bloqueios/denúncias registrados: o chip foi pausado por 48h por segurança. " +
        "Reduza o ritmo e converse apenas com quem responde."
    );
  }
  if (recebidas === 0) {
    avisos.push(
      "Nenhuma resposta recebida hoje. Receber mensagens é o sinal mais forte de chip saudável — priorize conversas de mão dupla."
    );
  }

  return NextResponse.json({ registro, avisos });
});
