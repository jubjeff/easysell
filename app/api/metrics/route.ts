import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { chipPreset, sentCounts } from "@/lib/limits";

export const dynamic = "force-dynamic";

const RESPONDEU = new Set(["respondeu", "demo_enviada", "negociacao", "fechado"]);

/** Métricas agregadas: funil, taxa de resposta por nicho/cidade/template, saúde do chip. */
export async function GET() {
  try {
    return await buildMetrics();
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

async function buildMetrics() {
  const client = db();
  const [{ data: leads }, { data: envios }, { data: templates }, { data: campaigns }, { data: chips }] =
    await Promise.all([
      client.from("leads").select("id, stage, nicho, cidade"),
      client
        .from("message_logs")
        .select("lead_id, template_id, campaign_id")
        .eq("evento", "enviado"),
      client.from("templates").select("id, nome"),
      client.from("campaigns").select("id, nome, limiar_taxa_resposta"),
      client.from("chips").select("*").eq("ativo", true),
    ]);

  const leadById = new Map((leads ?? []).map((l) => [l.id, l]));
  const respondeu = (leadId: string) => RESPONDEU.has(leadById.get(leadId)?.stage ?? "");

  // funil
  const funil: Record<string, number> = {};
  for (const l of leads ?? []) funil[l.stage] = (funil[l.stage] ?? 0) + 1;

  // agregador genérico de taxa de resposta
  function taxa(keyFn: (envio: any) => string | null) {
    const acc = new Map<string, { enviados: Set<string>; respostas: Set<string> }>();
    for (const e of envios ?? []) {
      const key = keyFn(e);
      if (!key) continue;
      if (!acc.has(key)) acc.set(key, { enviados: new Set(), respostas: new Set() });
      const a = acc.get(key)!;
      a.enviados.add(e.lead_id);
      if (respondeu(e.lead_id)) a.respostas.add(e.lead_id);
    }
    return Array.from(acc.entries()).map(([key, a]) => ({
      key,
      enviados: a.enviados.size,
      respostas: a.respostas.size,
      taxa: a.enviados.size ? Math.round((a.respostas.size / a.enviados.size) * 1000) / 10 : 0,
    }));
  }

  const tplNome = new Map((templates ?? []).map((t) => [t.id, t.nome]));
  const campNome = new Map((campaigns ?? []).map((c) => [c.id, c.nome]));

  const porTemplate = taxa((e) => e.template_id).map((r) => ({
    ...r,
    nome: tplNome.get(r.key) ?? "(removido)",
  }));
  const porCampanha = taxa((e) => e.campaign_id).map((r) => ({
    ...r,
    nome: campNome.get(r.key) ?? "(removida)",
    limiar: (campaigns ?? []).find((c) => c.id === r.key)?.limiar_taxa_resposta ?? null,
  }));
  const porNicho = taxa((e) => leadById.get(e.lead_id)?.nicho ?? null);
  const porCidade = taxa((e) => leadById.get(e.lead_id)?.cidade ?? null);

  // conversão demo -> fechamento
  const demoOuAlem = (leads ?? []).filter((l) =>
    ["demo_enviada", "negociacao", "fechado"].includes(l.stage)
  ).length;
  const fechados = funil["fechado"] ?? 0;

  const saudeChips = await Promise.all(
    (chips ?? []).map(async (c) => {
      const preset = chipPreset(c.ativado_em);
      const counts = await sentCounts(c.id);
      return {
        id: c.id,
        nome: c.nome,
        limite: c.limite_diario_override ?? preset.limite,
        preset,
        ...counts,
      };
    })
  );

  return NextResponse.json({
    funil,
    porTemplate: porTemplate.sort((a, b) => b.taxa - a.taxa),
    porCampanha,
    porNicho: porNicho.sort((a, b) => b.taxa - a.taxa),
    porCidade: porCidade.sort((a, b) => b.taxa - a.taxa),
    conversaoDemo: {
      demos: demoOuAlem,
      fechados,
      taxa: demoOuAlem ? Math.round((fechados / demoOuAlem) * 1000) / 10 : 0,
    },
    saudeChips,
  });
}
