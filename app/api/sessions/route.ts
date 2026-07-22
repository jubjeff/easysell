import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import {
  getSettings,
  getChip,
  effectiveDailyLimit,
  sentCounts,
  sentCountsDm,
  inSendWindow,
} from "@/lib/limits";
import { generateUniqueMessage } from "@/lib/spin";
import { normalizeText } from "@/lib/text";
import { requireUser } from "@/lib/auth";
import { withJsonError } from "@/lib/api";
import { getLeadsJaResolvidos } from "@/lib/campaigns";
import { Campaign, Chip, Demo, Lead, Template } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET: sessão ativa/pausada do vendedor logado (se houver) com fila e leads. */
export const GET = withJsonError(async function GET() {
  const me = await requireUser();
  const client = db();
  const { data: session } = await client
    .from("dispatch_sessions")
    .select("*, campaigns(*), chips(*)")
    .eq("vendedor_id", me.id)
    .in("status", ["ativa", "pausada"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return NextResponse.json({ session: null });

  const { data: queue } = await client
    .from("queue_items")
    .select("*, leads(*), templates(nome, variante), demos(nicho)")
    .eq("session_id", session.id)
    .order("posicao");

  const settings = await getSettings(me.id);
  const isDm = session.tipo === "instagram_dm";
  const counts = isDm ? await sentCountsDm(me.id) : await sentCounts(session.chip_id);
  const diario = isDm ? settings.dm_limite_diario : effectiveDailyLimit(session.chips, session.tipo, settings);
  return NextResponse.json({
    session,
    queue: queue ?? [],
    limits: { diario, ...counts },
  });
});

/** POST: cria sessão + monta a fila do dia com mensagens geradas. */
export const POST = withJsonError(async function POST(req: NextRequest) {
  const me = await requireUser();
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
  const sessionType =
    tipo === "aquecimento" ? "aquecimento" : tipo === "instagram_dm" ? "instagram_dm" : "disparo";
  const isDm = sessionType === "instagram_dm";

  const client = db();
  const settings = await getSettings(me.id);

  // chip só existe no canal WhatsApp — DM usa a própria conta de Instagram do vendedor
  let chip: Chip | null = null;
  if (!isDm) {
    chip = chip_id ? await getChip(chip_id) : null;
    if (!chip) return NextResponse.json({ error: "Selecione um chip." }, { status: 400 });
    if (chip.vendedor_id !== me.id) {
      return NextResponse.json({ error: "Esse chip não é seu." }, { status: 403 });
    }
    if (!chip.ativo) {
      return NextResponse.json({ error: "Esse chip está desativado." }, { status: 422 });
    }
    // gate de maturação: chip em maturação NUNCA dispara para contato frio
    if (chip.maturando) {
      const { count } = await client
        .from("maturation_days")
        .select("id", { count: "exact", head: true })
        .eq("chip_id", chip.id)
        .eq("congelou", false);
      const totalDias = Math.max(14, Number(settings.maturacao_dias) || 21);
      const dia = Math.min((count ?? 0) + 1, totalDias);
      return NextResponse.json(
        {
          error:
            `Este chip ainda está em maturação (Dia ${dia}/${totalDias}). ` +
            "Usar agora aumenta muito o risco de banimento. Conclua o ciclo na aba Maturação.",
          code: "em_maturacao",
        },
        { status: 422 }
      );
    }
  }

  // janela de envio — mesma cautela vale para DM (canal também manual, mesmo risco de parecer bot)
  const janela = inSendWindow(settings);
  if (!janela.ok && !override_janela) {
    return NextResponse.json({ error: janela.motivo, code: "fora_da_janela" }, { status: 422 });
  }

  // sessão já aberta (deste vendedor) — 1 sessão por vez, de qualquer tipo
  const { data: aberta } = await client
    .from("dispatch_sessions")
    .select("id")
    .eq("vendedor_id", me.id)
    .in("status", ["ativa", "pausada"])
    .limit(1)
    .maybeSingle();
  if (aberta) {
    return NextResponse.json(
      { error: "Você já tem uma sessão aberta. Encerre-a antes de criar outra." },
      { status: 409 }
    );
  }

  // limite diário: do chip (WhatsApp) ou do teto de DM configurado (Instagram)
  const limite = isDm ? settings.dm_limite_diario : effectiveDailyLimit(chip!, sessionType, settings);
  const hoje = isDm ? (await sentCountsDm(me.id)).hoje : (await sentCounts(chip!.id)).hoje;
  const restante = limite - hoje;
  if (restante <= 0) {
    return NextResponse.json(
      {
        error: isDm
          ? `Limite diário de DM atingido (${limite} mensagens).`
          : `Limite diário do chip "${chip!.nome}" atingido (${limite} mensagens).`,
        code: "limite_atingido",
      },
      { status: 422 }
    );
  }

  // campanha (nicho + cidade)
  const { data: campaign } = await client
    .from("campaigns")
    .select("*")
    .eq("id", campaign_id)
    .single();
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });

  // conteúdo: templates de WhatsApp (com variantes A/B/C) ou script_dm da demo do nicho
  let templatePadrao: Template | null = null;
  let demo: Demo | null = null;
  if (isDm) {
    const { data: demos } = await client.from("demos").select("*").eq("ativo", true);
    demo =
      (demos ?? []).find((d) => normalizeText(d.nicho) === normalizeText(campaign.nicho)) ?? null;
    if (!demo || !demo.script_dm?.trim()) {
      return NextResponse.json(
        {
          error: `Nenhum script de DM cadastrado para o nicho "${campaign.nicho}". Cadastre em Demos.`,
        },
        { status: 422 }
      );
    }
  } else {
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
    // a fila inicial usa o Template A (padrão); o vendedor troca por B/C/aleatório no card
    templatePadrao = templates.find((t) => t.variante === "A") ?? templates[0];
  }

  // leads elegíveis: stage 'novo', canal certo (whatsapp/instagram_dm), nicho+cidade
  // da campanha (comparação tolerante a acento/caixa), melhores scores primeiro
  const tamanhoFila = Math.min(
    Number(meta_do_dia) || restante,
    restante,
    (campaign as Campaign).limite_diario
  );
  const nichoAlvo = normalizeText(campaign.nicho);
  const cidadeAlvo = normalizeText(campaign.cidade);
  const canalAlvo = isDm ? "instagram_dm" : "whatsapp";
  const [{ data: candidatos }, { data: jaContactados }, leadsJaResolvidos] = await Promise.all([
    client
      .from("leads")
      .select("*")
      .eq("stage", "novo")
      .eq("vendedor_id", me.id)
      .eq("canal_contato_ativo", canalAlvo)
      .order("score", { ascending: false }),
    client.from("contacted_phones").select("telefone"),
    getLeadsJaResolvidos(client),
  ]);
  // números que já receberam mensagem alguma vez NUNCA voltam para a fila de
  // WhatsApp, mesmo que o lead tenha sido excluído/reimportado (não se aplica
  // a DM, que não usa telefone)
  const telefonesBloqueados = new Set((jaContactados ?? []).map((r) => r.telefone));
  const leads = (candidatos ?? [])
    .filter(
      (l) =>
        normalizeText(l.nicho) === nichoAlvo &&
        normalizeText(l.cidade) === cidadeAlvo &&
        (isDm || !telefonesBloqueados.has(l.telefone)) &&
        // já resolvido (enviado/inválido/pulado) numa fila anterior — nunca reentra
        !leadsJaResolvidos.has(l.id)
    )
    .slice(0, tamanhoFila);

  if (!leads || leads.length === 0) {
    return NextResponse.json(
      {
        error: isDm
          ? "Nenhum lead 'Novo' seu para esse nicho/cidade com canal Instagram DM."
          : "Nenhum lead 'Novo' seu para esse nicho/cidade. Peça ao admin para distribuir leads na sua carteira.",
      },
      { status: 422 }
    );
  }

  // cria a sessão (chip_id nulo em DM — Instagram não tem "chip")
  const { data: session, error: sessErr } = await client
    .from("dispatch_sessions")
    .insert({
      vendedor_id: me.id,
      campaign_id,
      chip_id: chip?.id ?? null,
      tipo: sessionType,
      meta_do_dia: tamanhoFila,
      intervalo_min_s: intervalo_min_s ?? 180,
      intervalo_max_s: intervalo_max_s ?? 540,
    })
    .select()
    .single();
  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });

  // gera mensagens únicas e monta a fila ({vendedor_nome} = nome do vendedor logado)
  const usedHashes = new Set<string>();
  const items = (leads as Lead[]).map((lead, i) => {
    const source = isDm ? { corpo: demo!.script_dm!, social_proof: null } : (templatePadrao as Template);
    const { mensagem, hash } = generateUniqueMessage(source, lead, usedHashes, 10, me.nome);
    usedHashes.add(hash);
    return {
      session_id: session.id,
      lead_id: lead.id,
      template_id: isDm ? null : (templatePadrao as Template).id,
      demo_id: isDm ? (demo as Demo).id : null,
      posicao: i + 1,
      mensagem,
      msg_hash: hash,
    };
  });

  const { data: queue, error: qErr } = await client
    .from("queue_items")
    .insert(items)
    .select("*, leads(*), templates(nome, variante), demos(nicho)");
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
        chip_id: chip?.id ?? null,
        vendedor_id: me.id,
        evento: "gerada",
        texto: it.mensagem,
      };
    })
  );

  return NextResponse.json({ session, queue: (queue ?? []).sort((a: any, b: any) => a.posicao - b.posicao) });
});
