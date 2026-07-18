import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { chipPreset, sentCounts } from "@/lib/limits";
import { requireUser, scopeFilter } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const RESPONDEU = new Set(["respondeu", "demo_enviada", "negociacao", "fechado"]);

/** Métricas do vendedor logado (admin vê tudo): funil, taxa de resposta, saúde dos chips. */
export const GET = withJsonError(async function GET() {
  const me = await requireUser();
  return buildMetrics(scopeFilter(me));
});

async function buildMetrics(scope: string | null) {
  const client = db();

  let leadsQ = client.from("leads").select("id, stage, nicho, cidade, vendedor_id");
  let enviosQ = client
    .from("message_logs")
    .select("lead_id, template_id, campaign_id, vendedor_id")
    .eq("evento", "enviado");
  let chipsQ = client.from("chips").select("*").eq("ativo", true);
  if (scope) {
    leadsQ = leadsQ.eq("vendedor_id", scope);
    enviosQ = enviosQ.eq("vendedor_id", scope);
    chipsQ = chipsQ.eq("vendedor_id", scope);
  }

  const [{ data: leads }, { data: envios }, { data: templates }, { data: campaigns }, { data: chips }] =
    await Promise.all([
      leadsQ,
      enviosQ,
      client.from("templates").select("id, nome"),
      client.from("campaigns").select("id, nome, limiar_taxa_resposta"),
      chipsQ,
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

  // ranking por vendedor — só no modo admin (scope null)
  let ranking: any[] | null = null;
  if (scope === null) {
    const { data: vendedores } = await client
      .from("profiles")
      .select("id, nome")
      .eq("role", "vendedor");
    const RESP_ALEM = ["respondeu", "demo_enviada", "negociacao", "fechado"];
    // leads trabalhados = já saíram de 'novo'
    const porVend = new Map<string, { trabalhados: number; responderam: number; fechados: number }>();
    for (const l of leads ?? []) {
      if (!l.vendedor_id) continue;
      if (!porVend.has(l.vendedor_id))
        porVend.set(l.vendedor_id, { trabalhados: 0, responderam: 0, fechados: 0 });
      const a = porVend.get(l.vendedor_id)!;
      if (l.stage !== "novo") a.trabalhados++;
      if (RESP_ALEM.includes(l.stage)) a.responderam++;
      if (l.stage === "fechado") a.fechados++;
    }
    ranking = (vendedores ?? [])
      .map((v) => {
        const a = porVend.get(v.id) ?? { trabalhados: 0, responderam: 0, fechados: 0 };
        return {
          id: v.id,
          nome: v.nome,
          trabalhados: a.trabalhados,
          taxaResposta: a.trabalhados ? Math.round((a.responderam / a.trabalhados) * 1000) / 10 : 0,
          taxaFechamento: a.trabalhados ? Math.round((a.fechados / a.trabalhados) * 1000) / 10 : 0,
          fechados: a.fechados,
        };
      })
      .sort((a, b) => b.fechados - a.fechados || b.taxaResposta - a.taxaResposta);
  }

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
    ranking,
  });
}
