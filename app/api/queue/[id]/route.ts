import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { messageHash } from "@/lib/spin";
import { requireUser, scopeFilter } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * PATCH em um item da fila (só da própria sessão).
 * body.action:
 *  - "enviado" | "numero_invalido" | "pulado": resolve o item (e move o
 *    lead para 'contactado' quando enviado) + grava log
 *  - "copiada": só grava log de cópia
 *  - "editar": body.mensagem substitui o texto (grava log 'editada')
 */
export const PATCH = withJsonError(async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const me = await requireUser();
  const scope = scopeFilter(me);
  const body = await req.json();
  const client = db();

  const { data: item } = await client
    .from("queue_items")
    .select("*, leads(telefone), dispatch_sessions(campaign_id, chip_id, vendedor_id)")
    .eq("id", params.id)
    .single();
  if (!item) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });

  const session = (item as any).dispatch_sessions;
  if (scope && session?.vendedor_id !== scope) {
    return NextResponse.json({ error: "Este item não é seu." }, { status: 403 });
  }
  const logBase = {
    lead_id: item.lead_id,
    queue_item_id: item.id,
    campaign_id: session?.campaign_id ?? null,
    chip_id: session?.chip_id ?? null,
    vendedor_id: session?.vendedor_id ?? null,
    template_id: item.template_id,
  };

  if (body.action === "copiada") {
    await client.from("message_logs").insert({ ...logBase, evento: "copiada", texto: item.mensagem });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "editar") {
    const mensagem = String(body.mensagem ?? "").trim();
    if (!mensagem) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    const { data: updated, error } = await client
      .from("queue_items")
      .update({ mensagem, msg_hash: messageHash(mensagem), editada: true })
      .eq("id", params.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await client.from("message_logs").insert({ ...logBase, evento: "editada", texto: mensagem });
    return NextResponse.json({ item: updated });
  }

  if (["enviado", "numero_invalido", "pulado"].includes(body.action)) {
    const { data: updated, error } = await client
      .from("queue_items")
      .update({ status: body.action, resolved_at: new Date().toISOString() })
      .eq("id", params.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (body.action === "enviado") {
      await client
        .from("leads")
        .update({
          stage: "contactado",
          stage_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.lead_id);
      // registro permanente: esse número nunca mais entra em fila de disparo
      const telefone = (item as any).leads?.telefone;
      if (telefone) {
        await client
          .from("contacted_phones")
          .upsert({ telefone }, { onConflict: "telefone", ignoreDuplicates: true });
      }
    }
    await client
      .from("message_logs")
      .insert({ ...logBase, evento: body.action, texto: item.mensagem });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
});
