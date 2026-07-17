import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getSettings, getChip, effectiveDailyLimit, sentCounts, inSendWindow } from "@/lib/limits";
import { generateUniqueMessage } from "@/lib/spin";
import { normalizeText } from "@/lib/text";
import { Campaign, Lead, Template } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET: retorna a sessão ativa/pausada (se houver) com fila e leads. */
export async function GET() {
  try {
    return await getActiveSession();
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

async function getActiveSession() {
  const client = db();
  const { data: session } = await client
    .from("dispatch_sessions")
    .select("*, campaigns(*), chips(*)")
    .in("status", ["ativa", "pausada"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return NextResponse.json({ session: null });

  const { data: queue } = await client
    .from("queue_items")
    .select("*, leads(*), templates(nome)")
    .eq("session_id", session.id)
    .order("posicao");

  const settings = await getSettings();
  const chip = session.chips;
  const counts = await sentCounts(session.chip_id);
  return NextResponse.json({
    session,
    queue: queue ?? [],
    limits: { diario: effectiveDailyLimit(chip, session.tipo, settings), ...counts },
  });
}

/** POST: cria sessão + monta a fila do dia com mensagens geradas. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    campaign_id,
    chip_id,
    tipo,
    meta_do_dia,
    intervalo_min_s,
    intervalo_max_s,
    override_janela,
  } = body;
  const sessionType = tipo === "aquecimento" ? "aquecimento" : "disparo";

  const client = db();
  const settings = await getSettings();

  const chip = chip_id ? await getChip(chip_id) : null;
  if (!chip) return NextResponse.json({ error: "Selecione um chip." }, { status: 400 });
  if (!chip.ativo) {
    return NextResponse.json({ error: "Esse chip está desativado." }, { status: 422 });
  }

  // janela de envio
  const janela = inSendWindow(settings);
  if (!janela.ok && !override_janela) {
    return NextResponse.json({ error: janela.motivo, code: "fora_da_janela" }, { status: 422 });
  }

  // sessão já aberta?
  const { data: aberta } = await client
    .from("dispatch_sessions")
    .select("id")
    .in("status", ["ativa", "pausada"])
    .limit(1)
    .maybeSingle();
  if (aberta) {
    return NextResponse.json(
      { error: "Já existe uma sessão aberta. Encerre-a antes de criar outra." },
      { status: 409 }
    );
  }

  // limite diário restante do chip (mais conservador ainda se for aquecimento)
  const limite = effectiveDailyLimit(chip, sessionType, settings);
  const { hoje } = await sentCounts(chip.id);
  const restante = limite - hoje;
  if (restante <= 0) {
    return NextResponse.json(
      {
        error: `Limite diário do chip "${chip.nome}" atingido (${limite} mensagens).`,
        code: "limite_atingido",
      },
      { status: 422 }
    );
  }

  // campanha + templates do set
  const { data: campaign } = await client
    .from("campaigns")
    .select("*")
    .eq("id", campaign_id)
    .single();
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });

  const { data: ct } = await client
    .from("campaign_templates")
    .select("templates(*)")
    .eq("campaign_id", campaign_id);
  const templates = (ct ?? [])
    .map((r: any) => r.templates as Template)
    .filter((t) => t && t.ativo);
  if (templates.length === 0) {
    return NextResponse.json(
      { error: "A campanha não tem nenhum template ativo vinculado." },
      { status: 422 }
    );
  }

  // leads elegíveis: stage 'novo', nicho+cidade da campanha (comparação
  // tolerante a acento/caixa — "Maceió" e "Maceio" são o mesmo lugar),
  // melhores scores primeiro
  const tamanhoFila = Math.min(
    Number(meta_do_dia) || restante,
    restante,
    (campaign as Campaign).limite_diario
  );
  const nichoAlvo = normalizeText(campaign.nicho);
  const cidadeAlvo = normalizeText(campaign.cidade);
  const { data: candidatos } = await client
    .from("leads")
    .select("*")
    .eq("stage", "novo")
    .order("score", { ascending: false });
  const leads = (candidatos ?? [])
    .filter(
      (l) => normalizeText(l.nicho) === nichoAlvo && normalizeText(l.cidade) === cidadeAlvo
    )
    .slice(0, tamanhoFila);

  if (!leads || leads.length === 0) {
    return NextResponse.json(
      { error: "Nenhum lead com estágio 'Novo' para esse nicho/cidade. Capte leads primeiro." },
      { status: 422 }
    );
  }

  // cria a sessão
  const { data: session, error: sessErr } = await client
    .from("dispatch_sessions")
    .insert({
      campaign_id,
      chip_id: chip.id,
      tipo: sessionType,
      meta_do_dia: tamanhoFila,
      intervalo_min_s: intervalo_min_s ?? 180,
      intervalo_max_s: intervalo_max_s ?? 540,
    })
    .select()
    .single();
  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });

  // gera mensagens únicas e monta a fila
  const usedHashes = new Set<string>();
  const items = (leads as Lead[]).map((lead, i) => {
    const template = templates[i % templates.length];
    const { mensagem, hash } = generateUniqueMessage(template, lead, usedHashes);
    usedHashes.add(hash);
    return {
      session_id: session.id,
      lead_id: lead.id,
      template_id: template.id,
      posicao: i + 1,
      mensagem,
      msg_hash: hash,
    };
  });

  const { data: queue, error: qErr } = await client
    .from("queue_items")
    .insert(items)
    .select("*, leads(*), templates(nome)");
  if (qErr) {
    await client.from("dispatch_sessions").delete().eq("id", session.id);
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  // log 'gerada' para auditoria
  await client.from("message_logs").insert(
    items.map((it) => {
      const q = (queue ?? []).find((r: any) => r.lead_id === it.lead_id);
      return {
        lead_id: it.lead_id,
        queue_item_id: q?.id,
        campaign_id,
        template_id: it.template_id,
        chip_id: chip.id,
        evento: "gerada",
        texto: it.mensagem,
      };
    })
  );

  return NextResponse.json({ session, queue: (queue ?? []).sort((a: any, b: any) => a.posicao - b.posicao) });
}
