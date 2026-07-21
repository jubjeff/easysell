import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { generateUniqueMessage } from "@/lib/spin";
import { requireUser, scopeFilter } from "@/lib/auth";
import { withJsonError } from "@/lib/api";
import { Lead, Template, Demo } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST: regenera a variação da mensagem deste item da fila (só da própria sessão).
 * body opcional { template_id }: troca o template usado (seletor A/B/C, só faz
 * sentido em itens de WhatsApp) e passa a valer para este item; sem body =
 * regenera com a fonte atual (template ou, em item de DM, o script_dm da demo).
 */
export const POST = withJsonError(async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const me = await requireUser();
  const scope = scopeFilter(me);
  const client = db();

  const body = await req.json().catch(() => ({}));
  const novoTemplateId = body?.template_id as string | undefined;

  const { data: item } = await client
    .from("queue_items")
    .select("*, leads(*), templates(*), demos(*), dispatch_sessions(campaign_id, chip_id, vendedor_id)")
    .eq("id", params.id)
    .single();
  if (!item) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });

  const session = (item as any).dispatch_sessions;
  if (scope && session?.vendedor_id !== scope) {
    return NextResponse.json({ error: "Este item não é seu." }, { status: 403 });
  }

  const isDm = Boolean(item.demo_id);
  let source: Pick<Template, "corpo" | "social_proof">;
  let templateId: string | null = item.template_id;

  if (isDm) {
    // DM não tem seletor de variante — regenera com o mesmo script_dm do nicho
    const demo = (item as any).demos as Demo;
    source = { corpo: demo?.script_dm ?? "", social_proof: null };
  } else {
    let template = item.templates as Template;
    if (novoTemplateId && novoTemplateId !== item.template_id) {
      const { data: t } = await client
        .from("templates")
        .select("*")
        .eq("id", novoTemplateId)
        .maybeSingle();
      if (!t) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
      template = t as Template;
    }
    source = template;
    templateId = template.id;
  }

  // hashes já usados na sessão (exceto o próprio item)
  const { data: siblings } = await client
    .from("queue_items")
    .select("id, msg_hash")
    .eq("session_id", item.session_id);
  const usedHashes = new Set<string>(
    (siblings ?? []).filter((s) => s.id !== item.id).map((s) => s.msg_hash)
  );

  const { mensagem, hash } = generateUniqueMessage(
    source,
    item.leads as Lead,
    usedHashes,
    10,
    me.nome
  );

  const { data: updated, error } = await client
    .from("queue_items")
    .update({ mensagem, msg_hash: hash, template_id: templateId, editada: false })
    .eq("id", params.id)
    .select("*, templates(nome, variante), demos(nicho)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await client.from("message_logs").insert({
    lead_id: item.lead_id,
    queue_item_id: item.id,
    campaign_id: session?.campaign_id ?? null,
    chip_id: session?.chip_id ?? null,
    vendedor_id: session?.vendedor_id ?? null,
    template_id: templateId,
    evento: "regenerada",
    texto: mensagem,
  });

  return NextResponse.json({ item: updated });
});
